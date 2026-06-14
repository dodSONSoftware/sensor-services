# /blt — Build, Lint, Test

Run the full CI check: build, lint, test with coverage.

## Steps

1. Run `npm run blt` from the `code/` directory (runs `.claude/commands/ci.sh`)
2. Report the results:
   - Which steps passed/failed
   - Coverage numbers vs thresholds
   - Any lint warnings
3. If coverage is below threshold, list the files pulling it down (from the Jest output)

## Exit

- Exit code 0 = all green
- Exit code 1 = any step failed or coverage below threshold
