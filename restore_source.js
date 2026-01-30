const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, 'public/widget/dist/widget.js.map');
const outputDir = path.join(__dirname, 'public/widget');

if (!fs.existsSync(mapPath)) {
    console.error('Map file not found:', mapPath);
    process.exit(1);
}

const mapContent = fs.readFileSync(mapPath, 'utf8');
const map = JSON.parse(mapContent);

map.sources.forEach((sourcePath, index) => {
    // sourcePath is like "../src/utils/logger.js"
    // We want to write to public/widget/src/utils/logger.js

    // Resolve path relative to the map file location (which is public/widget/dist)
    // But sourcePath starts with ../ so it goes to public/widget/src

    // Let's normalize. 
    // sourcePath is relative to the "dist" folder.
    // So "../src" means "public/widget/src".

    // We can just strip the leading "../" and join with outputDir
    const relativePath = sourcePath.replace(/^\.\.\//, '');
    const fullPath = path.join(outputDir, relativePath);
    const content = map.sourcesContent[index];

    if (!content) {
        console.warn('No content for:', sourcePath);
        return;
    }

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content);
    console.log('Restored:', fullPath);
});
