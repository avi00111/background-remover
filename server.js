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

// Allowed file types
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${file.fieldname}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only JPEG, PNG, and WEBP files are supported.'));
    }
});

// Serve static folders
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(OUTPUTS_DIR));

app.post('/remove-background', upload.single('image'), async (req, res) => {
    try {
        const inputPath = req.file.path;
        const outputFileName = `${Date.now()}-output.png`;
        const outputPath = path.join(OUTPUTS_DIR, outputFileName);

        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());

        fs.writeFileSync(outputPath, buffer);
        fs.unlinkSync(inputPath); // Delete original upload

        res.json({ success: true, fileUrl: `/outputs/${outputFileName}` });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// Scheduled cleanup every hour
schedule.scheduleJob('0 * * * *', () => {
    const now = Date.now();
    const oneHour = 1000 * 60 * 60;

    [UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
        fs.readdir(dir, (err, files) => {
            if (err) return console.error(err);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return console.error(err);
                    if (now - stats.mtimeMs > oneHour) {
                        fs.unlink(filePath, err => err && console.error(err));
                    }
                });
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
