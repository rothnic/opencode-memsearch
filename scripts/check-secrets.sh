#!/bin/bash
# Secret detection pre-commit hook
# Scans for common secret patterns before allowing commits

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Patterns to detect secrets (case insensitive)
PATTERNS=(
  # API Keys
  'api[_-]?key["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  'apikey["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  
  # Generic secrets/tokens
  'secret["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{16,}'
  'password["\']?\s*[:=]\s*["\'][^"\']{8,}'
  'passwd["\']?\s*[:=]\s*["\'][^"\']{8,}'
  
  # Tokens
  'token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  'access[_-]?token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  'auth[_-]?token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  
  # Private keys
  'private[_-]?key["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}'
  '-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----'
  
  # AWS
  'AKIA[0-9A-Z]{16}'
  'aws[_-]?secret[_-]?access[_-]?key["\']?\s*[:=]\s*["\']?[a-zA-Z0-9/+=]{40}'
  
  # GitHub tokens
  'gh[pousr]_[A-Za-z0-9_]{36,}'
  'github[_-]?token["\']?\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{35,}'
  
  # Generic high-entropy strings that look like secrets
  '\b[a-zA-Z0-9]{32,64}\b'
)

# Files to exclude from scanning (config files, lock files, etc.)
EXCLUDE_FILES=(
  'bun.lock'
  'package-lock.json'
  'yarn.lock'
  'pnpm-lock.yaml'
  '*.min.js'
  '*.min.css'
  '.git/'
  'node_modules/'
  '*.test.ts'
  '*.test.js'
  '*.spec.ts'
  '*.spec.js'
)

# Build exclude pattern
EXCLUDE_PATTERN=""
for exclude in "${EXCLUDE_FILES[@]}"; do
  if [ -z "$EXCLUDE_PATTERN" ]; then
    EXCLUDE_PATTERN="$exclude"
  else
    EXCLUDE_PATTERN="$EXCLUDE_PATTERN|$exclude"
  fi
done

# Function to check if file should be excluded
should_exclude() {
  local file="$1"
  for exclude in "${EXCLUDE_FILES[@]}"; do
    if [[ "$file" == *"$exclude"* ]]; then
      return 0
    fi
  done
  return 1
}

# Scan staged files
echo "🔍 Scanning for secrets in staged files..."

FOUND_SECRETS=0

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

for file in $STAGED_FILES; do
  # Skip excluded files
  if should_exclude "$file"; then
    continue
  fi
  
  # Skip binary files
  if file "$file" | grep -q "binary"; then
    continue
  fi
  
  # Scan file content
  for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(git diff --cached -U0 -- "$file" | grep -iE "^\+.*$pattern" || true)
    if [ -n "$MATCHES" ]; then
      echo -e "${RED}❌ Potential secret detected in $file:${NC}"
      echo "$MATCHES" | head -5
      echo ""
      FOUND_SECRETS=$((FOUND_SECRETS + 1))
    fi
  done
done

if [ $FOUND_SECRETS -gt 0 ]; then
  echo -e "${RED}⚠️  Found $FOUND_SECRETS potential secret(s) in staged files.${NC}"
  echo ""
  echo "If these are false positives (e.g., test data, hashes), you can:"
  echo "  1. Add the file to EXCLUDE_FILES in scripts/check-secrets.sh"
  echo "  2. Use 'git commit --no-verify' to bypass this check (NOT RECOMMENDED)"
  echo "  3. Move secrets to environment variables or a .env file"
  echo ""
  exit 1
fi

echo -e "${YELLOW}✅ No secrets detected in staged files.${NC}"
exit 0
