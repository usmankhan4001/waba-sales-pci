#!/usr/bin/env node
// Lightweight pre-commit secret scan - insurance against a future `git add -A`/`git add .`
// mistake accidentally staging a real .env file or an obvious credential. Not a substitute
// for a real secret-scanning tool (gitleaks etc.), just a cheap first line of defense.
const { execSync } = require('child_process');

function stagedFiles() {
  return execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function readStagedContent(file) {
  try {
    return execSync(`git show :"${file}"`, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

const ENV_FILE_PATTERN = /(^|\/)\.env(\.[a-zA-Z0-9_-]+)?$/;
const ENV_EXAMPLE_PATTERN = /\.env\.example$/;

const SECRET_CONTENT_PATTERNS = [
  { name: 'private key block', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'generic API key assignment', pattern: /(api|secret)[_-]?key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i },
];

let violations = [];

for (const file of stagedFiles()) {
  if (ENV_FILE_PATTERN.test(file) && !ENV_EXAMPLE_PATTERN.test(file)) {
    violations.push(`${file}: looks like a real .env file, not a .env.example - refusing to commit it.`);
    continue;
  }

  const content = readStagedContent(file);
  for (const { name, pattern } of SECRET_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${file}: matches "${name}" pattern - looks like it may contain a real secret.`);
    }
  }
}

if (violations.length > 0) {
  console.error('\n[check-secrets] Commit blocked - possible secret(s) detected:\n');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(
    '\nIf this is a false positive, remove the offending content or file from the commit, or (only if you are certain) bypass with `git commit --no-verify`.\n'
  );
  process.exit(1);
}
