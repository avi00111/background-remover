const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { removeBackground } = require('@imgly/background-removal-node');
const schedule = require('node-schedule');

const app = express();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Ensure folders exist
[UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Multer config for file uploads
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
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
        }
    }
});

// ✅ Health check route
app.get('/', (req, res) => {
    res.send('✅ Background Remover API is running.');
});

// ✅ Main background removal route
app.post('/api/remove-background', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded.' });
        }

        const inputPath = req.file.path;
        const ext = path.extname(req.file.originalname);
        const baseName = path.basename(req.file.originalname, ext);
        const outputFileName = `${baseName}-output.png`;
        const outputPath = path.join(OUTPUTS_DIR, outputFileName);

        console.log(`📥 Received file: ${inputPath}`);
        console.time('🛠️ Background removed');

        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());

        fs.writeFileSync(outputPath, buffer);
        fs.unlinkSync(inputPath); // clean temp upload

        console.timeEnd('🛠️ Background removed');
        console.log(`✅ Output saved: ${outputPath}`);

        res.json({ success: true, fileUrl: `/outputs/${outputFileName}` });
    } catch (error) {
        console.error('❌ Background removal error:', error);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// ✅ Serve output files statically
app.use('/outputs', express.static(OUTPUTS_DIR));

// ✅ Scheduled cleanup every hour
schedule.scheduleJob('0 * * * *', () => {
    const now = Date.now();
    const oneHour = 1000 * 60 * 60;

    [UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
        fs.readdir(dir, (err, files) => {
            if (err) return console.error(`Error reading ${dir}:`, err);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return console.error(`Error stating ${filePath}:`, err);
                    if (now - stats.mtimeMs > oneHour) {
                        fs.unlink(filePath, err => {
                            if (err) console.error(`Error deleting ${filePath}:`, err);
                            else console.log(`🧹 Deleted old file: ${filePath}`);
                        });
                    }
                });
            });
        });
    });
});

// ✅ Start server on Railway-assigned port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
