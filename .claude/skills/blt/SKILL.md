# BLT Skill

Automated build → lint → test quality gate for the sensor-web-services project.

## When to use

- Before pushing changes that have been developed and tested locally
- When the user says "build, lint, test", "blt", or "/blt"
- After implementing a feature or fix, as a final quality gate

## How it works

The driver script (`driver.mjs`) runs each step sequentially from `code/`:

1. **Analyze** — captures git diff stats and recent log for summary output
2. **Build** — `npm run build` (fails fast on error)
3. **Lint** — `npm run lint`, auto-fixes then re-runs if needed
4. **Test** — `npm test` (fails fast on failure)

BLT does not commit or push — that is the developer's decision.

## Prerequisites

- Node 22.x (per Volta pin in package.json)
- Dependencies installed (`npm install`)
