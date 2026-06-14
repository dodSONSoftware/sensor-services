#!/usr/bin/env bash
# ci.sh — build, lint, test with coverage, and report.
# Exit codes: 0 = all green, 1 = any step failed.
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0
RESULTS=()

pass() { RESULTS+=("${GREEN}PASS${NC}  $1"); ((PASS++)) || true; }
fail() { RESULTS+=("${RED}FAIL${NC}  $1"); ((FAIL++)) || true; }
warn() { RESULTS+=("${YELLOW}WARN${NC}  $1"); ((WARN++)) || true; }

echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Sensor Web Services — CI Check         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ---- 1. Build ----
echo -e "${CYAN}▶ build${NC}"
BUILD_OUT=$(npm run build 2>&1) && pass "build" || fail "build"
echo "$BUILD_OUT" | tail -3
echo ""

# ---- 2. Lint ----
echo -e "${CYAN}▶ lint${NC}"
LINT_OUT=$(npm run lint 2>&1) && pass "lint" || fail "lint"
LINT_WARNINGS=$(echo "$LINT_OUT" | grep -c 'warn' || true)
if [[ $LINT_WARNINGS -gt 0 ]]; then
    warn "lint has $LINT_WARNINGS warning(s)"
fi
echo "$LINT_OUT" | tail -3
echo ""

# ---- 3. Test + Coverage ----
echo -e "${CYAN}▶ test${NC}"
TEST_OUT=$(npm run test:coverage 2>&1 || true)

# Parse test results
TEST_SUMMARY=$(echo "$TEST_OUT" | grep -E 'Tests:.*passed' || echo "Tests: 0 passed, 0 total")
TEST_PASSED=$(echo "$TEST_SUMMARY" | grep -oP '\d+(?= passed)' || echo "0")
TEST_TOTAL=$(echo "$TEST_SUMMARY" | grep -oP '\d+(?= total)' || echo "0")

if echo "$TEST_OUT" | grep -q 'PASS'; then
    pass "tests ($TEST_PASSED/$TEST_TOTAL)"
else
    fail "tests ($TEST_PASSED/$TEST_TOTAL)"
fi

# Extract overall coverage from the "All files" summary line
# Jest outputs: All files  |  65.49  |  56.87  |  45.34  |  67.15  | ...
ALL_FILES_LINE=$(echo "$TEST_OUT" | grep '^All files' | tail -1)
ALL_STMT=$(echo "$ALL_FILES_LINE" | grep -oP '[\d.]+' | head -1 || echo "0")
ALL_BRANCH=$(echo "$ALL_FILES_LINE" | grep -oP '[\d.]+' | sed -n '2p' || echo "0")
ALL_FUNC=$(echo "$ALL_FILES_LINE" | grep -oP '[\d.]+' | sed -n '3p' || echo "0")
ALL_LINE=$(echo "$ALL_FILES_LINE" | grep -oP '[\d.]+' | sed -n '4p' || echo "0")

THRESHOLD=70
COV_FAIL=0
for COV_VAL in "$ALL_STMT" "$ALL_BRANCH" "$ALL_FUNC" "$ALL_LINE"; do
    if awk "BEGIN {exit !($COV_VAL < $THRESHOLD)}"; then
        COV_FAIL=1
        break
    fi
done
if [[ $COV_FAIL -eq 1 ]]; then
    fail "coverage threshold ($THRESHOLD%) not met"
fi

echo ""
echo -e "  ${BOLD}Coverage:${NC}"
echo -e "    Statements:   ${ALL_STMT}%  (threshold: ${THRESHOLD}%)"
echo -e "    Branches:     ${ALL_BRANCH}%  (threshold: ${THRESHOLD}%)"
echo -e "    Functions:    ${ALL_FUNC}%  (threshold: ${THRESHOLD}%)"
echo -e "    Lines:        ${ALL_LINE}%  (threshold: ${THRESHOLD}%)"
echo ""

# ---- Summary ----
echo -e "${BOLD}──────────────────────────────────────────${NC}"
echo -e "${BOLD}Summary:${NC}"
for R in "${RESULTS[@]}"; do echo "  $R"; done
echo ""
echo -e "  ${BOLD}Results:${NC} ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}${BOLD}✗ CI check FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}${BOLD}✓ CI check passed${NC}"
    exit 0
fi
