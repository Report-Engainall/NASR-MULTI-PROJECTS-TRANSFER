#!/usr/bin/env python3
"""Audit the published Bolt recovery ZIPs in an isolated GitHub Actions runner."""
from __future__ import annotations
import argparse, csv, difflib, hashlib, io, json, os, re, stat, tempfile, time, urllib.request
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "bolt-recovery-reconciliation"
SOURCE_REPO = "Report-Engainall/report-insight-engine"
SOURCE_COMMIT = "b1ca62ec277ff9f55c8e850e0470d61d81aaa138"
ARCHIVES = [
    ("NASR1-BOLT-RECOVERY-01", "Nasr1_Bolt_Before_Failure.zip", 1003172, "7c35f3ecde19dc5596fd22053be61924ef3d5318"),
    ("NASR1-BOLT-RECOVERY-02", "Nasr1_Bolt_Restored_Current.zip", 997589, "f01684a56e093a33a173b0965d1d7239c48f0936"),
]
MAX_MEMBERS = 50000
MAX_MEMBER_BYTES = 250 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MAX_RATIO = 1000
SECRET_NAMES = {".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"}

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def git_blob_sha1(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def sensitive(name):
    p = PurePosixPath(name)
    low = {part.lower() for part in p.parts}
    return (bool(low & SECRET_NAMES) or p.name.lower().startswith(".env.") or
            p.suffix.lower() in {".pem", ".p12", ".pfx", ".key"} or
            any(x in p.name.lower() for x in ("service-account", "private-key", "access-token", "password", "set_admin", "grant_admin_role")))

def safe_name(name):
    if not name or "\x00" in name or "\\" in name:
        raise ValueError("empty, NUL, or backslash member path: " + repr(name))
    p = PurePosixPath(name)
    if p.is_absolute() or re.match(r"^[A-Za-z]:", name) or any(x in (".", "..") for x in p.parts) or not p.parts:
        raise ValueError("absolute or traversal member path: " + name)
    return p

def validate_zip(zf):
    infos = zf.infolist()
    if len(infos) > MAX_MEMBERS:
        raise ValueError("member count limit exceeded: " + str(len(infos)))
    names, folded, total = set(), set(), 0
    for info in infos:
        path = safe_name(info.filename).as_posix().rstrip("/")
        if path in names:
            raise ValueError("duplicate ZIP member: " + path)
        if path.casefold() in folded:
            raise ValueError("case-fold path collision: " + path)
        names.add(path); folded.add(path.casefold())
        mode = (info.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(mode):
            raise ValueError("symbolic link blocked: " + path)
        if info.flag_bits & 1:
            raise ValueError("encrypted entry blocked: " + path)
        if info.file_size > MAX_MEMBER_BYTES:
            raise ValueError("member exceeds size limit: " + path)
        total += info.file_size
        if total > MAX_TOTAL_BYTES:
            raise ValueError("uncompressed archive exceeds size limit")
        if info.file_size and not info.compress_size:
            raise ValueError("invalid compressed size: " + path)
        if info.compress_size and info.file_size / info.compress_size > MAX_RATIO:
            raise ValueError("compression ratio limit exceeded: " + path)
    bad = zf.testzip()
    if bad:
        raise ValueError("zipfile.testzip CRC/decompression error at: " + bad)
    return infos

def safe_extract(zf, infos, destination):
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    for info in infos:
        relative = safe_name(info.filename)
        target = destination.joinpath(*relative.parts)
        resolved = target.resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError("resolved path escapes temp extraction root: " + info.filename)
        if info.is_dir() or info.filename.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info) as source, target.open("xb") as output:
            count = 0
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk: break
                count += len(chunk)
                output.write(chunk)
        if count != info.file_size:
            raise ValueError("extracted size mismatch: " + info.filename)

def read_bounded_response(response, expected_size):
    """Read at most expected_size + 1 bytes and require the pinned ZIP size."""
    if not isinstance(expected_size, int) or expected_size <= 0:
        raise ValueError("invalid pinned archive size")
    header = response.headers.get("Content-Length")
    if header:
        try:
            advertised = int(header)
        except (TypeError, ValueError):
            raise ValueError("invalid Content-Length header: " + repr(header))
        if advertised != expected_size:
            raise ValueError("Content-Length mismatch: {} != pinned {}".format(advertised, expected_size))
    parts = []
    total = 0
    while total <= expected_size:
        chunk = response.read(min(64 * 1024, expected_size + 1 - total))
        if not chunk:
            break
        if not isinstance(chunk, bytes):
            raise ValueError("archive response returned non-byte content")
        parts.append(chunk)
        total += len(chunk)
        if total > expected_size:
            raise ValueError("download exceeded pinned archive size: >{}".format(expected_size))
    if total != expected_size:
        raise ValueError("download size mismatch: {} != pinned {}".format(total, expected_size))
    return b"".join(parts)


def download(spec):
    archive_id, name, size, expected_blob = spec
    url = "https://raw.githubusercontent.com/{}/{}/{}/{}".format(
        SOURCE_REPO, SOURCE_COMMIT,
        "incoming-archives/nasr1-bolt-recovery-2026-10-17", name
    )
    last = ""
    for attempt in range(1, 4):
        print("DOWNLOAD_ATTEMPT archive={} attempt={} url={}".format(name, attempt, url), flush=True)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nasr1-Bolt-Reconciliation/1.0"})
            with urllib.request.urlopen(req, timeout=45) as response:
                data = read_bounded_response(response, size)
                print("DOWNLOAD_RESPONSE archive={} status={} bytes={} content_type={}".format(
                    name, response.status, len(data), response.headers.get("Content-Type", "")), flush=True)
            return data, url, ""
        except Exception as exc:
            last = "{}: {}".format(type(exc).__name__, exc)
            print("DOWNLOAD_ERROR archive={} attempt={} url={} error={}".format(name, attempt, url, last), flush=True)
            if attempt < 3: time.sleep(attempt)
    return None, url, last

def write_csv(path, fields, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

def summary_md(obj, pair_rows, ready_rows, member_rows):
    lines = [
        "# Nasr1 Bolt recovery reconciliation",
        "",
        "Target: Report-Engainall/Nasr1 / main",
        "Target SHA: " + os.environ.get("GITHUB_SHA", "unknown"),
        "Pinned source: " + SOURCE_REPO + "@" + SOURCE_COMMIT,
        "READY_TO_REUSE rows audited by content hash: " + str(len(ready_rows)),
        "Archive member rows: " + str(len(member_rows)),
        "",
        "## Archive downloads and integrity",
    ]
    for a in obj["archives"]:
        lines.append("- {}: {}".format(a["observed_name"], a["status"]))
        for key in ("actual_bytes", "sha256", "git_blob_sha1", "members", "exact_error"):
            if a.get(key): lines.append("  - {}: {}".format(key, a[key]))
    lines.extend(["", "## Archive pair comparison"])
    counts = Counter(r["comparison"] for r in pair_rows)
    for k, v in sorted(counts.items()): lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## Member decisions"])
    for k, v in sorted(Counter(r["target_decision"] for r in member_rows).items()):
        lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## READY_TO_REUSE path/hash audit"])
    for k, v in sorted(Counter(r["decision"] for r in ready_rows).items()):
        lines.append("- {}: {}".format(k, v))
    lines.extend(["", "## Non-identical archive paths"])
    for r in pair_rows:
        if r["comparison"] != "IDENTICAL_CONTENT":
            lines.append("- {}: {}".format(r["comparison"], r["normalized_path"]))
    lines.extend(["", "## Missing or different staged/active source paths"])
    for r in ready_rows:
        if r["decision"] != "ALREADY_PRESENT_EXACT":
            lines.append("- {} | source={}:{} | staged={}".format(
                r["decision"], r["source_repository"], r["source_path"], r["staged_path"]))
    lines.extend(["", "## Errors"])
    lines.extend(["- " + e for e in obj["errors"]] or ["- None"])
    lines.append("")
    return "\n".join(lines)

def self_test():
    assert sha256(b"abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    assert git_blob_sha1(b"") == "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
    assert safe_name("project/src/main.ts").as_posix() == "project/src/main.ts"
    for candidate in ("../escape", "/etc/passwd", "C:/secret", "project/../../escape", "project\\file", ""):
        try: safe_name(candidate)
        except ValueError: continue
        raise AssertionError("unsafe member accepted: " + repr(candidate))
    class FakeResponse:
        def __init__(self, payload, headers=None):
            self.payload = payload
            self.offset = 0
            self.headers = headers or {}
            self.read_sizes = []
        def read(self, size=-1):
            assert size >= 0, "bounded reader must never request an unbounded read"
            self.read_sizes.append(size)
            chunk = self.payload[self.offset:self.offset + size]
            self.offset += len(chunk)
            return chunk

    exact = FakeResponse(b"abcdef", {"Content-Length": "6"})
    assert read_bounded_response(exact, 6) == b"abcdef"
    assert all(size > 0 for size in exact.read_sizes)
    for response, expected in (
        (FakeResponse(b"abcdefg", {"Content-Length": "7"}), 6),
        (FakeResponse(b"abc", {}), 6),
        (FakeResponse(b"abcdef", {"Content-Length": "not-a-number"}), 6),
    ):
        try:
            read_bounded_response(response, expected)
        except ValueError:
            continue
        raise AssertionError("bounded archive reader accepted size/header mismatch")

    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project/src/ok.ts", "export const ok = true;\n")
    with zipfile.ZipFile(io.BytesIO(b.getvalue())) as z:
        assert len(validate_zip(z)) == 1
        assert z.read("project/src/ok.ts") == b"export const ok = true;\n"
    print("SELF_TEST PASS: SHA-256, Git blob SHA-1, CRC/decompression, path traversal rejection", flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    archive_rows, member_rows, pair_rows, errors = [], [], [], []
    content_by_archive, extracted_by_archive, review_text_by_archive = {}, {}, {}
    with tempfile.TemporaryDirectory(prefix="nasr1-bolt-recovery-", dir=os.environ.get("RUNNER_TEMP")) as tmp:
        temp = Path(tmp)
        for spec in ARCHIVES:
            archive_id, name, expected_size, expected_blob = spec
            data, url, download_error = download(spec)
            row = {"archive_id": archive_id, "observed_name": name, "reported_bytes": expected_size,
                   "reported_source": url, "git_blob_sha1": expected_blob, "sha256": "",
                   "status": "", "extraction_directory": "", "notes": ""}
            if data is None:
                row["status"] = "DOWNLOAD_FAILED"
                row["notes"] = "URL={}; exact_error={}; retries=3".format(url, download_error)
                row["exact_error"] = download_error
                archive_rows.append(row)
                errors.append(name + " download failed: " + download_error)
                continue
            actual_size = len(data)
            actual_hash = sha256(data)
            actual_blob = git_blob_sha1(data)
            row["reported_bytes"] = actual_size
            row["sha256"] = actual_hash
            print("ARCHIVE_BYTES name={} actual_bytes={} sha256={} git_blob_sha1={}".format(
                name, actual_size, actual_hash, actual_blob), flush=True)
            if actual_size != expected_size:
                errors.append("{} size mismatch: {} != {}".format(name, actual_size, expected_size))
            if actual_blob != expected_blob:
                errors.append("{} Git blob SHA-1 mismatch: {} != {}".format(name, actual_blob, expected_blob))
            target_dir = temp / archive_id
            try:
                with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                    infos = validate_zip(zf)
                    safe_extract(zf, infos, target_dir)
                    file_map, member_count = {}, 0
                    review_text_by_archive[archive_id] = {}
                    for info in infos:
                        raw = safe_name(info.filename).as_posix()
                        if info.is_dir() or raw.endswith("/"):
                            continue
                        p = target_dir.joinpath(*PurePosixPath(raw).parts)
                        payload = p.read_bytes()
                        digest = sha256(payload)
                        kind = ("EXCLUDED_SECURITY" if sensitive(raw) else
                                "SOURCE_OR_TEXT" if p.suffix.lower() in {
                                    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
                                    ".md", ".mdx", ".css", ".html", ".sql", ".yml", ".yaml",
                                    ".toml", ".txt", ".csv", ".svg", ".sh", ".ps1", ".py"
                                } else "BINARY_OR_ASSET")
                        file_map[raw] = {"sha256": digest, "size": len(payload), "kind": kind}
                        member_rows.append({
                            "archive_id": archive_id, "member_path": raw, "size_bytes": len(payload),
                            "sha256": digest, "kind": kind, "extraction_status": "EXTRACTED_TO_TEMP_OUTSIDE_APP",
                            "target_decision": "PENDING", "notes": "Member not executed; payload not committed."
                        })
                        member_count += 1
                        if kind == "SOURCE_OR_TEXT" and len(payload) <= 300000:
                            review_text_by_archive[archive_id][raw] = payload.decode("utf-8", errors="replace")
                    content_by_archive[archive_id] = file_map
                    extracted_by_archive[archive_id] = target_dir
                    row["status"] = "DOWNLOADED_SHA256_CRC_AND_SAFE_EXTRACTION_PASS"
                    row["extraction_directory"] = "Temporary runner directory outside app; deleted at job end"
                    row["notes"] = "actual_bytes={}; sha256={}; actual_git_blob_sha1={}; members={}; CRC/decompression PASS".format(
                        actual_size, actual_hash, actual_blob, member_count)
                    row["actual_bytes"] = actual_size
                    row["actual_blob_sha1"] = actual_blob
                    row["members"] = member_count
                    print("ZIP_VALIDATION_PASS name={} members={} total_uncompressed_bytes={}".format(
                        name, member_count, sum(i.file_size for i in infos)), flush=True)
            except Exception as exc:
                row["status"] = "INTEGRITY_OR_SAFE_EXTRACTION_FAILED"
                row["exact_error"] = "{}: {}".format(type(exc).__name__, exc)
                row["notes"] = row["exact_error"]
                errors.append(name + " validation failed: " + row["exact_error"])
                print("ZIP_VALIDATION_ERROR name={} error={}".format(name, row["exact_error"]), flush=True)
            archive_rows.append(row)
    pair_map = {}
    common_archive_root = ""
    if len(content_by_archive) == 2:
        root_prefixes = []
        for archive_id, _, _, _ in ARCHIVES:
            paths = list(content_by_archive[archive_id])
            parts = [PurePosixPath(p).parts for p in paths]
            prefix = parts[0][0] if parts and parts[0] else ""
            if prefix and all(len(q) > 1 and q[0] == prefix for q in parts):
                root_prefixes.append(prefix)
            else: root_prefixes.append("")
        common_archive_root = root_prefixes[0] if root_prefixes[0] == root_prefixes[1] else ""
        normalized = []
        for index, (archive_id, _, _, _) in enumerate(ARCHIVES):
            prefix = root_prefixes[index]
            map2 = {}
            for path, value in content_by_archive[archive_id].items():
                p = PurePosixPath(path).parts
                key = PurePosixPath(*p[1:]).as_posix() if prefix and p[0] == prefix and len(p) > 1 else PurePosixPath(path).as_posix()
                map2[key] = value
            normalized.append(map2)
        before, restored = normalized
        for path in sorted(set(before) | set(restored)):
            b, r = before.get(path), restored.get(path)
            decision = "BEFORE_ONLY" if r is None else "RESTORED_ONLY" if b is None else (
                "IDENTICAL_CONTENT" if b["sha256"] == r["sha256"] else "CHANGED_CONTENT")
            pair_rows.append({"normalized_path": path, "before_sha256": b["sha256"] if b else "",
                              "before_size_bytes": b["size"] if b else "", "restored_sha256": r["sha256"] if r else "",
                              "restored_size_bytes": r["size"] if r else "", "comparison": decision,
                              "security_review_required": "YES" if sensitive(path) else "NO"})
    current_map = {}
    for current, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "dist", ".output", ".next", "coverage", ".tanstack"}]
        for filename in files:
            p = Path(current) / filename
            try: current_map[p.relative_to(ROOT).as_posix()] = p.read_bytes()
            except OSError: pass
    manifest_path = ROOT / "docs/bolt-source-reconciliation/READY_TO_REUSE/PROVENANCE_MANIFEST.csv"
    ready_rows = []
    if manifest_path.is_file():
        with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for record in csv.DictReader(handle):
                staged_path = record["staged_path"]
                staged_bytes = current_map.get(staged_path)
                target_bytes = current_map.get(record["source_path"])
                staged_hash = git_blob_sha1(staged_bytes) if staged_bytes is not None else ""
                target_hash = git_blob_sha1(target_bytes) if target_bytes is not None else ""
                if staged_bytes is None: decision = "STAGED_FILE_MISSING"
                elif staged_hash != record["staged_git_blob_sha"]: decision = "STAGED_BLOB_HASH_MISMATCH"
                elif record["source_git_blob_sha"] != record["staged_git_blob_sha"]: decision = "PROVENANCE_BLOB_MISMATCH"
                elif target_bytes is None: decision = "TARGET_PATH_MISSING_REVIEW_CONTENT"
                elif target_hash == staged_hash: decision = "ALREADY_PRESENT_EXACT"
                else: decision = "TARGET_PATH_DIFFERS_REVIEW_CONTENT"
                ready_rows.append({
                    "source_repository": record["source_repo"], "source_branch": record["source_branch"],
                    "source_commit_sha": record["source_commit_sha"], "source_path": record["source_path"],
                    "staged_path": staged_path, "source_git_blob_sha": record["source_git_blob_sha"],
                    "staged_git_blob_sha_expected": record["staged_git_blob_sha"],
                    "staged_file_exists": "YES" if staged_bytes is not None else "NO",
                    "staged_git_blob_sha_actual": staged_hash,
                    "target_file_exists": "YES" if target_bytes is not None else "NO",
                    "target_git_blob_sha_actual": target_hash, "decision": decision,
                    "test_command": "GitHub Actions path and byte hash audit; semantic integration test still required for non-exact items",
                    "test_result": "HASH_CHECKED_NOT_FULL_SEMANTIC_REVIEW"
                })
    else:
        errors.append("READY_TO_REUSE provenance manifest missing at " + str(manifest_path))
    for row in member_rows:
        path = row["member_path"]
        if row["kind"] == "EXCLUDED_SECURITY":
            row["target_decision"] = "EXCLUDED_SECURITY"
            row["notes"] = "Hash only; do not commit secrets or credentials."
            continue
        parts = PurePosixPath(path).parts
        target_path = PurePosixPath(*parts[1:]).as_posix() if common_archive_root and parts and parts[0] == common_archive_root and len(parts) > 1 else path
        data = current_map.get(target_path)
        if data is None:
            row["target_decision"] = "MISSING_TARGET_CANDIDATE"
            row["notes"] = "normalized_target_path=" + target_path + "; review imports/contracts before integration"
        elif sha256(data) == row["sha256"]:
            row["target_decision"] = "ALREADY_PRESENT_EXACT"
            row["notes"] = "byte-identical target at " + target_path
        else:
            row["target_decision"] = "TARGET_PRESENT_DIFFERENT_CONTENT_REVIEW"
            row["notes"] = "target path exists with different bytes at " + target_path
    # Review-only, redacted diffs for non-sensitive text/source members.
    normalized_review = {}
    for archive_id, texts in review_text_by_archive.items():
        normalized_review[archive_id] = {}
        for raw_path, source_text in texts.items():
            parts = PurePosixPath(raw_path).parts
            normalized_path = PurePosixPath(*parts[1:]).as_posix() if (
                common_archive_root and parts and parts[0] == common_archive_root and len(parts) > 1
            ) else PurePosixPath(raw_path).as_posix()
            normalized_review[archive_id][normalized_path] = source_text
    secret_pattern = re.compile(
        r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
        r"\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|"
        r"sb_secret_[A-Za-z0-9_=-]{20,}|sk-[A-Za-z0-9_-]{25,})\b|"
        r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b"
    )
    redact_pattern = re.compile(
        r"(?im)^(\s*(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|"
        r"DATABASE_URL|PRIVATE_KEY|ACCESS_TOKEN|API_SECRET|ADMIN_PASSWORD)"
        r"\s*[:=]\s*)\S.*$"
    )
    def review_safe(value):
        if secret_pattern.search(value): return None
        return redact_pattern.sub(r"\1[REDACTED]", value)
    source_paths = sorted(set().union(*(set(m) for m in normalized_review.values())), key=lambda p: (0 if p.startswith("src/") or p.startswith("supabase/migrations/") else 1, p)) if normalized_review else []
    review_lines = [
        "# Bolt archive source review (redacted, review only)", "",
        "Target: Report-Engainall/Nasr1/main at " + os.environ.get("GITHUB_SHA", "unknown"),
        "Source: " + SOURCE_REPO + "@" + SOURCE_COMMIT,
        "The archived source below is inspection evidence only; it has not been copied into runtime code.",
        "Credential-bearing files are omitted. Archived SQL is not executed or treated as a production migration.", ""
    ]
    max_review_lines = 25000
    for path in source_paths:
        if sensitive(path) or path.endswith((".lock", ".tsbuildinfo")) or path == "package-lock.json":
            continue
        snippets = []
        for archive_id, _, _, _ in ARCHIVES:
            archive_text = normalized_review.get(archive_id, {}).get(path)
            if archive_text is None: continue
            archive_safe = review_safe(archive_text)
            if archive_safe is None:
                snippets.append((archive_id + " content", None)); continue
            target_bytes = current_map.get(path)
            target_text = target_bytes.decode("utf-8", errors="replace") if target_bytes is not None else None
            target_safe = review_safe(target_text) if target_text is not None else None
            if target_text is not None and target_safe is None:
                snippets.append((archive_id + " vs target", None)); continue
            if target_safe is None:
                lines = list(difflib.unified_diff([], archive_safe.splitlines(),
                    fromfile="Nasr1/main: absent", tofile=archive_id + ": " + path, lineterm=""))
            elif target_safe != archive_safe:
                lines = list(difflib.unified_diff(target_safe.splitlines(), archive_safe.splitlines(),
                    fromfile="Nasr1/main: " + path, tofile=archive_id + ": " + path, lineterm=""))
            else: lines = []
            if lines: snippets.append((archive_id + " vs Nasr1/main", lines))
        before = normalized_review.get(ARCHIVES[0][0], {}).get(path)
        restored = normalized_review.get(ARCHIVES[1][0], {}).get(path)
        if before is not None and restored is not None:
            before_safe, restored_safe = review_safe(before), review_safe(restored)
            if before_safe is None or restored_safe is None:
                snippets.append(("Before vs Restored", None))
            elif before_safe != restored_safe:
                lines = list(difflib.unified_diff(before_safe.splitlines(), restored_safe.splitlines(),
                    fromfile="Before Failure: " + path, tofile="Restored Current: " + path, lineterm=""))
                if lines: snippets.append(("Before vs Restored", lines))
        if not snippets: continue
        review_lines.extend(["## " + path, ""])
        for label, lines in snippets:
            review_lines.append("### " + label)
            if lines is None:
                review_lines.append("[OMITTED: credential-like content detected; not emitted.]")
            else:
                review_lines.extend(lines[:220])
                if len(lines) > 220: review_lines.append("[TRUNCATED: additional lines omitted.]")
            review_lines.append("")
        if len(review_lines) >= max_review_lines:
            review_lines.append("[REPORT TRUNCATED at " + str(max_review_lines) + " lines.]")
            break
    (OUT / "ARCHIVE_SOURCE_REVIEW.md").write_text("\n".join(review_lines) + "\n", encoding="utf-8")
    print("SOURCE_REVIEW_SECTIONS=" + str(sum(1 for line in review_lines if line.startswith("## "))), flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "ARCHIVE_MANIFEST.csv",
        ["archive_id","observed_name","reported_bytes","reported_source","git_blob_sha1","sha256","status","extraction_directory","notes","actual_bytes","actual_blob_sha1","members","exact_error"], archive_rows)
    write_csv(OUT / "ARCHIVE_MEMBERS.csv",
        ["archive_id","member_path","size_bytes","sha256","kind","extraction_status","target_decision","notes"], member_rows)
    write_csv(OUT / "ARCHIVE_PAIR_DIFF.csv",
        ["normalized_path","before_sha256","before_size_bytes","restored_sha256","restored_size_bytes","comparison","security_review_required"], pair_rows)
    write_csv(OUT / "READY_TO_REUSE_FILE_AUDIT.csv",
        ["source_repository","source_branch","source_commit_sha","source_path","staged_path","source_git_blob_sha","staged_git_blob_sha_expected","staged_file_exists","staged_git_blob_sha_actual","target_file_exists","target_git_blob_sha_actual","decision","test_command","test_result"], ready_rows)
    obj = {
        "target_repository": "Report-Engainall/Nasr1", "target_branch": "main",
        "target_sha": os.environ.get("GITHUB_SHA", "unknown"),
        "source_repository": SOURCE_REPO, "source_commit": SOURCE_COMMIT,
        "archives": archive_rows, "archive_member_count": len(member_rows),
        "archive_pair_counts": dict(Counter(r["comparison"] for r in pair_rows)),
        "member_target_decisions": dict(Counter(r["target_decision"] for r in member_rows)),
        "ready_to_reuse_row_count": len(ready_rows),
        "ready_to_reuse_decisions": dict(Counter(r["decision"] for r in ready_rows)),
        "errors": errors,
        "evidence_boundary": "Archive bytes were CRC tested and extracted to temp when status says PASS; archive content was not executed and no SQL applied. Hash/path audit is not semantic integration proof."
    }
    (OUT / "reconciliation-summary.json").write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = summary_md(obj, pair_rows, ready_rows, member_rows)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f: f.write(md + "\n")
    print("RECONCILIATION_SUMMARY=" + json.dumps(obj, ensure_ascii=False, sort_keys=True), flush=True)
    print("REPORT_DIRECTORY=" + str(OUT), flush=True)
    return 1 if errors else 0

if __name__ == "__main__":
    raise SystemExit(main())
