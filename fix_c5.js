const fs = require('fs');
const path = require('path');

const walk = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            results.push(file);
        }
    });
    return results;
};

const files = walk('./projects/Default Project/engines');
let totalReplaced = 0;

files.forEach(file => {
    if (!file.endsWith('.js') && !file.endsWith('.html') && !file.endsWith('.ts')) return;
    
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Replace ../shared/ and ../../shared/
    content = content.replace(/(['"])\.\.\/shared\//g, "$1/engines/shared/");
    content = content.replace(/(['"])\.\.\/\.\.\/shared\//g, "$1/engines/shared/");
    
    // Replace ../../lib/ and ../../../lib/
    content = content.replace(/(['"])\.\.\/\.\.\/lib\//g, "$1/lib/");
    content = content.replace(/(['"])\.\.\/\.\.\/\.\.\/lib\//g, "$1/lib/");
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        totalReplaced++;
        console.log(`Fixed ${file}`);
    }
});

console.log(`Total files fixed: ${totalReplaced}`);
