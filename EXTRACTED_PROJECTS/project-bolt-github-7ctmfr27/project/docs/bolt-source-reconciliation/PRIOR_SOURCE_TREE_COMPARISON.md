# Tree-level comparison — evidence and limits

**Basis:** GitHub recursive tree REST responses, not local clone/content-level re-analysis. File identity comparisons use each source's Git blob object SHA, which is not SHA-256. Tree APIs reported `truncated=false` for the four larger trees below.

| Compared sources | Exact same path + blob SHA | Same path, different blob SHA | Left-only paths | Right-only paths | Finding |
|---|---:|---:|---:|---:|---|
| `Aghbari-Technologies/aghbari-commerce-evolved@main` vs `adnanabderab2016-sys/aghbari-commerce-evolved-algaradi1@main` | 227 | 0 | 0 | 0 | Current main trees are exact path/blob matches. Compare historical branches before treating all refs as redundant. |
| canonical vs `Report-Engainall/aghbari-store@main` | 2 | 22 | 203 | 165 | Real divergence. Preserve both source lineages and inspect unique features before consolidation. |
| canonical vs `adnanabderab2016-sys/aladnan-electronics@main` | 0 | 7 | 220 | 62 | Different application snapshot; seven shared paths have different blobs. No automatic merge decision. |
| `Report-Engainall/aghbari-store@main` vs `aladnan-electronics@main` | 4 | 13 | 172 | 52 | Some shared config files, but distinct trees. |

## Counts methodology
- “File” count = entries returned by recursive Git tree API with `type=blob`.
- “Directory” count = entries returned with `type=tree`.
- For canonical and Report versions, recursive trees contain 253 and 213 total entries respectively; none was marked truncated.
- The comparison records only exact remote Git blob object identifiers at the same path. It does not prove semantic equivalence where the same bytes exist under different paths, nor recover the underlying file content to compare runtime behavior.
- No directory or file was removed from an original repository. This work makes no remote mutations.
