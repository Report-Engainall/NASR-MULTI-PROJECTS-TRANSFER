#!/usr/bin/env python3
"""Hash-check, CRC-check, and safely inspect published commerce source-release ZIP snapshots."""
from __future__ import annotations
import csv, hashlib, json, os, re, stat, tempfile, time, urllib.request, zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "source-release-snapshot-audit"
SOURCE = "Report-Engainall/report-insight-engine"
SNAPSHOTS = [
    {"id":"SOURCE-BASELINE-20261016-180443","tag":"commerce-source-reconciliation-20261016-180443","name":"AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip","bytes":55677109,"sha256":"06b575c4a6c5d54a7084162d5416a97a1a5a750c1c51431019c68830afda85ad","tag_commit":"3fadc2b842a89b97bd1798c1cc7985ad256fb498"},
    {"id":"SOURCE-BASELINE-20261016-180756","tag":"commerce-source-reconciliation-20261016-180756","name":"AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip","bytes":56543928,"sha256":"87ad9f91dfea9aee617649888af6aa6e1d8e02b08e5c18824cbae9fd9bdaee21","tag_commit":"5065b51a96abf154d23161e045c450a2583ad97f"},
    {"id":"SOURCE-BASELINE-20261016-181307","tag":"commerce-source-reconciliation-20261016-181307","name":"AGHBARI_COMMERCE_GITHUB_BASELINE_SNAPSHOT.zip","bytes":118952752,"sha256":"28704bf7d32b7f759802682b7873f4b370fc073c54c0fbcb4268f39e37c83499","tag_commit":"dffe66e7e4c7bd1f1ecda9ace8acb83c97f2d8ec"},
    {"id":"NASR1-BOLT-BEFORE-FAILURE-20261017","tag":"incoming-archives/nasr1-bolt-recovery-2026-10-17","name":"Nasr1_Bolt_Before_Failure.zip","bytes":1003172,"sha256":"d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365","tag_commit":"b1ca62ec277ff9f55c8e850e0470d61d81aaa138","url":"https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/b1ca62ec277ff9f55c8e850e0470d61d81aaa138/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Before_Failure.zip"},
    {"id":"NASR1-BOLT-RESTORED-CURRENT-20261017","tag":"incoming-archives/nasr1-bolt-recovery-2026-10-17","name":"Nasr1_Bolt_Restored_Current.zip","bytes":997589,"sha256":"9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214","tag_commit":"b1ca62ec277ff9f55c8e850e0470d61d81aaa138","url":"https://raw.githubusercontent.com/Report-Engainall/report-insight-engine/b1ca62ec277ff9f55c8e850e0470d61d81aaa138/incoming-archives/nasr1-bolt-recovery-2026-10-17/Nasr1_Bolt_Restored_Current.zip"},
]
MAX_ENTRIES=75000
MAX_MEMBER_BYTES=250*1024*1024
MAX_TOTAL_BYTES=2*1024*1024*1024
MAX_RATIO=1000
MAX_EXTRACTED_SOURCE_BYTES=750*1024*1024
MAX_SINGLE_SOURCE_BYTES=25*1024*1024
SOURCE_EXTENSIONS={".ts",".tsx",".js",".jsx",".mjs",".cjs",".py",".sql",".css",".scss",".json",".md",".mdx",".html",".htm",".yml",".yaml",".toml",".xml",".txt",".csv",".sh",".ps1",".svg"}
SENSITIVE_PARTS={".env",".env.local",".env.production",".env.development","id_rsa","id_ed25519","credentials.json","secrets.json"}
SENSITIVE_TOKENS=("password","passwd","private-key","private_key","service-account","service_account","service-role","service_role","access-token","access_token","credential","secret",".env")
SKIP_DIRS={".git","node_modules","dist",".next",".output","coverage",".turbo"}

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def sensitive_path(name):
    p=PurePosixPath(name)
    return any(x.lower() in SENSITIVE_PARTS for x in p.parts) or any(t in p.name.lower() for t in SENSITIVE_TOKENS)

