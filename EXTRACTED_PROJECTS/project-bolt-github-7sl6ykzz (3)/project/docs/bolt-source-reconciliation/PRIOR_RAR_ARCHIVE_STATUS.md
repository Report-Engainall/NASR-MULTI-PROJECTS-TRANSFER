# RAR archive report — NOT EXTRACTED / BLOCKED

## Source evidence
- Repository: https://github.com/adnanabderab2016-sys/-7-
- File: `استخرج من كل المشاريع ما ينتج مشروع مكتمل للمتجر الالكتروني .rar`
- Direct file page: https://github.com/adnanabderab2016-sys/-7-/blob/main/%D8%A7%D8%B3%D8%AA%D8%AE%D8%B1%D8%AC%20%D9%85%D9%86%20%D9%83%D9%84%20%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D8%B1%D9%8A%D8%B9%20%D9%85%D8%A7%20%D9%8A%D9%86%D8%AA%D8%AC%20%D9%85%D8%B4%D8%B1%D9%88%D8%B9%20%D9%85%D9%83%D8%AA%D9%85%D9%84%20%D9%84%D9%84%D9%85%D8%AA%D8%AC%D8%B1%20%D8%A7%D9%84%D8%A7%D9%84%D9%83%D8%AA%D8%B1%D9%88%D9%86%D9%8A%20.rar
- GitHub-reported compressed size: **25,811,682 bytes**.
- Git blob identifier: `dd96610641b7f0a7af765b72d406b1553f67f89e` (**Git SHA-1 object ID**, not a computed SHA-256 of the downloaded archive).
- Source commit: `92fac5bdf47d9e670aa98d41a9dbec137eb72f38` (`2026-10-16T16:55:47Z`).
- Recursive tree contains one file (the RAR); file data was not successfully downloaded to local workspace in this run. SHA-256 therefore **NOT AVAILABLE**.

## Seven root directory names from the task document — unverified until archive extraction
1. `project-bolt-github-7wyze9ut (2)`
2. `project-bolt-github-7wyze9ut (3)`
3. `project-bolt-github-myh797q4 (3)`
4. `project-bolt-github-myh797q4 (4)`
5. `project-bolt-github-xgpah6kz`
6. `project-bolt-github-xgpah6kz (1)`
7. `project-bolt-sb1-b5g7dtki (1)`

These names and earlier extraction observations come from the provided task document. They were **not independently reproduced** because the archive bytes could not be obtained here. The task document mentions a previous tool trial reporting 1,087 extracted ordinary files, 62 extraction failures, and a 7z compression-method warning; these are historical user-supplied observations, not a result of this run.

## This run's actual result
- Archive source record found: **YES**.
- Binary downloaded: **NO**.
- RAR version/method identified: **NO**.
- Archive integrity test: **NOT RUN**.
- Extraction attempted: **NO**.
- Seven folders independently indexed or diffed: **0 of 7**.
- Extracted files / failed files this run: **not measurable; no extraction occurred**.

## Required next step
Run in an environment that can download the public raw GitHub file (or attach the original RAR to the conversation), then record its SHA-256 and actual bytes. Use a current RAR5-capable tool such as an up-to-date `7zz`/`unar` matching the archive's compression method; test and extract to seven isolated folders; record each extraction failure and try recovery from other source snapshots. Do not mark the unified package complete until that is done.
