const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { removeBackground } = require('@imgly/background-removal-node');
const schedule = require('node-schedule');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

app.post('/remove-background', upload.single('image'), async (req, res) => {
    try {
        const inputPath = req.file.path;
        const outputPath = path.join('outputs', `${Date.now()}-output.png`);

        if (!fs.existsSync('outputs')) {
            fs.mkdirSync('outputs');
        }

        // Remove background and save file
        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);

        // Delete the temporary uploaded file
        fs.unlinkSync(inputPath);

        // Send the output file URL back to the client
        res.json({ success: true, fileUrl: `/outputs/${path.basename(outputPath)}` });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, error: 'Background removal failed.' });
    }
});

// Automatic cleanup for files older than 1 hour
schedule.scheduleJob('0 * * * *', () => {
    const now = Date.now();
    const outputDir = 'outputs/';
    fs.readdir(outputDir, (err, files) => {
        if (err) return console.error(err);
        files.forEach((file) => {
            const filePath = path.join(outputDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return console.error(err);
                if ((now - stats.mtimeMs) / (1000 * 60 * 60) > 1) {
                    fs.unlink(filePath, (err) => err && console.error(err));
                }
            });
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
