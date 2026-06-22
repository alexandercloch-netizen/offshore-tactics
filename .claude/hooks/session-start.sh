#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Installs dependencies so a fresh web session is immediately productive — the
# type-checker (npm run tsc) and the test suite (npm test) work straight away,
# with no manual setup. Safe to run repeatedly.
set -euo pipefail

# Only the remote (web) environment needs this; local machines manage their own
# dependencies and tooling.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "Offshore Tactics: installing dependencies for this session…"
npm install --no-audit --no-fund
echo "Offshore Tactics: ready — run 'npm run tsc' and 'npm test'."
