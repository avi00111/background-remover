const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { removeBackground } = require('@imgly/background-removal-node');
const schedule = require('node-schedule');

const app = express();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Ensure directories exist
[UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Allowed image formats
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPG, PNG, and WEBP files are supported.'));
    }
});

// Serve output files
app.use('/outputs', express.static(OUTPUTS_DIR));

// ✅ Health check
app.get('/', (req, res) => {
    res.send('🚀 Background Remover server is running.');
});

// ✅ Background removal route (with /api prefix)
app.post('/api/remove-background', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const inputPath = req.file.path;
        const ext = path.extname(req.file.originalname);
        const baseName = path.basename(req.file.originalname, ext);
        const outputFileName = `${baseName}-output.png`;
        const outputPath = path.join(OUTPUTS_DIR, outputFileName);

        console.log(`🔄 Removing background from: ${inputPath}`);

        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());

        fs.writeFileSync(outputPath, buffer);
        fs.unlinkSync(inputPath);

        console.log(`✅ Output saved to: ${outputPath}`);

        res.json({ success: true, fileUrl: `/outputs/${outputFileName}` });
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// ✅ Scheduled cleanup for files older than 1 hour
schedule.scheduleJob('0 * * * *', () => {
    const now = Date.now();
    const oneHour = 1000 * 60 * 60;

    [UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
        fs.readdir(dir, (err, files) => {
            if (err) return console.error(`Error reading ${dir}:`, err);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return console.error(`Error stating file ${filePath}:`, err);
                    if (now - stats.mtimeMs > oneHour) {
                        fs.unlink(filePath, err => {
                            if (err) console.error(`Error deleting ${filePath}:`, err);
                            else console.log(`🗑️ Deleted old file: ${filePath}`);
                        });
                    }
                });
            });
        });
    });
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
