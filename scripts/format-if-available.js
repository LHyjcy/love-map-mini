// scripts/format-if-available.js
const fs = require('fs');
const { execSync } = require('child_process');

function hasFile(path) {
  return fs.existsSync(path);
}

try {
  if (!hasFile('package.json')) process.exit(0);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = pkg.scripts || {};
  if (scripts.format) {
    execSync('npm run format', { stdio: 'inherit' });
  }
} catch (err) {
  console.warn('[format-if-available] skipped:', err.message);
  process.exit(0);
}
