const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(filePath));
        } else if (filePath.endsWith('.jsx')) {
            results.push(filePath);
        }
    });
    return results;
}

const files = walk('./src');
let changedFiles = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Match value={obj.prop} but not value={obj.prop || ''}
    // Also handling optional chaining like obj?.prop
    content = content.replace(/value=\{([a-zA-Z0-9_]+(?:\??\.[a-zA-Z0-9_]+)+)\}/g, (match, p1) => {
        // Skip if it's likely a number field or specifically doesn't need it
        if (p1.toLowerCase().includes('grade') || p1.toLowerCase().includes('score')) {
            return match;
        }
        return `value={${p1} || ''}`;
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
        changedFiles++;
    }
});

console.log(`Done. Changed ${changedFiles} files.`);
