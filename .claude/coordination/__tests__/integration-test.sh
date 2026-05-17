#!/bin/bash
# Integration test for skill coordination system

set -e
PASS=0
FAIL=0

# Test 1: Hook blocks registered skill (correct field names)
echo "Test 1: Hook blocks registered skill"
INPUT='{"tool_name":"Skill","tool_input":{"skill":"backend-development","args":"build API"}}'
EXIT_CODE=0
OUTPUT=$(echo "$INPUT" | node .claude/coordination/hooks/skill-coordination-gate.cjs 2>/dev/null) || EXIT_CODE=$?
if [ $EXIT_CODE -eq 2 ] && echo "$OUTPUT" | grep -q '"decision":"block"'; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: expected exit 2 with block decision, got exit $EXIT_CODE"; FAIL=$((FAIL+1))
fi

# Test 2: Hook allows unregistered skill
echo "Test 2: Hook allows unregistered skill"
INPUT='{"tool_name":"Skill","tool_input":{"skill":"test","args":"run tests"}}'
EXIT_CODE=0
echo "$INPUT" | node .claude/coordination/hooks/skill-coordination-gate.cjs 2>/dev/null || EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: expected exit 0, got exit $EXIT_CODE"; FAIL=$((FAIL+1))
fi

# Test 3: Hook allows non-Skill tool calls
echo "Test 3: Hook allows non-Skill tool calls"
INPUT='{"tool_name":"Bash","tool_input":{"command":"ls"}}'
EXIT_CODE=0
echo "$INPUT" | node .claude/coordination/hooks/skill-coordination-gate.cjs 2>/dev/null || EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: expected exit 0, got exit $EXIT_CODE"; FAIL=$((FAIL+1))
fi

# Test 4: Bypass mechanism works
echo "Test 4: Bypass mechanism works"
BYPASS_FILE=".claude/coordination/.bypass-next"
touch "$BYPASS_FILE"
INPUT='{"tool_name":"Skill","tool_input":{"skill":"backend-development","args":"build API"}}'
EXIT_CODE=0
echo "$INPUT" | node .claude/coordination/hooks/skill-coordination-gate.cjs 2>/dev/null || EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ] && [ ! -f "$BYPASS_FILE" ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: bypass should allow and delete file"; FAIL=$((FAIL+1))
  rm -f "$BYPASS_FILE"
fi

# Test 5: Config files exist and are valid JSON
echo "Test 5: Config files are valid JSON"
if node -e "JSON.parse(require('fs').readFileSync('.claude/coordination/skill-registry.json'))" 2>/dev/null && \
   node -e "JSON.parse(require('fs').readFileSync('.claude/coordination/coordination-config.json'))" 2>/dev/null; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: config files not valid JSON"; FAIL=$((FAIL+1))
fi

# Test 6: CLAUDE.md has coordination routing rules
echo "Test 6: CLAUDE.md has coordination routing rules"
if grep -q "coordination" CLAUDE.md 2>/dev/null && \
   grep -q "learning-loop" CLAUDE.md 2>/dev/null; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: CLAUDE.md missing coordination rules"; FAIL=$((FAIL+1))
fi

# Test 7: SKILL.md has coordination workflow
echo "Test 7: SKILL.md has coordination workflow"
if grep -q "Coordination Workflow" .claude/skills/learning-loop/SKILL.md 2>/dev/null; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: SKILL.md missing coordination workflow"; FAIL=$((FAIL+1))
fi

# Test 8: coordination-rules.md exists and has content
echo "Test 8: coordination-rules.md exists and has content"
RULES_FILE=".claude/skills/learning-loop/references/coordination-rules.md"
if [ -f "$RULES_FILE" ] && [ -s "$RULES_FILE" ]; then
  echo "  PASS"; PASS=$((PASS+1))
else
  echo "  FAIL: coordination-rules.md missing or empty"; FAIL=$((FAIL+1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && exit 0 || exit 1
