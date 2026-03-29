const express = require("express");
const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || "./data/pixel-track.db";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "pixel-track-secret-change-me";

// ── Token generator ───────────────────────────────────────────────────────────
function makeToken(id) {
  return crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(id)
    .digest("base64url")
    .slice(0, 10);
}

// ── Rate limiter (in-memory) ──────────────────────────────────────────────────
// key: `${ip}:${pixelId}` → timestamp of last recorded open
const rateLimitCache = new Map();
const RATE_LIMIT_MS = 60 * 1000; // 60 seconds

function isRateLimited(ip, pixelId) {
  const key = `${ip}:${pixelId}`;
  const last = rateLimitCache.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) return true;
  rateLimitCache.set(key, now);
  return false;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const [key, ts] of rateLimitCache) {
    if (ts < cutoff) rateLimitCache.delete(key);
  }
}, 5 * 60 * 1000);

// ── DB init ───────────────────────────────────────────────────────────────────
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS pixels (
    id          TEXT PRIMARY KEY,
    token       TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL DEFAULT '',
    campaign    TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pixel_id    TEXT NOT NULL,
    opened_at   INTEGER NOT NULL,
    ip          TEXT,
    user_agent  TEXT,
    referer     TEXT,
    FOREIGN KEY (pixel_id) REFERENCES pixels(id)
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id          TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    last_fired_at INTEGER,
    fire_count  INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_events_pixel_id ON events(pixel_id);
  CREATE INDEX IF NOT EXISTS idx_events_opened_at ON events(opened_at);
  CREATE INDEX IF NOT EXISTS idx_pixels_token ON pixels(token);
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtInsertPixel = db.prepare(
  "INSERT INTO pixels (id, token, label, campaign, created_at) VALUES (?, ?, ?, ?, ?)"
);
const stmtInsertEvent = db.prepare(
  "INSERT INTO events (pixel_id, opened_at, ip, user_agent, referer) VALUES (?, ?, ?, ?, ?)"
);
const stmtGetPixelById = db.prepare("SELECT * FROM pixels WHERE id = ?");
const stmtGetPixelByToken = db.prepare("SELECT * FROM pixels WHERE token = ?");
const stmtListPixels = db.prepare(`
  SELECT p.*,
    COUNT(e.id) AS open_count,
    MAX(e.opened_at) AS last_opened_at
  FROM pixels p
  LEFT JOIN events e ON e.pixel_id = p.id
  GROUP BY p.id
  ORDER BY p.created_at DESC
`);
const stmtGetEvents = db.prepare(
  "SELECT * FROM events WHERE pixel_id = ? ORDER BY opened_at DESC LIMIT 100"
);
const stmtStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM pixels) AS total_pixels,
    (SELECT COUNT(*) FROM events) AS total_opens,
    (SELECT COUNT(DISTINCT pixel_id) FROM events) AS pixels_with_opens
`);
const stmtInsertWebhook = db.prepare(
  "INSERT INTO webhooks (id, url, label, created_at) VALUES (?, ?, ?, ?)"
);
const stmtListWebhooks = db.prepare(
  "SELECT * FROM webhooks ORDER BY created_at DESC"
);
const stmtDeleteWebhook = db.prepare("DELETE FROM webhooks WHERE id = ?");
const stmtUpdateWebhookFired = db.prepare(
  "UPDATE webhooks SET last_fired_at = ?, fire_count = fire_count + 1 WHERE id = ?"
);

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// ── Webhook dispatcher ────────────────────────────────────────────────────────
async function fireWebhooks(payload) {
  const webhooks = stmtListWebhooks.all();
  for (const wh of webhooks) {
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      stmtUpdateWebhookFired.run(Date.now(), wh.id);
      console.log(`[webhook] fired ${wh.url} → ${res.status}`);
    } catch (err) {
      console.error(`[webhook] failed ${wh.url}: ${err.message}`);
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Tracking endpoint ─────────────────────────────────────────────────────────
app.get("/t/:token", (req, res) => {
  const pixel = stmtGetPixelByToken.get(req.params.token);

  if (pixel) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.socket.remoteAddress;

    if (!isRateLimited(ip, pixel.id)) {
      const now = Date.now();
      stmtInsertEvent.run(
        pixel.id,
        now,
        ip,
        req.headers["user-agent"] || null,
        req.headers["referer"] || null
      );

      fireWebhooks({
        event: "pixel.opened",
        pixel_id: pixel.id,
        token: pixel.token,
        label: pixel.label,
        campaign: pixel.campaign,
        opened_at: now,
        ip,
        user_agent: req.headers["user-agent"] || null,
        referer: req.headers["referer"] || null,
      }).catch(() => {});
    } else {
      console.log(`[rate-limit] skipped ${ip} → ${pixel.id}`);
    }
  }

  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.send(PIXEL_GIF);
});

// ── API ───────────────────────────────────────────────────────────────────────

// POST /api/pixels
app.post("/api/pixels", (req, res) => {
  const { label = "", campaign = "" } = req.body || {};
  const id = uuidv4();
  const token = makeToken(id);
  stmtInsertPixel.run(id, token, label, campaign, Date.now());
  res.status(201).json({ id, token, label, campaign });
});

// GET /api/pixels
app.get("/api/pixels", (_req, res) => {
  res.json(stmtListPixels.all());
});

// GET /api/pixels/:id
app.get("/api/pixels/:id", (req, res) => {
  const pixel = stmtGetPixelById.get(req.params.id);
  if (!pixel) return res.status(404).json({ error: "Pixel not found" });
  const events = stmtGetEvents.all(req.params.id);
  res.json({ ...pixel, events });
});

// DELETE /api/pixels/:id
app.delete("/api/pixels/:id", (req, res) => {
  const pixel = stmtGetPixelById.get(req.params.id);
  if (!pixel) return res.status(404).json({ error: "Pixel not found" });
  db.prepare("DELETE FROM events WHERE pixel_id = ?").run(req.params.id);
  db.prepare("DELETE FROM pixels WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// GET /api/stats
app.get("/api/stats", (_req, res) => {
  res.json(stmtStats.get());
});

// POST /api/webhooks
app.post("/api/webhooks", (req, res) => {
  const { url, label = "" } = req.body || {};
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return res.status(400).json({ error: "Valid URL required" });
  }
  const id = uuidv4();
  stmtInsertWebhook.run(id, url, label, Date.now());
  res.status(201).json({ id, url, label });
});

// GET /api/webhooks
app.get("/api/webhooks", (_req, res) => {
  res.json(stmtListWebhooks.all());
});

// DELETE /api/webhooks/:id
app.delete("/api/webhooks/:id", (req, res) => {
  stmtDeleteWebhook.run(req.params.id);
  res.json({ success: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`pixel-track running on http://localhost:${PORT}`);
});

module.exports = app;