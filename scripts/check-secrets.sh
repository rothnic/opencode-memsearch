#!/bin/bash
# Secret detection using detect-secrets (Yelp) or truffleHog
# Falls back to regex-based scanning if tools not available

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "🔍 Scanning for secrets in staged files..."

# Check if detect-secrets is installed
if command -v detect-secrets &> /dev/null; then
    echo "Using detect-secrets (Yelp)..."
    
    # Scan staged files only
    STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v "^$" || true)
    
    if [ -z "$STAGED_FILES" ]; then
        echo -e "${GREEN}✅ No staged files to scan.${NC}"
        exit 0
    fi
    
    # Create temporary file list
    TMPFILE=$(mktemp)
    echo "$STAGED_FILES" > "$TMPFILE"
    
    # Run detect-secrets
    if detect-secrets scan --all-files --force-use-all-plugins $(cat "$TMPFILE") 2>/dev/null | grep -q "True"; then
        echo -e "${RED}❌ Potential secrets detected by detect-secrets!${NC}"
        echo ""
        detect-secrets scan --all-files $(cat "$TMPFILE") 2>/dev/null || true
        rm -f "$TMPFILE"
        exit 1
    fi
    
    rm -f "$TMPFILE"
    echo -e "${GREEN}✅ No secrets detected by detect-secrets.${NC}"
    exit 0
fi

# Check if truffleHog is installed
if command -v trufflehog &> /dev/null; then
    echo "Using truffleHog..."
    
    # Scan staged files
    if trufflehog git file://. --since-commit HEAD --only-verified --fail 2>/dev/null; then
        echo -e "${GREEN}✅ No secrets detected by truffleHog.${NC}"
        exit 0
    else
        echo -e "${RED}❌ Potential secrets detected by truffleHog!${NC}"
        echo "Run 'trufflehog git file://.' for details"
        exit 1
    fi
fi

# Fallback: Basic regex-based scanning
echo "detect-secrets and truffleHog not found, using basic regex scanning..."
echo "Install detect-secrets for better detection: pip install detect-secrets"
echo ""

# Patterns for common secrets
PATTERNS=(
    # API Keys - generic
    'api[_-]?key["'\''"'\''']?\s*[:=]\s*["'\''"'\''']?[a-zA-Z0-9_\-]{20,}'
    
    # Private keys
    '-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----'
    
    # AWS
    'AKIA[0-9A-Z]{16}'
    'aws[_-]?secret[_-]?access[_-]?key["'\''"'\''']?\s*[:=]\s*["'\''"'\''']?[a-zA-Z0-9/+=]{40}'
    
    # GitHub tokens (new format)
    'gh[pousr]_[A-Za-z0-9_]{36,}'
    
    # Generic tokens
    'bearer\s+[a-zA-Z0-9_\-\.=]{20,}'
    'token["'\''"'\''']?\s*[:=]\s*["'\''"'\''']?[a-zA-Z0-9_\-]{20,}'
    
    # 9router/Custom API keys
    'sk-[a-zA-Z0-9]{20,}'
    
    # URLs with credentials
    'https?://[^\s:@]+:[^\s:@]+@[^\s]+'
)

EXCLUDE_PATTERNS=(
    'example'
    'placeholder'
    'your_'
    'TODO'
    'FIXME'
    '\.test\.'
    '\.spec\.'
    'node_modules'
    'bun\.lock'
    'package-lock'
)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v "^$" || true)
FOUND=0

for file in $STAGED_FILES; do
    # Skip binary files and excluded paths
    if [[ "$file" == *"node_modules"* ]] || [[ "$file" == *".git"* ]]; then
        continue
    fi
    
    if file "$file" 2>/dev/null | grep -q "binary"; then
        continue
    fi
    
    # Skip files that are examples
    if [[ "$file" == *".example"* ]]; then
        continue
    fi
    
    for pattern in "${PATTERNS[@]}"; do
        MATCHES=$(git diff --cached -U0 -- "$file" 2>/dev/null | grep -iE "^\+.*$pattern" || true)
        if [ -n "$MATCHES" ]; then
            # Check if it's a false positive (example/placeholder)
            IS_EXAMPLE=false
            for exclude in "${EXCLUDE_PATTERNS[@]}"; do
                if echo "$MATCHES" | grep -qiE "$exclude"; then
                    IS_EXAMPLE=true
                    break
                fi
            done
            
            if [ "$IS_EXAMPLE" = false ]; then
                echo -e "${RED}❌ Potential secret in $file:${NC}"
                echo "$MATCHES" | head -3
                echo ""
                FOUND=$((FOUND + 1))
            fi
        fi
    done
done

if [ $FOUND -gt 0 ]; then
    echo -e "${RED}⚠️  Found $FOUND potential secret(s)!${NC}"
    echo ""
    echo "If these are false positives:"
    echo "  1. Add '# pragma: allowlist secret' comment on that line"
    echo "  2. Use 'git commit --no-verify' (NOT RECOMMENDED)"
    echo "  3. Install detect-secrets for smarter scanning"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ No secrets detected.${NC}"
exit 0
