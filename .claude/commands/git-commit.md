# /git-commit: Analyze, Commit, and Version Bump Workflow

Analyze all changes in the repository, update CLAUDE.md to reflect current project state, create a formatted commit message with semantic versioning, stage everything, commit, and verify. All commands execute from `code/`.

## Steps

### 0. UPDATE CLAUDE.md FIRST

Before doing anything else, check if `CLAUDE.md` needs updating based on the changes being committed:

- **New files/directories** — add entries to the directory tree in the appropriate section
- **Modified commands/skills** — update any references or descriptions that changed
- **Removed files** — remove stale entries from CLAUDE.md
- **Architecture/config changes** — update architecture notes, common commands, or development notes as needed

If CLAUDE.md is already up to date (no structural changes in this commit), skip this step. Do NOT stage the CLAUDE.md change yet — it will be staged together with everything else at Step 5.

### 1. ANALYZE GIT CHANGES

Run these commands to understand what changed:
- `git status --short` — list all modified/added/deleted files
- `git diff --stat HEAD` — show file-level change summary
- `git log --oneline -5` — recent commit history for context

Classify every changed file into one of these categories:
- **Added** (`??` or `A`)
- **Modified** (`M`)
- **Deleted** (`D`)

Group changes by component:
- **SENSOR-WEB-SERVICES** — anything under `code/` that is NOT in `dodsonlabs/`
- **DODSONLABS** — anything under `code/src/dodsonlabs/` or `.claude/skills/blt/`

### 2. DETERMINE SEMANTIC VERSION BUMPS

Check what changed to decide which versions to bump:

| Changed in | Version file | Bump type |
|---|---|---|
| `code/package.json` only (no dodsonlabs changes) | `code/package.json` `"version"` | PATCH (`3.0.X`) |
| `code/src/dodsonlabs/version.txt` only (no main app changes) | `code/src/dodsonlabs/version.txt` | PATCH (`X.Y.Z`) |
| Both components changed | bump both versions independently |

**Bump rules:**
- **PATCH** — bug fixes, test updates, docs, config tweaks, minor improvements
- **MINOR** — new features, new files, new functionality (additive changes)
- **MAJOR** — breaking changes (rare; only if clearly destructive to the API/contract)

If a component has NO changed files at all, do NOT touch its version file.

### 3. CREATE COMMIT MESSAGE

Format the commit message exactly like this:

```
<simple_overview_message>

[<version_bump>] <COMPONENT_NAME>
    - <one-line description of change>
    - <one-line description of change>

[<version_bump>] <COMPONENT_NAME>
    - <one-line description of change>
    - <one-line description of change>
```

Rules:
- `<simple_overview_message>` — short, git-log-oneline style (e.g. `fix: resolve timeout in MqttCommandControl`)
- Each `[<version_bump>]` line groups that component's changes together
- If only one component changed, omit the second group entirely
- One-line descriptions should be concise and specific

### 4. UPDATE VERSION FILES (if needed)

If a version bump is required:
- **Main app**: edit `code/package.json`, update `"version"` field
- **Dodsonlabs**: write new value to `code/src/dodsonlabs/version.txt`

Do NOT touch any version file for components with no changes.

### 5. STAGE AND COMMIT

```bash
git add .
git commit -m "<commit_message>"
```

Use the formatted message from Step 3 as the `-m` value (escape newlines or use a heredoc).

### 6. VERIFY

Run:
- `git status` — confirm working tree is clean
- `git log --oneline -3` — confirm commit landed correctly

## Output

1. **The full commit message** that was used
2. **List of all files changed**, grouped by component, with one-sentence descriptions:

```
[<version_bump>] <COMPONENT_NAME>
    - <file_path>: <one sentence description>
    - <file_path>: <one sentence description>
```

3. **Brief summary** of notable changes (what matters to a reviewer)

## EXAMPLE OUTPUT

lorem ipsum sen flow polre wlkw likekke.

[3.0.4] SENSOR-WEB-SERVICES
    - src/dodsonlabs/MqttCommandControl.test.ts: fix fake timer race condition in waitForCompletion tests
    - .claude/commands/blt.md: trim commit step from BLT skill definition

[1.2.0] DODSONLABS
    - version.txt: bump to 1.2.0 (new feature)
    - src/dodsonlabs/MqttCommandControl.ts: add deinitialize clock support
