const fs = require('fs');
const path = require('path');
const dir = './studio-ui';

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
files.forEach(f => {
    const file = path.join(dir, f);
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    content = content.replace(/src="\/src\/main_/g, 'src="./src/main_');
    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log(`Fixed ${f}`);
    }
});