def safe_name(name):
    if not name or "\x00" in name or "\\" in name:
        raise ValueError("empty, NUL-containing, or backslash member path")
    p=PurePosixPath(name)
    if p.is_absolute() or re.match(r"^[A-Za-z]:",name) or any(x in (".","..") for x in p.parts) or not p.parts:
        raise ValueError("absolute, drive-qualified, or traversal member path: "+name)
    return p

def inspect_headers(zf):
    infos=zf.infolist()
    if len(infos)>MAX_ENTRIES: raise ValueError("member count limit exceeded: "+str(len(infos)))
    names=set(); folded=set(); total=0
    for info in infos:
        name=safe_name(info.filename).as_posix().rstrip("/")
        if name in names: raise ValueError("duplicate member path: "+name)
        if name.casefold() in folded: raise ValueError("case-fold path collision: "+name)
        names.add(name); folded.add(name.casefold())
        mode=(info.external_attr>>16)&0xFFFF
        if stat.S_ISLNK(mode): raise ValueError("symbolic link blocked: "+name)
        if info.flag_bits&1: raise ValueError("encrypted ZIP member blocked: "+name)
        if info.file_size>MAX_MEMBER_BYTES: raise ValueError("member size limit: "+name)
        total+=info.file_size
        if total>MAX_TOTAL_BYTES: raise ValueError("archive uncompressed size limit exceeded")
        if info.file_size and info.compress_size==0: raise ValueError("invalid compressed size: "+name)
        if info.compress_size and info.file_size/info.compress_size>MAX_RATIO: raise ValueError("compression ratio limit: "+name)
    return infos,total

def download(spec):
    url=spec.get("url") or f"https://github.com/{SOURCE}/releases/download/{spec['tag']}/{spec['name']}"
    last=""
    for attempt in range(1,4):
        print(f"DOWNLOAD_ATTEMPT id={spec['id']} attempt={attempt} url={url}",flush=True)
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"Nasr1-Source-Release-Audit/1.0"})
            with urllib.request.urlopen(req,timeout=90) as response:
                data=response.read()
                print(f"DOWNLOAD_RESPONSE id={spec['id']} status={response.status} bytes={len(data)} content_type={response.headers.get('Content-Type','')}",flush=True)
            return data,url
        except Exception as error:
            last=f"{type(error).__name__}: {error}"
            print(f"DOWNLOAD_ERROR id={spec['id']} attempt={attempt} url={url} error={last}",flush=True)
            if attempt<3: time.sleep(attempt*2)
    raise RuntimeError(f"download failed for {url}: {last}")

def stream_member(zf,info,destination,extract_root):
    digest=hashlib.sha256(); count=0
    handle=None
    if destination is not None:
        root=extract_root.resolve(); target=destination.resolve()
        if target!=root and root not in target.parents:
            raise ValueError("resolved extraction target escapes temporary root: "+info.filename)
        destination.parent.mkdir(parents=True,exist_ok=True)
        handle=destination.open("xb")
    try:
        with zf.open(info,"r") as source:
            while True:
                chunk=source.read(1024*1024)
                if not chunk: break
                count+=len(chunk); digest.update(chunk)
                if handle is not None: handle.write(chunk)
    finally:
        if handle is not None: handle.close()
    if count!=info.file_size: raise ValueError(f"member size mismatch: {info.filename}:{count}!={info.file_size}")
    return digest.hexdigest(),count

