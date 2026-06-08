---
name: git-commit-both
description: git add and commit both the dodsonlabs submodule and the main sensor-web-services repo, dodsonlabs first — auto-bumps version, generates commit message from diff
---

Commits staged changes in two repos — **dodsonlabs** first, then the **main repo** — with auto-generated conventional commit messages and semver version bumps.

## Usage

```bash
node .claude/skills/git-commit-both/driver.mjs
```

Or provide a custom message (bypasses auto-generation and version bump):

```bash
node .claude/skills/git-commit-both/driver.mjs "fix: handle empty MQTT responses"
```

## What it does

For each repo (dodsonlabs, then main):

1. **Bump version** — reads `version.txt` (dodsonlabs) or `code/package.json` (main repo), bumps semver based on diff analysis:
   - **major**: deleted files or >2x more removals than additions
   - **minor**: new files or >3x more additions than removals
   - **patch**: any other changes
2. **Stage** everything except `.claude/` (the skill itself)
3. **Generate message** — first line: `[version] summary`, body: files grouped by directory with stats
4. **Commit**

Skips any repo with no staged changes.

## Example output

```
=== git-commit-both ===

--- dodsonlabs ---
Version: 1.2.0 → 1.2.1 (patch — bug fixes)
Generated message:
[1.2.1] update 3 files in controllers

  ./ (3 files):
    - MqttNetworking.ts
    - Logger.ts
    - SystemFunctions.ts

 3 files changed, 12 insertions(+), 8 deletions(+)

[dodsonlabs] Committed.

--- main repo ---
Version: 1.3.0 → 1.3.1 (patch — bug fixes)
Generated message:
[1.3.1] update 5 files in tests, routes, controllers

  code/src/controllers/ (2 files):
    - generalController.ts
    - pingerController.ts
  code/src/routes/ (2 files):
    - generalRoutes.ts
    - pingerRoutes.ts
  code/tests/__tests__/controllers/ (1 file):
    - generalController.test.ts

 5 files changed, 45 insertions(+), 12 deletions(+)

[main] Committed.

=== done ===
```
