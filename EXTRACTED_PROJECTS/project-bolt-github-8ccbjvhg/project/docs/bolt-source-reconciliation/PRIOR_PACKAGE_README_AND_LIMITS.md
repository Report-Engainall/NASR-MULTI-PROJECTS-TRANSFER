# AGHBARI COMMERCE — Unified Source Package (PARTIAL EVIDENCE BUILD)

**Product identity:** متجر الأغبري | Aghbari Commerce.  
**Package status:** `PARTIAL — SOURCE CONTENT AND THE SEVEN-PROJECT RAR WERE NOT MATERIALIZED`.  
**Snapshot date:** 2026-10-16.

## What this ZIP does contain
- Read-only source inventory for all nine repositories specified in the execution mandate, with current access outcomes and tree counts.
- Remote Git blob IDs for selected high-value files, explicitly labeled Git blob SHA-1 (not a SHA-256 hash of downloaded file bytes).
- Tree-level comparisons proving one source tree is an exact copy of canonical main at this snapshot and identifying real divergence in the Report-Engainall snapshot.
- Exact-SHA CI evidence for the current canonical `main` and PR #72 head.
- A copy of the original user execution mandate, source-provenance notes, candidate unique-feature backlog, current conflicts and blockers.
- A SHA-256 manifest for files actually present in this package.

## What this ZIP does not contain
- A complete canonical application checkout or full code snapshots from all branches/repositories.
- The binary RAR, seven extracted projects, or per-file contents from those seven project directories.
- All branches/closed PR patches from the two large repositories.
- Independently verified SHA-256 of the remote RAR, extraction results, local build/test output, or live runtime E2E proof.

The local execution host could read repository metadata, remote recursive tree entries, selected textual source documents, commits, PR metadata and Actions runs through connectors. The current routes did not transfer the binary archive/source repository into the local workspace; do not mistake GitHub metadata access for having downloaded and inspected the actual source bytes.

## Source selection guidance
1. Treat `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d` as the currently documented canonical repository snapshot, not as proven release-ready: its exact-main Actions run fails at lint.
2. Preserve `Report-Engainall/aghbari-store@df3d7dd13276910d90a7273c8ace13e9a74ee277` as a separately versioned Aghbari code source. The tree is not a duplicate; unique paths and blob variations need code-level review.
3. Treat `adnanabderab2016-sys/aghbari-commerce-evolved-algaradi1@main` as a current tree duplicate of canonical main after exact 227/227 path+blob match; do not erase its Git history or use main-tree equivalence as proof all its historical branches are redundant.
4. Hold final selection/merge until the RAR is downloaded, tested and fully diffed; preserve actual files and SHA-256 evidence.
5. Do not combine the separate Report-Advisor/Report-Engainall BI project into Aghbari Commerce. The presence of `Report-Engainall/aghbari-store` in this inventory is only because its repository content identifies itself as Aghbari Commerce.

## Package layout
- `01_SOURCE_INVENTORY/`: repos, refs, trees, RAR and access outcomes.
- `02_CANONICAL_PROJECT/`: explicit marker explaining why no falsely-complete source tree is staged.
- `03_UNIQUE_FEATURES_AND_PATCHES/`: feature candidates to retrieve/reconcile from source refs.
- `04_UNIFIED_SPECIFICATIONS/`: original task mandate and available spec references.
- `05_DATABASE_AND_INTEGRATIONS/`: database and integration source-scan notes.
- `06_TESTS_AND_QUALITY/`: exact-SHA Actions evidence and verification limits.
- `07_DECISIONS_AND_CONFLICTS/`: unresolved branch/source decisions.
- `08_PROVENANCE_AND_CHECKSUMS/`: source lineage and checksum manifest for package files.
- `09_REQUIRED_FOLLOW_UP/`: blockers necessary to complete the full source package.

## Verification
The delivering step tests ZIP integrity and checks every listed packaged file against its SHA-256 manifest. These checks verify this *partial package only*; they do not imply that the RAR or all source repositories were fully acquired or that the store is production-ready.