def normalize_member_paths(paths):
    result={}
    rows=[PurePosixPath(p).parts for p in paths]
    tops={row[0] for row in rows if row}
    wrapper=next(iter(tops)) if len(tops)==1 and all(len(row)>1 for row in rows) else None
    for raw in paths:
        parts=PurePosixPath(raw).parts
        candidates=[PurePosixPath(raw).as_posix()]
        for index,part in enumerate(parts):
            if part.lower()=="main" and any("nasr1" in previous.lower() for previous in parts[:index]):
                if index+1<len(parts): candidates.append(PurePosixPath(*parts[index+1:]).as_posix())
            if part in ("Nasr1","Report-Engainall--Nasr1"):
                tail=parts[index+1:]
                if tail and tail[0].lower()=="main": tail=tail[1:]
                if tail: candidates.append(PurePosixPath(*tail).as_posix())
        if wrapper and len(parts)>1: candidates.append(PurePosixPath(*parts[1:]).as_posix())
        result[raw]=next((x for x in candidates if x),raw)
    return result

def write_csv(path,fields,rows):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore",quoting=csv.QUOTE_ALL)
        writer.writeheader(); writer.writerows(rows)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    active={}
    for current,dirs,files in os.walk(ROOT):
        dirs[:]=[x for x in dirs if x not in SKIP_DIRS and x!="artifacts"]
        for name in files:
            p=Path(current)/name
            try: active[p.relative_to(ROOT).as_posix()]=sha256(p.read_bytes())
            except OSError: pass

    manifest=[]; members=[]; pair_diff=[]; target_diff=[]; errors=[]
    all_hashes={}; selected_total=0
    with tempfile.TemporaryDirectory(prefix="nasr1-source-release-",dir=os.environ.get("RUNNER_TEMP")) as temp_name:
        temp_root=Path(temp_name)
        for spec in SNAPSHOTS:
            url=spec.get("url") or f"https://github.com/{SOURCE}/releases/download/{spec['tag']}/{spec['name']}"
            row={"snapshot_id":spec["id"],"tag":spec["tag"],"tag_commit":spec["tag_commit"],"asset_name":spec["name"],"expected_bytes":spec["bytes"],"actual_bytes":"","expected_sha256":spec["sha256"],"actual_sha256":"","source_url":url,"download_status":"NOT RUN","integrity_status":"NOT RUN","member_count":"","uncompressed_bytes":"","selected_source_extract_count":"","status":"","exact_error":""}
            try:
                data,final_url=download(spec); row["source_url"]=final_url
                row["actual_bytes"]=len(data); row["actual_sha256"]=sha256(data); row["download_status"]="DOWNLOADED"
                print(f"SNAPSHOT_BYTES id={spec['id']} actual_bytes={len(data)} sha256={row['actual_sha256']}",flush=True)
                if len(data)!=spec["bytes"]: raise ValueError(f"asset size mismatch:{len(data)}!={spec['bytes']}")
                if row["actual_sha256"]!=spec["sha256"]: raise ValueError("asset SHA-256 mismatch")
                by_path={}; selected=0
                snapshot_root=temp_root/spec["id"]
                with zipfile.ZipFile(__import__("io").BytesIO(data),"r") as zf:
                    infos,total=inspect_headers(zf)
                    row["member_count"]=len(infos); row["uncompressed_bytes"]=total
                    row["integrity_status"]="HEADER_PATH_RATIO_LIMITS_PASS"
                    for info in infos:
                        raw=safe_name(info.filename).as_posix()
                        if info.is_dir() or raw.endswith("/"): continue
                        is_sensitive=sensitive_path(raw)
                        ext=Path(raw).suffix.lower()
                        dest=None
                        if not is_sensitive and ext in SOURCE_EXTENSIONS and info.file_size<=MAX_SINGLE_SOURCE_BYTES and selected_total+info.file_size<=MAX_EXTRACTED_SOURCE_BYTES:
                            dest=snapshot_root.joinpath(*PurePosixPath(raw).parts)
                        try:
                            digest,size=stream_member(zf,info,dest,snapshot_root)
                            if dest is not None: selected+=1; selected_total+=size
                            status="SELECTED_SOURCE_EXTRACTED_TO_TEMP" if dest is not None else ("SENSITIVE_PATH_HASH_ONLY" if is_sensitive else "HASHED_NOT_EXTRACTED")
                            by_path[raw]={"sha256":digest,"size":size,"status":status}
                            members.append({"snapshot_id":spec["id"],"tag":spec["tag"],"member_path":raw,"size_bytes":size,"sha256":digest,"selected_source_extracted":"YES" if dest is not None else "NO","member_status":status})
                        except Exception as error:
                            detail=f"{type(error).__name__}: {error}"
                            errors.append(f"{spec['id']} member {raw}: {detail}")
                            members.append({"snapshot_id":spec["id"],"tag":spec["tag"],"member_path":raw,"size_bytes":info.file_size,"sha256":"","selected_source_extracted":"NO","member_status":"READ_OR_CRC_FAILED:"+detail})
                    row["selected_source_extract_count"]=selected
                    row["integrity_status"]="ALL_MEMBER_DECOMPRESSION_AND_CRC_PASS" if not any(e.startswith(spec["id"]+" member ") for e in errors) else "MEMBER_DECOMPRESSION_OR_CRC_FAILED"
                    row["status"]="SHA256_SIZE_ZIP_CRC_AND_BOUNDED_SOURCE_EXTRACTION_PASS" if row["integrity_status"]=="ALL_MEMBER_DECOMPRESSION_AND_CRC_PASS" else "MEMBER_INTEGRITY_FAILED"
                    all_hashes[spec["id"]]=by_path
                    print(f"SNAPSHOT_ZIP_VALIDATION id={spec['id']} members={len(infos)} uncompressed_bytes={total} extracted_source={selected} status={row['status']}",flush=True)
            except Exception as error:
                detail=f"{type(error).__name__}: {error}"
                errors.append(f"{spec['id']}: {detail}")
                row["status"]="DOWNLOAD_OR_INTEGRITY_FAILED"; row["exact_error"]=detail
                print(f"SNAPSHOT_ERROR id={spec['id']} url={url} error={detail}",flush=True)
            manifest.append(row)

    available=[x["id"] for x in SNAPSHOTS if x["id"] in all_hashes]
    for i,left_id in enumerate(available):
        left=all_hashes[left_id]
        for right_id in available[i+1:]:
            right=all_hashes[right_id]
            for path in sorted(set(left)|set(right)):
                lrow,rrow=left.get(path),right.get(path)
                result="LEFT_ONLY" if rrow is None else "RIGHT_ONLY" if lrow is None else ("IDENTICAL_CONTENT" if lrow["sha256"]==rrow["sha256"] else "CHANGED_CONTENT")
                pair_diff.append({"left_snapshot":left_id,"right_snapshot":right_id,"member_path":path,"left_sha256":lrow["sha256"] if lrow else "","left_size":lrow["size"] if lrow else "","right_sha256":rrow["sha256"] if rrow else "","right_size":rrow["size"] if rrow else "","comparison":result})

    for spec in SNAPSHOTS:
        snapshot_id=spec["id"]; rows=all_hashes.get(snapshot_id,{})
        variants=normalize_member_paths(list(rows))
        for raw,candidate in sorted(variants.items()):
            item=rows[raw]; target_sha=active.get(candidate)
            result="ACTIVE_PATH_IDENTICAL" if target_sha and target_sha==item["sha256"] else ("ACTIVE_PATH_DIFFERENT_CONTENT" if target_sha else "NO_EXACT_ACTIVE_PATH_MATCH")
            target_diff.append({"snapshot_id":snapshot_id,"tag":spec["tag"],"member_path":raw,"normalized_candidate_path":candidate,"snapshot_sha256":item["sha256"],"active_target_exists":"YES" if target_sha else "NO","active_target_sha256":target_sha or "","decision":result,"member_status":item["status"],"note":"Exact path/hash result only; missing match does not prove a feature is absent under a different path or contract."})

    write_csv(OUT/"SOURCE_RELEASE_SNAPSHOT_MANIFEST.csv",list(manifest[0].keys()),manifest)
    write_csv(OUT/"SOURCE_RELEASE_SNAPSHOT_MEMBERS.csv",["snapshot_id","tag","member_path","size_bytes","sha256","selected_source_extracted","member_status"],members)
    write_csv(OUT/"SOURCE_RELEASE_SNAPSHOT_PAIR_DIFF.csv",["left_snapshot","right_snapshot","member_path","left_sha256","left_size","right_sha256","right_size","comparison"],pair_diff)
    write_csv(OUT/"SOURCE_RELEASE_SNAPSHOT_ACTIVE_TARGET_COMPARE.csv",["snapshot_id","tag","member_path","normalized_candidate_path","snapshot_sha256","active_target_exists","active_target_sha256","decision","member_status","note"],target_diff)
    summary={"target_repository":"Report-Engainall/Nasr1","target_branch":"main","target_sha":os.environ.get("GITHUB_SHA","unknown"),"source_repository":SOURCE,"snapshots":manifest,"member_rows":len(members),"pair_diff_rows":len(pair_diff),"active_target_compare_rows":len(target_diff),"pair_diff_counts":dict(Counter(x["comparison"] for x in pair_diff)),"active_target_decisions":dict(Counter(x["decision"] for x in target_diff)),"member_status_counts":dict(Counter(x["member_status"] for x in members)),"selected_source_extract_count":sum(x["member_status"]=="SELECTED_SOURCE_EXTRACTED_TO_TEMP" for x in members),"errors":errors,"evidence_boundary":"Each downloaded asset is checked against published size/SHA-256 metadata. All non-directory members are streamed to EOF for decompression/CRC and path/size/ratio checks. Only bounded non-sensitive source/text files are extracted to temporary runner storage. No code or SQL is executed/applied."}
    (OUT/"SOURCE_RELEASE_SNAPSHOT_SUMMARY.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    counts=lambda data: "\n".join("| "+key+" | "+str(value)+" |" for key,value in sorted(data.items())) or "| None | 0 |"
    report="# Published commerce source-release snapshot ZIP audit\n\n"
    report+="Target: Report-Engainall/Nasr1 / main at "+summary["target_sha"]+"\n\nSource: "+SOURCE+"\n\n"
    report+="## Downloads and integrity\n\n| Snapshot | Bytes | SHA-256 | Members | Extracted source/text | Status | Error |\n|---|---:|---|---:|---:|---|---|\n"
    report+="\n".join("| "+x["snapshot_id"]+" | "+str(x["actual_bytes"])+" | "+str(x["actual_sha256"])+" | "+str(x["member_count"])+" | "+str(x["selected_source_extract_count"])+" | "+x["status"]+" | "+x["exact_error"]+" |" for x in manifest)
    report+="\n\n## Snapshot pair comparison\n\n| Result | Count |\n|---|---:|\n"+counts(Counter(x["comparison"] for x in pair_diff))
    report+="\n\n## Active-tree path/hash comparison\n\n| Result | Count |\n|---|---:|\n"+counts(Counter(x["decision"] for x in target_diff))
    report+="\n\n## Errors\n\n"+("\n".join("- "+e for e in errors) if errors else "- None")
    report+="\n\nNo archived scripts were executed; no migrations or seeded data were applied. Missing exact paths do not prove a feature is absent without semantic API/route/RLS review.\n"
    with open(os.environ["GITHUB_STEP_SUMMARY"],"a",encoding="utf-8") as f: f.write(report+"\n")
    print("SOURCE_RELEASE_AUDIT_SUMMARY="+json.dumps(summary,ensure_ascii=False,sort_keys=True),flush=True)
    print("SOURCE_RELEASE_AUDIT_DIRECTORY="+str(OUT),flush=True)
    return 1 if errors or any(x["status"]!="SHA256_SIZE_ZIP_CRC_AND_BOUNDED_SOURCE_EXTRACTION_PASS" for x in manifest) else 0

if __name__=="__main__": raise SystemExit(main())
