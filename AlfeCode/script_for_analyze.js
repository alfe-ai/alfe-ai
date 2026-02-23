const fs = require('fs');
const path = require('path');

// This simple script will help identify repository pattern
console.log('Examining repository folder patterns...');

// Look in common repository locations what should match the ones to be kept
const GITHOST_REPO_ROOT = path.join(path.sep, "srv", "git", "repositories");

// List just the 'interesting' repo files for identification
try {
    const entries = fs.readdirSync(GITHOST_REPO_ROOT);
    const gitEntries = entries.filter(e => e.endsWith('.git'));
    console.log('Found git repositories:');
    gitEntries.forEach(entry => {
        const name = entry.slice(0, -4); // remove .git
        console.log(`  ${name}`);
    });
} catch (err) {
    console.error('Could not read repositories directory:', err.message);
}