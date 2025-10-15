const fs = require('fs').promises;
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'src', 'bin', 'init', 'templates');
const destDir = path.join(__dirname, '..', 'dist', 'bin', 'init', 'templates');

async function copyFiles() {
    try {
        await fs.mkdir(destDir, { recursive: true });
        const files = await fs.readdir(sourceDir);
        for (const file of files) {
            const sourceFile = path.join(sourceDir, file);
            const destFile = path.join(destDir, file);
            await fs.copyFile(sourceFile, destFile);
        }
        console.log('✅ EJS templates copied successfully.');
    } catch (error) {
        console.error('❌ Error copying EJS templates:', error);
        process.exit(1);
    }
}

copyFiles();