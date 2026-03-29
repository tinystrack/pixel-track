# pixel-track

> Self-hosted email tracking pixel. Own your data, deploy in 2 minutes.

![Deploy](https://github.com/tinystrack/pixel-track/actions/workflows/deploy.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## What it does

pixel-track is a tiny Express server that generates 1×1 tracking pixels for emails. Embed the pixel in any email — every open is logged with timestamp, IP, and user-agent. No SaaS, no subscription, no data leaving your server.

- **Generate pixels** with labels & campaign tags
- **Track opens** in real time on a built-in dashboard
- **Webhook support** — POST to any URL on every open
- **Short encrypted token IDs** — no guessable UUIDs in URLs
- **SQLite** — zero-dependency storage, one file
- **Docker** — up and running in under 2 minutes

---

## Quick start
```bash
git clone https://github.com/tinystrack/pixel-track.git
cd pixel-track
docker compose up -d
```

Open `http://localhost:3000` — dashboard is live.

**Without Docker:**
```bash
npm install
npm start
```

Requires Node.js 18+.

---

## How to use

1. Open the dashboard → click **Generate Pixel**
2. Add a label (e.g. `April Newsletter`) and optional campaign tag
3. Copy the embed snippet:
```html
   <img src="https://yourserver.com/t/TOKEN" width="1" height="1" alt="" style="display:none" />
```
4. Paste into your email HTML before sending
5. Watch opens appear on the dashboard in real time

---

## Webhooks

Register a webhook URL in the dashboard and pixel-track will POST to it on every open:
```json
{
  "event": "pixel.opened",
  "pixel_id": "...",
  "token": "aB3xK9mP",
  "label": "April Newsletter",
  "campaign": "onboarding-v2",
  "opened_at": 1712345678901,
  "ip": "1.2.3.4",
  "user_agent": "...",
  "referer": null
}
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pixels` | Create pixel `{ label, campaign }` |
| `GET` | `/api/pixels` | List all pixels with open counts |
| `GET` | `/api/pixels/:id` | Single pixel + last 100 events |
| `DELETE` | `/api/pixels/:id` | Delete pixel + all events |
| `GET` | `/api/stats` | Aggregate stats |
| `POST` | `/api/webhooks` | Register webhook `{ url, label }` |
| `GET` | `/api/webhooks` | List webhooks |
| `DELETE` | `/api/webhooks/:id` | Remove webhook |
| `GET` | `/t/:token` | Tracking endpoint — returns 1×1 GIF |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/pixel-track.db` | SQLite path |
| `TOKEN_SECRET` | *(change this)* | HMAC secret for pixel token generation |
| `RATE_LIMIT_MS` | `60000` | Minimum ms between opens from same IP per pixel |
**Important:** set `TOKEN_SECRET` to a random string in production:
```bash
openssl rand -hex 32
```

---

## Deploy to your server
```bash
git clone https://github.com/tinystrack/pixel-track.git
cd pixel-track
docker compose up -d
```

Nginx reverse proxy for HTTPS:
```nginx
server {
    listen 443 ssl;
    server_name track.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

---

## Need more?

pixel-track is intentionally minimal — a self-hosted building block.

For **team dashboards**, **link tracking**, **open-rate analytics**, **deliverability insights**, and **ESP integrations** without managing infra, check out **[MailTrace](https://mailtrace.io?ref=pixel-track)** — the hosted version with batteries included.

---

## License

MIT — do whatever you want with it.

---

*Built by [Lyra](https://github.com/tinystrack) — solo indie dev, 7 SaaS products shipped.*