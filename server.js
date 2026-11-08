require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

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
let sql;
let schemaReady;

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

function getSql() {
    if (!process.env.DATABASE_URL) {
        const error = new Error('DATABASE_URL is not configured. Add your Neon connection string to the deployment environment.');
        error.status = 503;
        throw error;
    }

    if (!sql) {
        sql = neon(process.env.DATABASE_URL);
    }

    return sql;
}

function toIsoString(value, fallback = null) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

async function initializeDatabase() {
    if (!schemaReady) {
        schemaReady = (async () => {
            const db = getSql();
            await db`
                CREATE TABLE IF NOT EXISTS shortify_urls (
                    short_code TEXT PRIMARY KEY,
                    long_url TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    clicks INTEGER NOT NULL DEFAULT 0,
                    last_clicked TIMESTAMPTZ,
                    first_clicked TIMESTAMPTZ,
                    click_history JSONB NOT NULL DEFAULT '[]'::jsonb
                )
            `;
            await db`
                CREATE TABLE IF NOT EXISTS shortify_migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `;

            const [migration] = await db`
                SELECT name FROM shortify_migrations WHERE name = 'legacy_urls_json'
            `;
            if (migration) return;

            if (fs.existsSync(dbFilePath)) {
                const legacyData = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
                if (!legacyData || typeof legacyData !== 'object' || Array.isArray(legacyData)) {
                    throw new Error('Legacy URL database must contain a JSON object.');
                }

                for (const [shortCode, link] of Object.entries(legacyData)) {
                    if (!link || typeof link !== 'object') continue;
                    const longUrl = link.longUrl || link.originalUrl;
                    if (typeof longUrl !== 'string' || !longUrl) continue;

                    const createdAt = toIsoString(link.createdAt, new Date().toISOString());
                    const firstClicked = toIsoString(link.firstClicked);
                    const lastClicked = toIsoString(link.lastClicked);
                    const clicks = Number.isSafeInteger(link.clicks) && link.clicks >= 0 ? link.clicks : 0;
                    const clickHistory = Array.isArray(link.clickHistory)
                        ? link.clickHistory.filter(timestamp => typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)))
                        : [];

                    await db`
                        INSERT INTO shortify_urls
                            (short_code, long_url, created_at, clicks, first_clicked, last_clicked, click_history)
                        VALUES
                            (${shortCode}, ${longUrl}, ${createdAt}, ${clicks}, ${firstClicked}, ${lastClicked}, ${JSON.stringify(clickHistory)}::jsonb)
                        ON CONFLICT (short_code) DO NOTHING
                    `;
                }

                await db`
                    INSERT INTO shortify_migrations (name)
                    VALUES ('legacy_urls_json')
                    ON CONFLICT (name) DO NOTHING
                `;
            }
        })().catch(error => {
            schemaReady = null;
            throw error;
        });
    }

    await schemaReady;
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
app.post('/api/urls', validateUrlInput, async (req, res) => {
    const longUrl = req.validatedUrl;
    await initializeDatabase();
    const db = getSql();
    const [existingLink] = await db`
        SELECT short_code AS "shortCode", created_at AS "createdAt", clicks
        FROM shortify_urls
        WHERE long_url = ${longUrl}
        LIMIT 1
    `;

    let link = existingLink;
    let isNew = false;
    if (!link) {
        isNew = true;
        for (let attempt = 0; attempt < 5; attempt++) {
            const shortCode = crypto.randomBytes(3).toString('hex');
            const [insertedLink] = await db`
                INSERT INTO shortify_urls (short_code, long_url)
                VALUES (${shortCode}, ${longUrl})
                ON CONFLICT (short_code) DO NOTHING
                RETURNING short_code AS "shortCode", created_at AS "createdAt", clicks
            `;
            if (insertedLink) {
                link = insertedLink;
                break;
            }
        }

        if (!link) {
            throw new Error('Could not generate a unique short code. Please try again.');
        }
    }

    const shortUrl = `${req.protocol}://${req.get('host')}/${link.shortCode}`;
    res.status(isNew ? 201 : 200).json({
        shortCode: link.shortCode,
        shortUrl,
        originalUrl: longUrl,
        createdAt: toIsoString(link.createdAt),
        clicks: link.clicks
    });
});

