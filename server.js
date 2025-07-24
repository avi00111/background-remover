const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { removeBackground } = require('@imgly/background-removal-node');
const schedule = require('node-schedule');

const app = express();
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Ensure upload and output directories exist
[UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Allowed MIME types
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

// Serve static folders
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(OUTPUTS_DIR));

// Background removal endpoint
app.post('/remove-background', upload.single('image'), async (req, res) => {
    try {
        const inputPath = req.file.path;
        const ext = path.extname(req.file.originalname);
        const baseName = path.basename(req.file.originalname, ext);
        const outputFileName = `${baseName}-output.png`; // always output as PNG
        const outputPath = path.join(OUTPUTS_DIR, outputFileName);

        console.log(`Processing: ${inputPath}`);

        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());

        fs.writeFileSync(outputPath, buffer);
        fs.unlinkSync(inputPath); // clean uploaded temp

        res.json({ success: true, fileUrl: `/outputs/${outputFileName}` });
    } catch (error) {
        console.error('Error removing background:', error.message);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// Clean up files older than 1 hour
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
                            if (err) console.error(`Error deleting file ${filePath}:`, err);
                            else console.log(`Deleted old file: ${filePath}`);
                        });
                    }
                });
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
