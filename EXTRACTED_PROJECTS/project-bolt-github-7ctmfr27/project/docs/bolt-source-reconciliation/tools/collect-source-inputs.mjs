#!/usr/bin/env node
/**
 * Collects read-only working snapshots and Git refs for Aghbari Commerce donors.
 * It does NOT merge files, change databases, push commits, or change source repos.
 * Usage from the repository root:
 *   node docs/bolt-source-reconciliation/tools/collect-source-inputs.mjs
 * Optional output override:
 *   AGHBARI_SOURCE_WORKDIR=/absolute/path node docs/bolt-source-reconciliation/tools/collect-source-inputs.mjs
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, copyFile, writeFile, stat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repositories = [
  "Report-Engainall/Nasr1",
  "Report-Engainall/aghbari-commerce",
  "Report-Engainall/aghbari-store",
  "Report-Engainall/report-insight-engine",
  "Aghbari-Technologies/aghbari-commerce-evolved",
  "Aghbari-Technologies/aghbari-commerce-evolved-algaradi",
  "adnanabderab2016-sys/aghbari-store",
  "adnanabderab2016-sys/aghbari-commerce-evolved-algaradi",
  "adnanabderab2016-sys/aghbari-commerce-evolved-algaradi1",
  "adnanabderab2016-sys/aladnan-electronics",
  "adnanabderab2016-sys/Gradi1",
  "adnanabderab2016-sys/-7-"
];

const stamp = new Date().toISOString().replace(/[.:]/g, "-");
const root = path.resolve(process.env.AGHBARI_SOURCE_WORKDIR || path.join(os.tmpdir(), "aghbari-commerce-source-work-" + stamp));
const mirrorsDir = path.join(root, "mirrors");
const treesDir = path.join(root, "working-trees");
const archivesDir = path.join(root, "archives");
await Promise.all([mkdir(mirrorsDir, { recursive: true }), mkdir(treesDir, { recursive: true }), mkdir(archivesDir, { recursive: true })]);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (part) => out.push(part));
    child.stderr.on("data", (part) => err.push(part));
    child.on("error", (error) => resolve({ code: 127, stdout: Buffer.concat(out).toString("utf8"), stderr: String(error) }));
    child.on("close", (code) => resolve({ code: code === null ? 1 : code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

async function sha256(filePath) {
  const digest = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => digest.update(chunk));
    input.on("error", reject);
    input.on("end", resolve);
  });
  return digest.digest("hex");
}

function safeName(ownerRepo) {
  return ownerRepo.replaceAll("/", "--").replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

async function folderExists(dir) {
  try { return (await stat(dir)).isDirectory(); } catch { return false; }
}

async function addAllPullRequestHeads(mirror) {
  const fetchResult = await run("git", [
    "--git-dir", mirror, "fetch", "--force", "origin",
    "+refs/pull/*/head:refs/reconciliation/pull/*/head"
  ]);
  return { ok: fetchResult.code === 0, details: (fetchResult.stderr || fetchResult.stdout).trim().slice(0, 1600) };
}

async function walk(dir, result = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return result; }
  for (const item of entries) {
    if (item.name === ".git" || item.name === "node_modules" || item.name === "dist" || item.name === "build") continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full, result);
    else if (item.isFile()) result.push(full);
  }
  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  targetRepository: "Report-Engainall/Nasr1",
  outputDirectory: root,
  scope: "read-only source acquisition; no application merge or database mutation",
  repositories: [],
  copiedArchives: [],
  notes: [
    "A failed clone can mean private access or missing Git credentials. No credential or token is written by this script.",
    "Current working-tree snapshots are for source review; the mirror directories preserve Git refs and history available through the remote.",
    "This script does not assert that a source feature is correct or that any app build/tests pass.",
    "The known large 95,377,100-byte ZIP and the second multi-project archive were not present at the paths identified in the prior intake audit. If not found in a downloaded repo/working tree, they remain missing inputs."
  ]
};

for (const repository of repositories) {
  const name = safeName(repository);
  const mirror = path.join(mirrorsDir, name + ".git");
  const workingTree = path.join(treesDir, name);
  const remote = "https://github.com/" + repository + ".git";
  let cloneState = "NOT_STARTED";
  let error = "";
  let pullRefs = { ok: false, details: "not attempted" };

  if (await folderExists(mirror)) {
    const fetch = await run("git", ["--git-dir", mirror, "fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*"]);
    cloneState = fetch.code === 0 ? "UPDATED_EXISTING_MIRROR" : "EXISTING_MIRROR_FETCH_FAILED";
    error = fetch.code === 0 ? "" : (fetch.stderr || fetch.stdout).slice(0, 1600);
  } else {
    const clone = await run("git", ["clone", "--mirror", remote, mirror]);
    cloneState = clone.code === 0 ? "CLONED" : "CLONE_FAILED";
    error = clone.code === 0 ? "" : (clone.stderr || clone.stdout).slice(0, 2000);
  }

  const item = { repository, remote, mirror, workingTree, state: cloneState, error, branches: [], tags: [], pullRequestHeadRefs: [], mainSha: null, pullRefFetch: null };
  if (cloneState === "CLONED" || cloneState === "UPDATED_EXISTING_MIRROR") {
    const sym = await run("git", ["--git-dir", mirror, "symbolic-ref", "HEAD"]);
    const headRef = sym.code === 0 ? sym.stdout.trim() : "";
    const defaultBranch = headRef.startsWith("refs/heads/") ? headRef.slice("refs/heads/".length) : "main";
    const branchResult = await run("git", ["--git-dir", mirror, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const tagResult = await run("git", ["--git-dir", mirror, "for-each-ref", "--format=%(refname) %(objectname)", "refs/tags"]);
    item.defaultBranchFromRemoteHead = defaultBranch;
    item.branches = branchResult.stdout.trim() ? branchResult.stdout.trim().split("\n") : [];
    item.tags = tagResult.stdout.trim() ? tagResult.stdout.trim().split("\n") : [];
    const sha = await run("git", ["--git-dir", mirror, "rev-parse", "refs/heads/" + defaultBranch]);
    item.mainSha = sha.code === 0 ? sha.stdout.trim() : null;

    pullRefs = await addAllPullRequestHeads(mirror);
    item.pullRefFetch = pullRefs;
    const prRefResult = await run("git", ["--git-dir", mirror, "for-each-ref", "--format=%(refname) %(objectname)", "refs/reconciliation/pull"]);
    item.pullRequestHeadRefs = prRefResult.stdout.trim() ? prRefResult.stdout.trim().split("\n") : [];

    if (item.mainSha && !(await folderExists(workingTree))) {
      const localClone = await run("git", ["clone", "--shared", "--no-checkout", mirror, workingTree]);
      if (localClone.code === 0) {
        const checkout = await run("git", ["-C", workingTree, "checkout", "--detach", "origin/" + defaultBranch]);
        item.workingTreeSnapshot = checkout.code === 0 ? "CREATED" : "CHECKOUT_FAILED";
        if (checkout.code !== 0) item.workingTreeError = (checkout.stderr || checkout.stdout).slice(0, 1600);
      } else {
        item.workingTreeSnapshot = "CLONE_FAILED";
        item.workingTreeError = (localClone.stderr || localClone.stdout).slice(0, 1600);
      }
    } else if (await folderExists(workingTree)) {
      item.workingTreeSnapshot = "EXISTS_NOT_OVERWRITTEN";
    } else {
      item.workingTreeSnapshot = "NO_DEFAULT_BRANCH";
    }
  }
  report.repositories.push(item);
  console.log(repository + ": " + item.state + "; branches=" + item.branches.length + "; tags=" + item.tags.length + "; PR-head-refs=" + item.pullRequestHeadRefs.length);
}

const candidateFiles = [];
for (const tree of report.repositories) {
  if (tree.workingTreeSnapshot === "CREATED" || tree.workingTreeSnapshot === "EXISTS_NOT_OVERWRITTEN") {
    const files = await walk(tree.workingTree);
    for (const full of files) {
      const base = path.basename(full);
      const lower = base.toLowerCase();
      const isTargetArchive = (tree.repository === "adnanabderab2016-sys/-7-" && lower.endsWith(".rar")) ||
        (lower.endsWith(".zip") && lower.includes("aghbari_commerce_unified_source_package"));
      if (isTargetArchive) candidateFiles.push({ repository: tree.repository, path: full, name: base });
    }
  }
}

const usedHashes = new Set();
for (const source of candidateFiles) {
  try {
    const digest = await sha256(source.path);
    if (usedHashes.has(digest)) {
      report.copiedArchives.push({ source: source.repository, name: source.name, sha256: digest, status: "DUPLICATE_BYTES_SKIPPED" });
      continue;
    }
    usedHashes.add(digest);
    const target = path.join(archivesDir, source.name);
    await copyFile(source.path, target);
    const stats = await stat(target);
    report.copiedArchives.push({ source: source.repository, name: source.name, path: target, bytes: stats.size, sha256: digest, status: "COPIED_FROM_CHECKED_OUT_SOURCE" });
  } catch (err) {
    report.copiedArchives.push({ source: source.repository, name: source.name, status: "COPY_FAILED", error: String(err) });
  }
}

const readme = [
  "# Source collection result",
  "",
  "Generated at: " + report.generatedAt,
  "",
  "This workspace contains working-tree snapshots and Git mirrors for the sources that the current environment could access. No source project was merged.",
  "",
  "Output directory: " + root,
  "",
  "## Repository outcomes",
  "",
  ...report.repositories.map((r) => "- " + r.repository + ": " + r.state + "; default ref SHA: " + (r.mainSha || "NOT AVAILABLE") + "; branches: " + r.branches.length + "; tags: " + r.tags.length + "; PR head refs imported: " + r.pullRequestHeadRefs.length + "; working tree: " + (r.workingTreeSnapshot || "NOT CREATED") + (r.error ? "; error: " + r.error.replace(/\s+/g, " ").slice(0, 300) : "")),
  "",
  "## Archive outcomes",
  "",
  ...report.copiedArchives.map((a) => "- " + a.name + ": " + a.status + "; bytes: " + (a.bytes ?? "unknown") + "; SHA-256: " + (a.sha256 || "NOT AVAILABLE") + (a.path ? "; saved to " + a.path : "")),
  "",
  "## Important",
  "",
  "- Do not confuse the Git object IDs recorded by GitHub with SHA-256 of downloaded archive bytes.",
  "- Do not treat the small ZIP as a replacement for the 95,377,100-byte ZIP mentioned by the owner.",
  "- Any unavailable private repository or missing archive remains BLOCKED. Continue with accessible sources and update the register.",
  "- Before extracting archives, test their integrity and use an extractor that prevents path traversal and records every extraction failure.",
  "- This collection stage is not a merge, build, test, or production-readiness claim."
].join("\n");

await writeFile(path.join(root, "COLLECTION_MANIFEST.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
await writeFile(path.join(root, "COLLECTION_REPORT.md"), readme + "\n", "utf8");
console.log("\nSource intake collection finished.");
console.log("Workspace: " + root);
console.log("Manifest: " + path.join(root, "COLLECTION_MANIFEST.json"));
console.log("Report: " + path.join(root, "COLLECTION_REPORT.md"));
console.log("No files were merged into Nasr1 and no database was changed.");
