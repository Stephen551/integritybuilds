# IntegrityBuilds

Custom-coded websites for content creators and small businesses. No templates, no page builders. Built one at a time in Maryland by Stephen Alatriste.

**Live site:** https://integritybuilds.dev

This repository is the source for the IntegrityBuilds site. It is public so prospective clients can read the actual code behind the work, not just look at screenshots.

## Selected work

Every build is custom and intentionally looks nothing like the others.

- **A&C Meridian** — a web studio's site rebuilt as an immersive three.js experience on Astro 4, with a custom admin panel running underneath. [Case study](https://integritybuilds.dev/work/acmeridian) · [Live](https://acmeridian.co)
- **Skellywags Club** — a streamer's whole business on one URL: merch storefront, three-tier memberships, Discord and Twitch integration. [Case study](https://integritybuilds.dev/work/skellywags) · [Live](https://skellywags.club)
- **Midnight Boost** — a cinematic dark-mode site for an auto detailing business, with a scroll-driven scene and multi-step booking. [Case study](https://integritybuilds.dev/work/midnight-boost)
- **Stillerror** — a SaaS marketing site and tool that both speak the same IDE and debugger dialect. [Case study](https://integritybuilds.dev/work/stillerror)

## Stack

- Static HTML, CSS, and vanilla JavaScript. No framework.
- Cloudflare Pages for hosting, Pages Functions for the backend.
- D1 (SQLite) for intake submissions, R2 for backups, Resend for transactional email.
- Self-hosted fonts (Geist, Fraunces, Instrument Serif) and Lenis for smooth scrolling.
- Strict Content Security Policy and security headers (see `_headers`).

## Structure

- `index.html`, `privacy.html`, `404.html` are the top-level pages
- `work/` holds the case study pages
- `functions/api/` is the intake form handler and the admin backup endpoint
- `migrations/` is the D1 schema
- `images/` and `vendor/` are assets and self-hosted fonts
- `styles.css`, `main.js`, `theme-init.js` are shared styles and behavior
- `deploy.sh` and `wrangler.jsonc` are the build and deploy config

## Contact

Stephen Alatriste · stephenalatriste@integritybuilds.dev · [Fiverr](https://www.fiverr.com/integritybuilds)

## License

All rights reserved. See [LICENSE](LICENSE). You are welcome to read the code. Please do not copy it.
