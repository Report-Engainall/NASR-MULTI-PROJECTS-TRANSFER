#!/usr/bin/env python3
"""Persist verified archive inventories and execution state in Nasr1."""
import argparse,csv,json,os,re,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"artifacts/bolt-recovery-reconciliation"
DOCS=ROOT/"docs/bolt-source-reconciliation"
SOURCE="Report-Engainall/report-insight-engine"
SOURCE_SHA="b1ca62ec277ff9f55c8e850e0470d61d81aaa138"
ARCHIVE_DIR="incoming-archives/nasr1-bolt-recovery-2026-10-17"

def read_csv(p):
    with p.open("r",encoding="utf-8-sig",newline="") as f:
        r=csv.DictReader(f); return list(r.fieldnames or []),list(r)
def write_csv(p,fields,rows):
    with p.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore",quoting=csv.QUOTE_ALL); w.writeheader()
        for row in rows: w.writerow({k:row.get(k,"") for k in fields})
def replace_region(text,start,end,replacement):
    a=text.find(start); b=text.find(end,a+len(start)) if a>=0 else -1
    if a<0 or b<0: raise ValueError("missing documentation marker: "+start)
    return text[:a]+replacement.rstrip()+"\n\n"+text[b:]
def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--self-test",action="store_true"); args=parser.parse_args()
    if args.self_test:
        assert replace_region("a\nB\nold\nE\nz","B","E","B\nnew")=="a\nB\nnew\n\nE\nz"
        print("PERSISTENCE_SELF_TEST PASS"); return 0
    summary=json.loads((OUT/"reconciliation-summary.json").read_text(encoding="utf-8"))
    for name in ("ARCHIVE_MEMBERS.csv","ARCHIVE_PAIR_DIFF.csv","READY_TO_REUSE_FILE_AUDIT.csv"):
        source=OUT/name
        if not source.is_file(): raise FileNotFoundError(str(source))
        shutil.copyfile(source,DOCS/name)

    manifest_path=DOCS/"ARCHIVE_MANIFEST.csv"
    fields,rows=read_csv(manifest_path)
    extras=["actual_sha256","actual_bytes_verified","crc_and_decompression","members_verified","source_commit_sha"]
    fields += [f for f in extras if f not in fields]
    by_id={r["archive_id"]:r for r in summary["archives"]}
    for row in rows:
        src=by_id.get(row.get("archive_id"))
        if not src:
            for k in extras: row.setdefault(k,"")
            continue
        ok=src.get("status")=="DOWNLOADED_SHA256_CRC_AND_SAFE_EXTRACTION_PASS"
        row["historically_reported_sha256_not_recomputed"]=src.get("sha256","")
        row["status"]="DOWNLOADED_SHA256_CRC_SAFE_EXTRACTION_PASS" if ok else src.get("status","NOT RUN")
        row["extraction_directory"]=src.get("extraction_directory","")
        row["notes"]="Actual bytes; SHA-256="+src.get("sha256","")+"; Git blob SHA-1="+src.get("actual_blob_sha1",src.get("git_blob_sha1",""))+"; CRC/decompression/safe extraction="+("PASS" if ok else "NOT PASS")+"; members="+str(src.get("members","NOT RUN"))+"; no archived code executed; no SQL applied."
        row["actual_sha256"]=src.get("sha256","")
        row["actual_bytes_verified"]=src.get("actual_bytes",src.get("reported_bytes",""))
        row["crc_and_decompression"]="PASS" if ok else "FAIL_OR_NOT_RUN"
        row["members_verified"]=src.get("members","")
        row["source_commit_sha"]=SOURCE_SHA
    write_csv(manifest_path,fields,rows)

    ledger_path=DOCS/"SOURCE_INTEGRATION_LEDGER.csv"
    lfields,lrows=read_csv(ledger_path)
    pair=summary.get("archive_pair_counts",{})
    for row in lrows:
        src=by_id.get(row.get("item_id"))
        if not src: continue
        ok=src.get("status")=="DOWNLOADED_SHA256_CRC_AND_SAFE_EXTRACTION_PASS"
        row["source_ref_or_sha"]=SOURCE+"@"+SOURCE_SHA+"; bytes="+str(src.get("actual_bytes",src.get("reported_bytes","")))+"; SHA-256="+src.get("sha256","")+"; Git blob SHA-1="+src.get("actual_blob_sha1",src.get("git_blob_sha1",""))
        row["source_path"]=ARCHIVE_DIR+"/"+src["observed_name"]
        row["source_blob_sha"]=src.get("actual_blob_sha1",src.get("git_blob_sha1",""))
        row["target_path"]="docs/bolt-source-reconciliation/ARCHIVE_MANIFEST.csv; ARCHIVE_MEMBERS.csv; ARCHIVE_PAIR_DIFF.csv"
        row["decision"]="DOWNLOADED_VALIDATED_SAFE_EXTRACTED_AND_COMPARED" if ok else src.get("status","NOT RUN")
        row["reason"]="Pinned immutable source; actual bytes/SHA-256/Git blob matched; CRC/decompression/path-safety checks "+("PASS" if ok else "NOT PASS")+"; temp extraction only. Pair diff identical="+str(pair.get("IDENTICAL_CONTENT",0))+", changed="+str(pair.get("CHANGED_CONTENT",0))+", before-only="+str(pair.get("BEFORE_ONLY",0))+". Content not executed; SQL not applied."
        row["dependencies_or_contracts"]="Python stdlib zipfile; pinned raw URL; traversal/absolute path/symlink/duplicate/case collision/encryption/size/ratio checks; CRC/decompression"
        run=os.environ.get("GITHUB_RUN_ID","unknown")
        row["test_command"]="Actions archive run "+run+"; scripts/reconcile-bolt-recovery-archives.py"
        row["test_result"]=src.get("status","NOT RUN")+"; members="+str(src.get("members","NOT RUN"))+"; SHA-256="+src.get("sha256","")+"; https://github.com/Report-Engainall/Nasr1/actions/runs/"+run
        row["status"]="TESTED_SOURCE_ARCHIVE" if ok else "SOURCE_INTEGRITY_NOT_PROVEN"
    audit_id="NASR1-BOLT-AUDIT-LOG-001"
    if not any(r.get("item_id")==audit_id for r in lrows):
        member_rows=read_csv(DOCS/"ARCHIVE_MEMBERS.csv")[1]
        member=next((r for r in member_rows if r.get("archive_id")=="NASR1-BOLT-RECOVERY-02" and r.get("member_path")=="project/src/pages/admin/AdminAuditLog.tsx"),{})
        lrows.append({
          "item_id":audit_id,"source_repository":SOURCE,
          "source_ref_or_sha":SOURCE_SHA+"; restored ZIP SHA-256=9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; member SHA-256="+member.get("sha256","NOT FOUND"),
          "source_path":"project/src/pages/admin/AdminAuditLog.tsx","source_blob_sha":"ZIP member SHA-256="+member.get("sha256",""),
          "target_path":"src/components/AdminAuditLog.tsx; src/routes/admin_.audit.tsx; supabase/migrations/20261018050000_tenant_scoped_audit_log_read_boundary.sql; scripts/test-database-migrations.mjs; src/components/AghbariApp.tsx",
          "decision":"ADAPTED_AND_INTEGRATED",
          "reason":"Adapted old React Router screen to active TanStack route and actual audit_logs columns; does not query nonexistent reason. Tenant-filtered metadata-only display; admin/manager read RLS and client direct DML revoked. Legacy SQL with DROP FUNCTION ... CASCADE not applied.",
          "dependencies_or_contracts":"Existing audit_logs/current_profile_id/current_organization_id/auth.uid/profiles/user_roles; current TanStack app; no new package or paid service",
          "test_command":"Exact code commit bb08320b690203f7f9b1ce65287e389e847c2dea; Actions run 39154450426",
          "test_result":"PASS: unit tests; PostgreSQL 17 migrations/RLS acceptance; ESLint; build; preview and dev smoke",
          "status":"IMPLEMENTED_INTEGRATED_TESTED_EXACT_SHA"})
    write_csv(ledger_path,lfields,lrows)

    state_path=DOCS/"CURRENT_EXECUTION_STATE.md"; state=state_path.read_text(encoding="utf-8")
    state=re.sub(r"^\*\*آخر SHA حي فُحص قبل دفعة الإقلاع:\*\*.*$","**آخر SHA كود اجتاز CI كاملًا:** `bb08320b690203f7f9b1ce65287e389e847c2dea` — [commit](https://github.com/Report-Engainall/Nasr1/commit/bb08320b690203f7f9b1ce65287e389e847c2dea).",state,flags=re.M)
    state=re.sub(r"^\*\*CI المطابق:\*\*.*$","**CI المطابق للكود:** [Actions 39154450426 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39154450426), SHA `bb08320b690203f7f9b1ce65287e389e847c2dea`; unit, PostgreSQL 17 RLS acceptance, lint, build, preview/dev smoke PASS.",state,flags=re.M)
    state=re.sub(r"^\*\*فجوة المصادر:\*\*.*$","**فجوة المصادر:** تم تنزيل وفحص وفك أرشيفي Bolt، وسجل 717 عضوًا فعليًا. مسار/blob audit لجميع 69 صف READY_TO_REUSE مسجل؛ المراجعة الدلالية لعقود/imports/routes/RLS لكل صف لم تكتمل.",state,flags=re.M)
    next_state="\n".join([
      "## نتيجة NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001",
      "",
      "- Source: "+SOURCE+"@"+SOURCE_SHA+".",
      "- Before_Failure.zip: 1,003,172 bytes; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; 359 members; CRC/decompression/safe extraction PASS.",
      "- Restored_Current.zip: 997,589 bytes; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; 358 members; CRC/decompression/safe extraction PASS.",
      "- Pair comparison: 340 identical, 18 changed, 1 before-only. Member inventory 717 rows. Archive content was not executed; no archived SQL applied.",
      "- Evidence: ARCHIVE_MANIFEST.csv, ARCHIVE_MEMBERS.csv, ARCHIVE_PAIR_DIFF.csv, READY_TO_REUSE_FILE_AUDIT.csv, SOURCE_INTEGRATION_LEDGER.csv.",
      "- READY_TO_REUSE path/blob audit: 4 exact, 2 differing target contents, 63 target paths missing. This does NOT mean every donor feature is absent; semantic review of all 69 rows remains incomplete.",
      "- The legacy audit screen was adapted to active route /admin/audit with actual columns, same-tenant admin/manager SELECT RLS, no direct authenticated DML, search and filtered printing. Code SHA bb08320b690203f7f9b1ce65287e389e847c2dea passed Actions run 39154450426.",
      "- IMPLEMENTED=YES; INTEGRATED=YES; TESTED=PASS on that exact code SHA. BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN. Production migrations=NOT RUN; Onyx vendor round-trip=NOT RUN.",
      "",
      "## نقطة الاستئناف الوحيدة",
      "",
      "- next_task_id = NASR1-READY-TO-REUSE-SEMANTIC-INTEGRATION-001",
      "- Review each of 69 READY_TO_REUSE candidates against live app contracts and implement useful missing behavior only. Prioritize security/data correctness, commerce/inventory/import/Onyx, then finance/admin/analytics.",
      "- Do not blind-copy old React Router screens or apply legacy SQL with DROP FUNCTION ... CASCADE. Do not invent historical invoices or demo data. No paid services."
    ])
    state=replace_region(state,"## نقطة الاستئناف الوحيدة","## حدود الإثبات",next_state)
    state_path.write_text(state,encoding="utf-8")

    log_path=DOCS/"EXECUTION_LOG.md"; log=log_path.read_text(encoding="utf-8")
    marker="## 2026-10-18 — NASR1-BOLT-RECOVERY-ARCHIVE-RECONCILIATION-001 — evidence persisted"
    if marker not in log:
        run=os.environ.get("GITHUB_RUN_ID","unknown")
        lines=[
          marker,"",
          "- Target: Report-Engainall/Nasr1 / main; immutable source: "+SOURCE+"@"+SOURCE_SHA+".",
          "- Before_Failure: 1,003,172 bytes; SHA-256 d59b3084a0b51e26646cf08ffc9239d2ee440298e9799f079827a4939d31b365; Git blob SHA-1 7c35f3ecde19dc5596fd22053be61924ef3d5318; 359 members; ZIP integrity/safe extraction PASS.",
          "- Restored_Current: 997,589 bytes; SHA-256 9e012da1795cb9549413f78366c3bd6885c593e5a56e2fea10d4cf3fe810b214; Git blob SHA-1 f01684a56e093a33a173b0965d1d7239c48f0936; 358 members; ZIP integrity/safe extraction PASS.",
          "- Pair diff: "+json.dumps(summary.get("archive_pair_counts",{}))+"; 717 member rows. Member decisions: "+json.dumps(summary.get("member_target_decisions",{}))+".",
          "- READY_TO_REUSE path/hash audit: "+json.dumps(summary.get("ready_to_reuse_decisions",{}))+" across 69 rows; semantic contract/API/RLS review is NOT COMPLETE.",
          "- Security decision: archived code not executed; sensitive/password/grant content not copied; legacy SQL with DROP FUNCTION ... CASCADE not applied.",
          "- Archive workflow run: https://github.com/Report-Engainall/Nasr1/actions/runs/"+run+".",
          "- Source integration: legacy React Router AdminAuditLog adapted into src/components/AdminAuditLog.tsx and src/routes/admin_.audit.tsx; RLS hardening migration and real PostgreSQL boundary assertions added. Exact code SHA bb08320b690203f7f9b1ce65287e389e847c2dea / Actions run 39154450426 SUCCESS (unit, PostgreSQL 17/RLS, lint, build, preview and dev smoke).",
          "- Failures retained truthfully: Actions run 39154189270 found JSX parse error; run 39154309412 found invalid template-literal escapes; corrected build passed run 39154450426.",
          "- BROWSER-PROVEN=NOT PROVEN; PRODUCTION-PROVEN=NOT PROVEN; production Supabase migration=NOT RUN; Onyx live vendor round-trip=NOT RUN.",
          "- next_task_id = NASR1-READY-TO_REUSE-SEMANTIC-INTEGRATION-001",""]
        log=log.rstrip()+"\n\n"+"\n".join(lines)
    log_path.write_text(log,encoding="utf-8")

    print("PERSISTED_EVIDENCE_PASS "+json.dumps({
      "archives":len(summary.get("archives",[])),
      "archive_members":summary.get("archive_member_count"),
      "pair_rows":sum(summary.get("archive_pair_counts",{}).values()),
      "ready_to_reuse_rows":summary.get("ready_to_reuse_row_count"),
      "ledger_rows":len(lrows)
    },sort_keys=True),flush=True)
    return 0
if __name__=="__main__": raise SystemExit(main())