// GET: Retrieve all shortened URLs
app.get('/api/urls', async (req, res) => {
    await initializeDatabase();
    const db = getSql();
    const links = await db`
        SELECT
            short_code AS "shortCode",
            long_url AS "longUrl",
            created_at AS "createdAt",
            clicks,
            last_clicked AS "lastClicked",
            first_clicked AS "firstClicked",
            click_history AS "clickHistory"
        FROM shortify_urls
        ORDER BY created_at DESC
    `;
    res.json(links.map(link => ({
        ...link,
        originalUrl: link.longUrl,
        createdAt: toIsoString(link.createdAt),
        lastClicked: toIsoString(link.lastClicked),
        firstClicked: toIsoString(link.firstClicked),
        clickHistory: Array.isArray(link.clickHistory) ? link.clickHistory : []
    })));
});

// GET: Retrieve stats for an individual link
app.get('/api/urls/:shortCode/stats', async (req, res) => {
    const { shortCode } = req.params;
    await initializeDatabase();
    const db = getSql();
    const [link] = await db`
        SELECT
            short_code AS "shortCode",
            long_url AS "longUrl",
            created_at AS "createdAt",
            clicks,
            last_clicked AS "lastClicked",
            first_clicked AS "firstClicked",
            click_history AS "clickHistory"
        FROM shortify_urls
        WHERE short_code = ${shortCode}
    `;

    if (!link) {
        return res.status(404).json({ message: 'Short link record not found.' });
    }

    const now = new Date();
    const labels = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - (6 - index));
        return date.toISOString().slice(0, 10);
    });
    const dailyCounts = Object.fromEntries(labels.map(label => [label, 0]));
    const clickHistory = Array.isArray(link.clickHistory) ? link.clickHistory : [];
    clickHistory.forEach(timestamp => {
        const time = Date.parse(timestamp);
        if (!Number.isFinite(time)) return;
        const label = new Date(time).toISOString().slice(0, 10);
        if (Object.prototype.hasOwnProperty.call(dailyCounts, label)) {
            dailyCounts[label] += 1;
        }
    });

    res.json({
        shortCode,
        longUrl: link.longUrl,
        createdAt: toIsoString(link.createdAt),
        clicks: link.clicks,
        lastClicked: toIsoString(link.lastClicked),
        firstClicked: toIsoString(link.firstClicked),
        dailyClicks: {
            labels,
            data: labels.map(label => dailyCounts[label])
        }
    });
});

// DELETE: Remove a short link
app.delete('/api/urls/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    await initializeDatabase();
    const db = getSql();
    const deletedLinks = await db`
        DELETE FROM shortify_urls
        WHERE short_code = ${shortCode}
        RETURNING short_code
    `;
    if (deletedLinks.length > 0) {
        return res.json({ message: 'Link successfully deleted.' });
    }

    res.status(404).json({ message: 'Link not found.' });
});

// ==========================================
// 5. REDIRECTION DYNAMIC ROUTE
// ==========================================
app.get('/test-db', async (req, res) => {
    try {
        const [result] = await getSql()`SELECT NOW() AS current_time`;
        res.json({
            success: true,
            message: 'Neon PostgreSQL connected successfully!',
            time: result.current_time
        });
    } catch (error) {
        console.error('Database connection test failed:', error);
        res.status(500).json({
            success: false,
            message: 'Database connection failed'
        });
    }
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    await initializeDatabase();
    const db = getSql();
    const [link] = await db`
        UPDATE shortify_urls
        SET
            clicks = clicks + 1,
            first_clicked = COALESCE(first_clicked, NOW()),
            last_clicked = NOW(),
            click_history = (
                SELECT COALESCE(jsonb_agg(history.timestamp), '[]'::jsonb)
                FROM jsonb_array_elements_text(shortify_urls.click_history) AS history(timestamp)
                WHERE history.timestamp::timestamptz >= NOW() - INTERVAL '7 days'
            ) || jsonb_build_array(to_jsonb(NOW()::text))
        WHERE short_code = ${shortCode}
        RETURNING long_url AS "longUrl"
    `;

    if (link) {
        return res.redirect(link.longUrl);
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
    const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    if (req.path.startsWith('/api/')) {
        return res.status(statusCode).json({
            message: statusCode === 503
                ? err.message
                : statusCode < 500 ? 'Invalid request.' : 'An internal server error occurred.'
        });
    }
    res.status(statusCode).send(statusCode === 503
        ? err.message
        : statusCode < 500 ? 'Invalid request.' : 'An internal server error occurred.');
});

// ==========================================
// 6. INITIALIZE SERVER
// ==========================================
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`> Shortify server running live on port ${PORT}`);
    });
}

module.exports = app;