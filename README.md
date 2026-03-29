# pixel-track

> Self-hosted email tracking pixel server. Own your data, deploy in minutes.

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## What it does

pixel-track gives you a tiny Express server that generates 1×1 tracking pixels for emails. Embed the pixel in any email you send — every open is logged with timestamp, IP, and user-agent.

- **Generate pixels** with labels & campaign tags
- **Track opens** in real time
- **Dashboard UI** built in — no extra tools needed
- **SQLite** for zero-dependency storage
- **Docker** deploy in under 2 minutes

---

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/yourname/pixel-track.git
cd pixel-track
docker compose up -d
```

Open `http://localhost:3000` — dashboard is live.

### Without Docker

```bash
npm install
npm start
```

Requires Node.js 18+.

---

## How to use

1. Open the dashboard and click **Generate Pixel**
2. Add a label (e.g. `April Newsletter`) and optional campaign tag
3. Copy the embed snippet:
   ```html
   <img src="https://yourserver.com/t/PIXEL-ID" width="1" height="1" alt="" style="display:none" />
   ```
4. Paste it into your email HTML before sending
5. Watch opens roll in on the dashboard

---

## API

All endpoints return JSON.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pixels` | Create pixel (`{ label, campaign }`) |
| `GET` | `/api/pixels` | List all pixels with open counts |
| `GET` | `/api/pixels/:id` | Single pixel + last 100 events |
| `DELETE` | `/api/pixels/:id` | Delete pixel + all events |
| `GET` | `/api/stats` | Aggregate stats |
| `GET` | `/t/:pixelId` | Tracking endpoint (returns 1×1 GIF) |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/pixel-track.db` | SQLite database path |

---

## Deploy to your server

```bash
# On your server (e.g. Ubuntu 22.04)
git clone https://github.com/yourname/pixel-track.git
cd pixel-track
docker compose up -d

# With a custom port
PORT=8080 docker compose up -d
```

Put Nginx in front for HTTPS:

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

pixel-track is intentionally minimal — it's a self-hosted building block.

If you want **team dashboards**, **link tracking**, **open-rate analytics**, **deliverability insights**, and **ESP integrations** without managing infra, check out **[MailTrace](https://mailtrace.io?ref=pixel-track)** — the hosted version with batteries included.

---

## License

MIT — do whatever you want with it.
