const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. VIEW ENGINE & STATIC MIDDLEWARE
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout/main');

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const filesDir = path.join(__dirname, 'files');
const dbFilePath = path.join(filesDir, 'urls.json');

// ==========================================
// 2. CUSTOM BACKEND MIDDLEWARE
// ==========================================

// Middleware 1: Request Logger Middleware
const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[SYS_LOG] ${timestamp} // METHOD: ${req.method} // ROUTE: ${req.originalUrl}`);
    next();
};

// Apply logger globally
app.use(requestLogger);
app.use(express.static(path.join(__dirname, 'public')));

// Middleware 2: URL Validation Middleware for POST requests
const validateUrlInput = (req, res, next) => {
    // Support both 'originalUrl' (from Shortify frontend) and 'longUrl'
    const targetUrl = req.body?.originalUrl || req.body?.longUrl;

    if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
        return res.status(400).json({ message: 'Target URL field cannot be empty.' });
    }

    try {
        const parsedUrl = new URL(targetUrl.trim());
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error();
        }
        // Normalize property for downstream handlers
        req.validatedUrl = parsedUrl.href;
    } catch (err) {
        return res.status(400).json({ message: 'Invalid URL format. Must start with http:// or https://' });
    }

    next();
};

// Safe database helpers for serverless environments
function getUrlDatabase() {
    try {
        if (!fs.existsSync(dbFilePath)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
    } catch (err) {
        return {};
    }
}

function saveUrlDatabase(db) {
    try {
        if (!fs.existsSync(filesDir)) {
            fs.mkdirSync(filesDir, { recursive: true });
        }
        fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));
    } catch (err) {
        // Vercel read-only filesystem fallback warning
        console.warn('Note: Filesystem write skipped due to serverless read-only constraints.');
    }
}

// ==========================================
// 3. PAGE ROUTES (EJS Views)
// ==========================================
app.get('/', (req, res) => {
    res.render('pages/dashboard', {
        title: 'Shortify // Dashboard',
        script: ['urlshortner.js', 'links.js']
    });
});

app.get('/analytics-view', (req, res) => {
    res.render('pages/analytics', {
        title: 'Shortify // Link Analytics',
        script: ['analytics.js']
    });
});

app.get('/about', (req, res) => {
    res.render('pages/about', {
        title: 'About Shortify // Simpler Link Sharing',
        script: ['about.js']
    });
});

// ==========================================
// 4. API ENDPOINTS (Frontend Integration)
// ==========================================

// POST: Create short URL
app.post('/api/urls', validateUrlInput, (req, res) => {
    const longUrl = req.validatedUrl;
    const db = getUrlDatabase();

    // Check if URL already exists
    let shortCode = Object.keys(db).find(key => db[key].longUrl === longUrl || db[key].originalUrl === longUrl);
    const isNew = !shortCode;

    if (!shortCode) {
        do {
            shortCode = crypto.randomBytes(3).toString('hex');
        } while (Object.prototype.hasOwnProperty.call(db, shortCode));

        db[shortCode] = {
            shortCode: shortCode,
            longUrl: longUrl,
            originalUrl: longUrl,
            createdAt: new Date().toISOString(),
            clicks: 0,
            lastClicked: null,
            firstClicked: null,
            clickHistory: []
        };
        saveUrlDatabase(db);
    }

    const shortUrl = `${req.protocol}://${req.get('host')}/${shortCode}`;
    res.status(isNew ? 201 : 200).json({
        shortCode,
        shortUrl,
        originalUrl: longUrl,
        createdAt: db[shortCode].createdAt,
        clicks: db[shortCode].clicks
    });
});

// GET: Retrieve all shortened URLs
app.get('/api/urls', (req, res) => {
    const db = getUrlDatabase();
    // Return as an array for easy frontend iteration
    const linksArray = Object.keys(db).map(key => ({
        shortCode: key,
        ...db[key]
    }));
    res.json(linksArray);
});

// GET: Retrieve stats for an individual link
app.get('/api/urls/:shortCode/stats', (req, res) => {
    const { shortCode } = req.params;
    const db = getUrlDatabase();

    if (db[shortCode]) {
        const now = new Date();
        const labels = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(now);
            date.setUTCDate(date.getUTCDate() - (6 - index));
            return date.toISOString().slice(0, 10);
        });
        const dailyCounts = Object.fromEntries(labels.map(label => [label, 0]));
        const clickHistory = Array.isArray(db[shortCode].clickHistory) ? db[shortCode].clickHistory : [];
        clickHistory.forEach(timestamp => {
            const time = Date.parse(timestamp);
            if (!Number.isFinite(time)) return;
            const label = new Date(time).toISOString().slice(0, 10);
            if (Object.prototype.hasOwnProperty.call(dailyCounts, label)) {
                dailyCounts[label] += 1;
            }
        });

        return res.json({
            shortCode,
            longUrl: db[shortCode].longUrl || db[shortCode].originalUrl,
            createdAt: db[shortCode].createdAt,
            clicks: db[shortCode].clicks,
            lastClicked: db[shortCode].lastClicked || null,
            firstClicked: db[shortCode].firstClicked || null,
            dailyClicks: {
                labels,
                data: labels.map(label => dailyCounts[label])
            }
        });
    }

    res.status(404).json({ message: 'Short link record not found.' });
});

// DELETE: Remove a short link
app.delete('/api/urls/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const db = getUrlDatabase();

    if (db[shortCode]) {
        delete db[shortCode];
        saveUrlDatabase(db);
        return res.json({ message: 'Link successfully deleted.' });
    }

    res.status(404).json({ message: 'Link not found.' });
});

// ==========================================
// 5. REDIRECTION DYNAMIC ROUTE
// ==========================================
app.get('/:shortCode', (req, res) => {
    const { shortCode } = req.params;
    const db = getUrlDatabase();

    if (db[shortCode]) {
        const now = new Date();
        const clickedAt = now.toISOString();
        const link = db[shortCode];
        link.clicks = Number.isSafeInteger(link.clicks) && link.clicks >= 0 ? link.clicks + 1 : 1;
        link.firstClicked = link.firstClicked || clickedAt;
        link.lastClicked = clickedAt;
        link.clickHistory = Array.isArray(link.clickHistory) ? link.clickHistory : [];
        const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        link.clickHistory = link.clickHistory.filter(timestamp => {
            const time = Date.parse(timestamp);
            return Number.isFinite(time) && time >= cutoff;
        });
        link.clickHistory.push(clickedAt);
        saveUrlDatabase(db);
        
        const targetUrl = link.longUrl || link.originalUrl;
        return res.redirect(targetUrl);
    }

    res.status(404).send(`
        <body style="background:#0B1020; color:#EF4444; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;">
            <div style="text-align:center;">
                <h1>404 - Link Not Found</h1>
                <p style="color:#94A3B8; margin-top:10px;">The short link you requested does not exist or has expired.</p>
            </div>
        </body>
    `);
});

app.use((err, req, res, next) => {
    console.error('Request failed:', err);
    if (res.headersSent) return next(err);
    const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
        ? err.status
        : 500;
    if (req.path.startsWith('/api/')) {
        return res.status(statusCode).json({
            message: statusCode < 500 ? 'Invalid request.' : 'An internal server error occurred.'
        });
    }
    res.status(statusCode).send(statusCode < 500 ? 'Invalid request.' : 'An internal server error occurred.');
});

// ==========================================
// 6. INITIALIZE SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`> Shortify server running live on port ${PORT}`);
});