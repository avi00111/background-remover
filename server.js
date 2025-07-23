const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { removeBackground } = require('@imgly/background-removal-node');
const schedule = require('node-schedule');

const app = express();
const upload = multer({ dest: 'uploads/' });

const OUTPUT_DIR = 'outputs';
const UPLOAD_DIR = 'uploads';

// Serve the output folder as static
app.use(`/${OUTPUT_DIR}`, express.static(path.join(__dirname, OUTPUT_DIR)));

// 🧹 Utility to clear folder contents
const clearFolder = (folderPath) => {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const filePath = path.join(folderPath, file);
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.warn(`Failed to delete file ${filePath}:`, err.message);
            }
        });
    }
};

// ✅ API to remove background and return JSON info
app.post('/api/remove-background', upload.single('image'), async (req, res) => {
    try {
        // 🧹 Clear only old output files — NOT uploads (don't delete uploaded image yet)
        clearFolder(OUTPUT_DIR);

        const inputPath = req.file.path;
        const outputName = `${Date.now()}-output.png`;
        const outputPath = path.join(OUTPUT_DIR, outputName);

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR);
        }

        console.log(`Running removeBackground on: ${inputPath}`);

        // 🔁 Remove background
        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);

        // 🧽 Delete uploaded image after processing
        fs.unlinkSync(inputPath);

        // ✅ Respond with file info
        res.json({
            success: true,
            message: 'Background removed successfully',
            fileUrl: `/outputs/${outputName}`,
            filename: outputName
        });

    } catch (error) {
        console.error('Full Error:', error);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// ⏰ Scheduled cleanup: delete output files older than 1 hour
schedule.scheduleJob('0 * * * *', () => {
    const now = Date.now();
    console.log('Running scheduled cleanup...');
    fs.readdir(OUTPUT_DIR, (err, files) => {
        if (err) return console.error('Error reading output dir:', err);
        files.forEach((file) => {
            const filePath = path.join(OUTPUT_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return console.error('Stat error:', err);
                const ageInHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
                if (ageInHours > 1) {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error('Failed to delete old file:', err);
                        else console.log(`Deleted old file: ${file}`);
                    });
                }
            });
        });
    });
});

// ✅ Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 API running at http://localhost:${PORT}/api/remove-background`);
});
