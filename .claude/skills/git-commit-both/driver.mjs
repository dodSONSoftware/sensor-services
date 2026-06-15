#!/usr/bin/env node
/*
 * git-commit-both — commit dodsonlabs then the main repo.
 *
 * For each repo:
 *   1. Bump version (semver) based on change type
 *   2. Stage everything
 *   3. Generate a conventional-commit message from the diff
 *   4. Commit
 *
 * Usage: node driver.mjs [override message]
 *        (override bypasses auto-generation and version bump)
 */

import { execSync } from "child_process";
import { resolve, join, dirname } from "path";
import { readFileSync, writeFileSync } from "fs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const DODSONLABS = join(REPO_ROOT, "code", "src", "dodsonlabs");

// ---- helpers ----

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function fileExists(path) {
  try {
    execSync(`test -f "${path}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getStagedFiles(cwd) {
  const out = run("git diff --cached --name-only --diff-filter=dACM", cwd);
  return out ? out.split("\n").filter(Boolean) : [];
}

function getStagedCount(cwd) {
  return getStagedFiles(cwd).length;
}

function getLastCommitType(cwd) {
  const msg = run("git log -1 --pretty=%s", cwd);
  const m = msg.match(/^(\w+)(?:\([^)]*\))?:/);
  return m ? m[1].toLowerCase() : "chore";
}

// ---- version bumping ----

/**
 * Read version from package.json or version.txt.
 * Checks: repo root package.json → code/package.json → version.txt
 * Returns { version, source } or null.
 */
function readVersion(repoPath) {
  // Try package.json at root
  const pkgPath = join(repoPath, "package.json");
  if (fileExists(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return { version: pkg.version, source: "package.json" };
  }
  // Try code/package.json (common monorepo pattern)
  const codePkgPath = join(repoPath, "code", "package.json");
  if (fileExists(codePkgPath)) {
    const pkg = JSON.parse(readFileSync(codePkgPath, "utf8"));
    return { version: pkg.version, source: "code/package.json" };
  }
  // Fall back to version.txt
  const verPath = join(repoPath, "version.txt");
  if (fileExists(verPath)) {
    const version = readFileSync(verPath, "utf8").trim();
    return { version, source: "version.txt" };
  }
  return null;
}

/**
 * Write version to package.json or version.txt.
 */
function writeVersion(repoPath, version) {
  const pkgPath = join(repoPath, "package.json");
  if (fileExists(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    return;
  }
  const codePkgPath = join(repoPath, "code", "package.json");
  if (fileExists(codePkgPath)) {
    const pkg = JSON.parse(readFileSync(codePkgPath, "utf8"));
    pkg.version = version;
    writeFileSync(codePkgPath, JSON.stringify(pkg, null, 2) + "\n");
    return;
  }
  const verPath = join(repoPath, "version.txt");
  writeFileSync(verPath, version + "\n");
}

function bumpVersion(repoPath) {
  const info = readVersion(repoPath);
  if (!info) return null;

  const parts = info.version.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  const diff = run("git diff --cached", repoPath);
  const addedLines = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
  const removedLines = diff.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---")).length;
  const newFiles = run("git diff --cached --name-only --diff-filter=A", repoPath).split("\n").filter(Boolean);
  const deletedFiles = run("git diff --cached --name-only --diff-filter=D", repoPath).split("\n").filter(Boolean);

  // Determine bump type
  let bump = "patch";
  let reason = "";

  if (deletedFiles.length > 0 || removedLines > addedLines * 2) {
    bump = "major";
    reason = "breaking changes";
  } else if (newFiles.length > 0 || addedLines > removedLines * 3) {
    bump = "minor";
    reason = "new features";
  } else if (removedLines > 0) {
    bump = "patch";
    reason = "bug fixes";
  } else {
    reason = "updates";
  }

  let newVersion;
  if (bump === "major") newVersion = `${major + 1}.0.0`;
  else if (bump === "minor") newVersion = `${major}.${minor + 1}.0`;
  else newVersion = `${major}.${minor}.${patch + 1}`;

  writeVersion(repoPath, newVersion);

  return { old: info.version, new: newVersion, bump, reason, source: info.source };
}

// ---- message generation ----

/**
 * Analyse the staged diff to produce a one-line summary.
 * Strategy: look at file types and paths, not function signatures.
 */
function generateOneLiner(cwd) {
  const files = getStagedFiles(cwd);
  if (files.length === 0) return "no changes";

  const newFiles = run("git diff --cached --name-only --diff-filter=A", cwd).split("\n").filter(Boolean);
  const deletedFiles = run("git diff --cached --name-only --diff-filter=D", cwd).split("\n").filter(Boolean);

  // Classify files by type
  const testFiles = files.filter(f => f.includes("/tests/") || f.includes("/test/"));
  const routeFiles = files.filter(f => f.includes("Routes") || f.includes("routes/"));
  const controllerFiles = files.filter(f => f.includes("Controller") || f.includes("controllers/"));
  const configFiles = files.filter(f => f.match(/\.(json|yml|yaml|env|config\.)/) || f.includes("config") || f.includes("Config"));
  const schemaFiles = files.filter(f => f.includes("schema") || f.includes("Schema"));
  const srcFiles = files.filter(f => f.startsWith("src/") || f.includes("/src/"));
  const docFiles = files.filter(f => f.match(/\.(md|txt|rst)$/));
  const buildFiles = files.filter(f => f.match(/(Dockerfile|docker-compose|Makefile|\.github|\.gitignore)/));
  const pkgFiles = files.filter(f => f.match(/package\.json|package\.lock|tsconfig|\.eslintrc|babel/));

  // New files dominate
  if (newFiles.length > 0 && newFiles.length >= files.length * 0.5) {
    const labels = [];
    if (newFiles.some(f => f.includes("Controller"))) labels.push("controllers");
    if (newFiles.some(f => f.includes("Routes"))) labels.push("routes");
    if (newFiles.some(f => f.includes("tests") || f.includes("test"))) labels.push("tests");
    if (newFiles.some(f => f.includes("schema"))) labels.push("schemas");
    if (labels.length > 0) {
      return `add ${newFiles.length} new file${newFiles.length > 1 ? "s" : ""} (${labels.join(", ")})`;
    }
    return `add ${newFiles.length} new file${newFiles.length > 1 ? "s" : ""}`;
  }

  // Deleted files dominate
  if (deletedFiles.length > 0 && deletedFiles.length >= files.length * 0.5) {
    return `remove ${deletedFiles.length} file${deletedFiles.length > 1 ? "s" : ""}`;
  }

  // Mixed: describe the scope
  const scopes = [];
  if (testFiles.length > 0) scopes.push(`tests`);
  if (routeFiles.length > 0) scopes.push(`routes`);
  if (controllerFiles.length > 0) scopes.push(`controllers`);
  if (configFiles.length > 0) scopes.push(`config`);
  if (schemaFiles.length > 0) scopes.push(`schemas`);
  if (docFiles.length > 0) scopes.push(`docs`);
  if (buildFiles.length > 0) scopes.push(`build`);
  if (pkgFiles.length > 0) scopes.push(`deps`);

  if (scopes.length === 0) {
    // Fallback: just say what changed
    const diff = run("git diff --cached", cwd);
    const added = diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
    const removed = diff.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---")).length;
    return `update ${files.length} file${files.length > 1 ? "s" : ""} (+${added}/-${removed})`;
  }

  // Deduplicate and limit
  const uniqueScopes = [...new Set(scopes)].slice(0, 3);
  return `update ${files.length} file${files.length > 1 ? "s" : ""} in ${uniqueScopes.join(", ")}`;
}

/**
 * Build the body: files grouped by directory, with stats.
 * Groups by the directory portion of each path.
 */
function generateBody(cwd) {
  const files = getStagedFiles(cwd);
  if (files.length === 0) return "";

  // Group by directory (e.g. "code/src/controllers", ".claude/skills")
  const groups = new Map();
  for (const f of files) {
    const d = dirname(f);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(f);
  }

  const lines = [];
  for (const [dir, groupFiles] of groups) {
    lines.push(`  ${dir}/ (${groupFiles.length} file${groupFiles.length > 1 ? "s" : ""}):`);
    for (const f of groupFiles) {
      lines.push(`    - ${f}`);
    }
  }

  // Add diff stats at the end
  const stat = run("git diff --cached --stat", cwd);
  if (stat) {
    lines.push("");
    lines.push(stat.split("\n").slice(1).join("\n")); // skip total line
  }

  return lines.join("\n");
}

/**
 * Generate a full commit message.
 * First line: [version] summary
 * Body: list of changes grouped by directory.
 */
function generateMessage(cwd, newVersion) {
  const oneLiner = generateOneLiner(cwd);
  const body = generateBody(cwd);

  const firstLine = `[${newVersion}] ${oneLiner}`;
  if (body) {
    return `${firstLine}\n\n${body}`;
  }
  return firstLine;
}

// ---- commit logic ----

function commitRepo(name, repoPath, message) {
  // Stage everything except .claude/ (the skill itself)
  run("git add -A -- . ':!.claude/'", repoPath);

  // Check what's staged after add
  const staged = getStagedCount(repoPath);
  if (staged === 0) {
    console.log(`[${name}] Nothing new to stage — skipping.`);
    return;
  }

  console.log(`\n[${name}] Staged ${staged} file(s):`);
  console.log(run("git diff --cached --stat", repoPath));

  // Use multiline commit message
  const escaped = message.replace(/"/g, '\\"');
  run(`git commit -m "${escaped}"`, repoPath);
  console.log(`[${name}] Committed.`);
}

// ---- main ----

function main() {
  const override = process.argv[2];

  console.log(`=== git-commit-both ===`);

  // 1. Commit dodsonlabs
  console.log(`\n--- dodsonlabs ---`);
  try {
    if (override) {
      console.log(`Using override message: ${override}`);
      commitRepo("dodsonlabs", DODSONLABS, override);
    } else {
      const ver = bumpVersion(DODSONLABS);
      if (ver) {
        console.log(`Version: ${ver.old} → ${ver.new} (${ver.bump} — ${ver.reason})`);
      }
      const newVer = ver ? ver.new : "0.0.0";
      const msg = generateMessage(DODSONLABS, newVer);
      console.log(`Generated message:\n${msg}\n`);
      commitRepo("dodsonlabs", DODSONLABS, msg);
    }
  } catch (err) {
    console.error(`dodsonlabs commit failed: ${err.message}`);
  }

  // 2. Commit main repo
  console.log(`\n--- main repo ---`);
  try {
    if (override) {
      console.log(`Using override message: ${override}`);
      commitRepo("main", REPO_ROOT, override);
    } else {
      const ver = bumpVersion(REPO_ROOT);
      if (ver) {
        console.log(`Version: ${ver.old} → ${ver.new} (${ver.bump} — ${ver.reason})`);
      }
      const newVer = ver ? ver.new : "0.0.0";
      const msg = generateMessage(REPO_ROOT, newVer);
      console.log(`Generated message:\n${msg}\n`);
      commitRepo("main", REPO_ROOT, msg);
    }
  } catch (err) {
    console.error(`main repo commit failed: ${err.message}`);
  }

  console.log("\n=== done ===");
}

main();
