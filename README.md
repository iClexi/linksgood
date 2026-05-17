<div align="center">

# Linksgood

### Fast links, clean QR codes, optional accounts, and visible activity.

![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61dafb)
![Vite](https://img.shields.io/badge/Vite-646cff?style=for-the-badge&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-1f7a1f?style=for-the-badge&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-30557c?style=for-the-badge&logo=postgresql&logoColor=white)
![Anime.js](https://img.shields.io/badge/Anime.js-ea2b1f?style=for-the-badge&logo=javascript&logoColor=white)
![QR](https://img.shields.io/badge/QR_Codes-111827?style=for-the-badge&logo=qrcode&logoColor=white)

**Tags:** `link-shortener` · `qr-generator` · `typescript` · `react` · `postgresql` · `privacy-conscious` · `self-hosted`

</div>

---

## What It Is

Linksgood is a small, production-oriented link studio. It creates short links, readable long links, QR codes, and activity pages without forcing visitors through ads or an account wall.

The primary flow is intentionally low-friction:

1. Paste a destination URL.
2. Choose a short or long alias style.
3. Optionally customize alias, social title, description, and preview image.
4. Generate a clean link and QR code.
5. Review basic activity if you created the link with an owner key or while signed in.

Accounts are optional. A signed-in account adds history, session visibility, account-based QR downloads, and account-based activity access for links created while logged in.

## Product Principles

- **Fast first:** creating a link should feel instant.
- **No intrusive ads:** links redirect directly to the destination.
- **No hidden tracking page:** there is no intermediate browser fingerprinting screen before redirect.
- **Visible activity:** the creator can see server-side request activity for operational insight.
- **Optional identity:** login/register improves history and management, but does not block the core tool.
- **Secrets stay out of Git:** runtime secrets belong in environment files or a secret manager, never in this repository.

## Features

- Short links under `/s/<alias>`.
- Long, readable paths under `/go/<path>`.
- Custom aliases.
- QR SVG and PNG generation.
- Automatic preview metadata detection with anti-SSRF URL validation.
- Editable Open Graph style title, description, and image.
- Owner-key activity pages for newly generated links.
- Account history for signed-in users.
- Account-authenticated activity pages for older account links.
- Account session list and session revocation.
- Admin overview for links, visits, and users.
- Direct redirects for link and QR opens.
- Visit retention controlled by environment configuration.
- Responsive interface for phone, tablet, and desktop.
- Anime.js-enhanced load, hover, panel, and activity animations.

## Privacy Model

Linksgood records basic request metadata when a link or QR is opened. This is used for creator-visible activity, abuse diagnosis, and operational visibility.

Typical visit records may include:

- visited time,
- source (`link` or `qr`),
- public IP received by the proxy,
- user-agent,
- referrer,
- accepted language,
- minimal server/proxy delivery metadata.

It does **not** use a redirect interstitial to collect viewport, screen size, timezone, battery, sensors, or browser fingerprint data before sending the visitor to the destination.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Motion | Anime.js, Anime.js SplitText, CSS transitions |
| Icons | Lucide React |
| Backend | Node.js HTTP server, TypeScript |
| Database | PostgreSQL via `pg` |
| QR | `qrcode` |
| Build | Vite frontend build + TypeScript backend build |

## Project Structure

```text
links-work/
├── frontend/
│   ├── main.tsx       # React app
│   └── styles.css     # Source styles
├── public/
│   ├── app.js         # Built frontend bundle
│   ├── styles.css     # Built CSS
│   ├── account.js     # Account dashboard behavior
│   ├── admin.js       # Admin dashboard behavior
│   ├── stats.js       # Activity dashboard behavior
│   └── anime.esm.min.js
├── sql/
│   └── schema.sql
├── deploy/
│   ├── links.service
│   └── 007-links.conf
├── server.ts          # Backend source
├── dist/server.js     # Compiled backend
└── README.md
```

## Environment

Copy `.env.example` into a local, ignored environment file and fill in private values outside Git.

Required values:

| Variable | Purpose |
| --- | --- |
| `LINKS_PUBLIC_URL` | Public base URL used for generated links and QR URLs. |
| `LINKS_DATABASE_URL` | PostgreSQL connection string. |
| `LINKS_APP_SECRET` | Long random secret for sessions, owner keys, and HMACs. |

Optional values:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `LINKS_PORT` | `9827` | HTTP listen port. |
| `LINKS_SESSION_TTL_SECONDS` | `2592000` | Account session lifetime. |
| `LINKS_PASSWORD_ITERATIONS` | `210000` | PBKDF2 password hashing work factor. |
| `LINKS_RETENTION_DAYS` | `15` | Visit activity retention window. |

Do not commit real database URLs, secrets, tokens, cookies, or production environment files.

## Local Development

```bash
npm install
npm run check
npm start
```

The app listens on `LINKS_PORT`, defaulting to `9827`.

Useful scripts:

```bash
npm run build          # Build backend and frontend
npm run typecheck      # Typecheck frontend and backend
npm run check          # JS syntax checks + typecheck + production build
npm start              # Run dist/server.js
```

## Deployment Notes

This project is designed for a plain systemd deployment behind a reverse proxy. The included deployment files are templates and should be adapted to the target host.

General runtime pattern:

1. Build the app.
2. Sync source, `public/`, `dist/`, `sql/`, and deploy templates to the server.
3. Provide the real environment through a protected environment file.
4. Restart the `links` service.
5. Verify `/api/health`.

## Security Notes

- Passwords are salted and hashed with PBKDF2.
- Session tokens are stored as HMAC hashes.
- Owner keys are stored as HMAC hashes.
- URL preview fetching rejects private, loopback, link-local, multicast, and unsafe hosts.
- HTTP responses for APIs use `cache-control: no-store`.
- Admin pages require an authenticated admin session.
- QR and redirect visits are recorded directly server-side.

## License

Private project unless a license is added. Use the code responsibly and only shorten links you are allowed to share.
