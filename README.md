# Shivam Stack — Backend

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://mongoosejs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A REST API and real-time backend for a full-stack developer's service business: it serves the public marketing/portfolio site, a customer-facing user portal (auth, orders, downloads, messages), and an admin dashboard used to run the business (content, catalog, coupons, subscribers, bookings, and inbound messages).

**API base (production):** `https://shivam-stack-backend.onrender.com` (deployed separately — confirm the current URL before relying on it)
**Frontend / consumer of this API:** [`Shivam_Stack_Frontend`](https://github.com/Itachi7011/Shivam_Stack_Frontend) — a separate repository, not part of this codebase.

---

## Table of Contents

- [Why this project exists](#why-this-project-exists)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Local development](#local-development)
- [API documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why this project exists

Independent developers and small dev studios need more than a static portfolio: a way to list services, showcase projects and case studies, publish a blog, sell digital products (templates, ebooks, resources), take bookings for calls, and manage all of it from an admin panel — without paying for a full SaaS website builder.

This repository is the **backend** half of that system: a single Express + MongoDB API that serves three audiences (public visitors, logged-in customers, and the site admin) from one codebase, with cookie/JWT authentication, Cloudinary-backed file uploads, transactional email, and Socket.io for real-time messaging.

## Solution

Rather than separate services, the API is organized as Express routers mounted under `/api/*`, each covering one domain (users, admin, products, blogs, projects, coupons, analytics, public/aggregated endpoints, and user↔admin messaging). Two independent JWT-based auth flows — one for customers, one for admins — gate access to their respective resources, backed by MongoDB via Mongoose.

## Features

**Public API** (no auth required)
- Product catalog with categories, slugs, and search/pagination (`/api/public/products`)
- Blog listing, single-post view, likes, and comments (`/api/public/blogs`)
- Project/portfolio listing, single-project view, likes, and comments (`/api/public/projects`)
- Case studies listing and detail view
- Services listing, available booking slots, and call bookings ("book a free call") with confirmation/reminder/cancellation emails
- Contact form submission
- Newsletter subscribe/unsubscribe
- Digital product downloads (`/api/public/download/:id`)
- System health endpoint used by the keep-alive scheduler

**User portal** (`/api/users/*`, cookie + JWT auth)
- Registration with email verification (OTP), resend verification
- Login, refresh token, logout, logout-all-sessions
- Forgot/reset password with token validation
- Profile fetch/update, change password
- Activity log, account deletion
- Google/GitHub OAuth routes exist but are **stubs** — see [Known limitations](#known-limitations)
- User-to-admin conversation threads and messaging (`/api/users/messages`)

**Admin dashboard API** (`/api/admin/*`, JWT auth, role/permission-gated)
- Admin registration, login, forgot/reset password, logout
- TOTP-based two-factor authentication (enable/verify/disable) via `speakeasy`
- Dashboard statistics and analytics overview endpoints (content, commerce, portfolio, recent activity)
- Full CRUD-style management for: products + categories, blogs + categories, projects + categories, coupons, reviews, case studies, users, other admins (role/permission/block management), contact messages, "book a free call" entries, newsletter subscribers, invoices, payments, downloads
- Bulk actions (bulk status update, bulk delete) for several of the above
- Invoice PDF generation via `pdfkit`
- Admin activity log / audit trail
- Site-wide settings

**Real-time**
- Socket.io server with JWT-authenticated handshake, separate rooms for users and admins, used for the messaging feature

**Background jobs**
- `node-cron` job (hourly) that emails booking reminders ~1 hour before a confirmed call
- `node-cron` keep-alive job (every minute) that pings the deployed API's health endpoint and logs a user count — mitigates cold starts on free-tier hosting (Render)

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database / ODM | MongoDB via Mongoose |
| Authentication | JSON Web Tokens (`jsonwebtoken`), cookies (`cookie-parser`), password hashing (`bcryptjs`) |
| Two-factor auth | `speakeasy` (TOTP) — admin only |
| Real-time | Socket.io |
| File storage | Cloudinary (`cloudinary`, `multer` for multipart handling) |
| Email | SendGrid (`@sendgrid/mail`) |
| PDF generation | `pdfkit` (invoices) |
| Scheduled jobs | `node-cron` |
| Security middleware | `helmet`, `hpp`, `express-rate-limit`, `cors`, `compression` |
| Validation | `express-validator` |
| System diagnostics | `systeminformation` (used by the public system-health endpoint) |

`passport` is listed as a dependency but is not imported or used anywhere in the codebase — see [Known limitations](#known-limitations).

This is a **JavaScript** project (`.js`, CommonJS `require`/`module.exports`). There is no TypeScript, no build step, and no transpilation — `app.js` is run directly by Node.

## Architecture

```
                        ┌─────────────────────────────┐
                        │           app.js             │
                        │  helmet · cors · hpp          │
                        │  cookie-parser · compression   │
                        │  express.json / urlencoded      │
                        └───────────────┬─────────────────┘
                                        │
      ┌───────────────┬───────────────┼───────────────┬───────────────┐
      ▼               ▼               ▼               ▼               ▼
/api/users     /api/admin       /api/admin/*      /api/public    /api/users/messages
(user auth,    (admin auth,     products/blogs/    (aggregated    (user↔admin
 profile,       2FA, dashboard,  coupons/projects   public reads:  conversations,
 activities)    analytics)       /admin routes)      catalog,       Socket.io-backed)
                                                     blog, projects,
                                                     bookings,
                                                     contact,
                                                     newsletter)
      │               │               │               │
      └───────┬───────┴───────┬───────┴───────┬───────┘
              ▼               ▼               ▼
      Mongoose models   Cloudinary (uploads)  SendGrid (email)
      (MongoDB Atlas     via cloudinaryUploader emailService.js
       or self-hosted)   middleware
              │
              ▼
      node-cron jobs: hourly booking reminders,
      per-minute keep-alive ping (Render free-tier)
```

Two independent JWT auth flows share the same secret (`JWT_SECRET`) but separate token stores:
- **User auth** (`middleware/userAuth.js`) — reads the `cookies1` cookie or a `Bearer` header, validates against a `tokens[]` array embedded in the `User` document (supports per-session revocation and "logout all").
- **Admin auth** (`middleware/adminAuth.js`) — reads the `adminToken` cookie or a `Bearer` header, validates the same way against the `Admin` document, and additionally checks `isActive`/`isBlocked`. A `hasPermission()` factory gates specific admin routes by permission string; `superadmin` bypasses all permission checks.

Route handlers are written **directly inside the Express router files** in `routes/` for most domains (e.g. `routes/product_routes.js`, `routes/admin_routes.js`). The one exception is messaging: `routes/message_routes.js` actually imports and uses `controllers/message_controller.js` and `controllers/admin_nessage_controller.js`, which are fully implemented. The other eight controller files (`analytics_controller.js`, `auth_controller.js`, `blog_controller.js`, `coupon_controller.js`, `order_controller.js`, `payment_controller.js`, `product_controller.js`, `project_controller.js`) are empty placeholders, and `controllers/user_controller.js` is a byte-for-byte duplicate of `message_controller.js` that is not imported anywhere. This is documented as observed fact, not a recommendation; see [Known limitations](#known-limitations) and `docs/architecture.md` for the full breakdown.

> **RECOMMENDED ADDITION:** a rendered architecture diagram (PNG/SVG export of the block diagram above) under `docs/assets/`.

## Project structure

```
.
├── app.js                     # Express app entry point, middleware wiring, DB connect, Socket.io init
├── config/
│   ├── cloudinary.js          # Cloudinary SDK config (implemented)
│   ├── db.js                  # Empty — DB connection is actually done inline in app.js
│   ├── razorpay.js            # Empty — no payment gateway integration exists yet
│   └── scheduler.js           # Wraps scheduler/keepAlive.js; not currently invoked from app.js
├── controllers/
│   ├── message_controller.js         # Implemented — used by routes/message_routes.js
│   ├── admin_nessage_controller.js   # Implemented — used by routes/message_routes.js (filename has a typo, kept as-is)
│   ├── user_controller.js            # Implemented but unused — exact duplicate of message_controller.js, not imported anywhere
│   └── (8 more)                      # analytics/auth/blog/coupon/order/payment/product/project — all empty
├── jobs/
│   └── cronJobs.js             # Empty
├── middleware/
│   ├── adminAuth.js            # Implemented — admin JWT auth, permissions
│   ├── userAuth.js             # Implemented — user JWT auth
│   ├── cloudinaryUploader.js   # Implemented — multer + Cloudinary upload middleware
│   ├── admin.middleware.js     # Empty
│   ├── error.middleware.js     # Empty — no centralized error handler; routes handle errors inline
│   └── upload.middleware.js    # Empty
├── models/
│   ├── admin/                  # Admin, AdminActivity, AnalyticsSnapshot, AuditLog, SiteSettings
│   ├── public/                 # Blog, BlogCategory, BookCall, CaseStudies, Contact, Conversation,
│   │                            # Message, NewsletterSubscriber, Product, ProductCategory, Project,
│   │                            # ProjectCategory, Review
│   ├── shared/                 # Coupon, Invoice, Notification, Order, Payment
│   └── users/                  # Comment, Download, User, UserActivity
├── routes/                     # All route handlers live here (see Architecture above)
├── scheduler/
│   └── keepAlive.js            # Implemented — per-minute health ping + user count log
├── services/
│   ├── adminActivityService.js # Implemented — writes to AdminActivity log
│   ├── emailService.js         # Implemented — all SendGrid email templates/senders
│   ├── reminderService.js      # Implemented — hourly booking-reminder cron
│   ├── socketService.js        # Implemented — Socket.io init + JWT handshake auth
│   ├── tokenService.js         # Implemented
│   └── userActivityService.js  # Implemented — writes to UserActivity log
└── utils/
    ├── generateToken.js        # Empty
    ├── invoiceGenerator.js     # Empty — invoice PDF generation is inline in admin_routes.js instead
    ├── logger.js                # Empty — logging is `console.log`/`console.error` throughout
    └── sendEmail.js              # Empty — superseded by services/emailService.js
```

Files listed as empty are real, tracked, zero-byte or near-zero-byte files in the repository — not omissions from this README. See [Known limitations](#known-limitations) for the complete list and what each empty file was evidently intended for.

## Getting started

### Prerequisites

- Node.js 18 or later
- npm
- A MongoDB connection string (MongoDB Atlas or self-hosted)
- A Cloudinary account (for file/image uploads)
- A SendGrid account and verified sender (for transactional email)
- A running instance of the companion frontend (separate repository), or access to the deployed one, to exercise the API end-to-end

### Installation

```bash
git clone https://github.com/Itachi7011/Shivam_Stack_Backend.git
cd Shivam_Stack_Backend
npm install
```

## Environment variables

**A `.env.example` file does not currently exist in this repository** — `.env` is listed in `.gitignore`, and it appears the example file was either never committed or excluded along with it. The table below was reconstructed directly from every `process.env.*` reference found in the codebase. See [`.env.example`](./.env.example) in this repository (added as part of this audit) for a ready-to-copy version with comments.

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `PORT` | Port the Express server listens on (defaults to `5000` if unset) |
| `NODE_ENV` | `development` or `production` — selects which backend URL the keep-alive job pings |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign/verify both user and admin JWTs |
| `JWT_REFRESH_SECRET` | Secret used to sign/verify refresh tokens |
| `JWT_ACCESS_EXPIRE` | User access token expiry |
| `JWT_REFRESH_EXPIRE` | User refresh token expiry |
| `JWT_ADMIN_ACCESS_EXPIRE` | Admin access token expiry |
| `JWT_ADMIN_REFRESH_EXPIRE` | Admin refresh token expiry |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary credentials for uploads |
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Verified "from" address for outgoing email |
| `CLIENT_URL`, `FRONTEND_URL` | Frontend origin(s) used for CORS / Socket.io / links in emails |
| `PRODUCTION_BASE_FRONTEND_URL`, `DEVELOPMENT_BASE_FRONTEND_URL` | Environment-specific frontend URLs |
| `PRODUCTION_BASE_BACKEND_URL`, `DEVELOPMENT_BASE_BACKEND_URL` | Environment-specific backend URLs (used by the keep-alive job to ping itself) |
| `API_URL` | Base API URL referenced in code (e.g. for links in emails) |
| `APP_NAME` | Display name used in emails/templates |
| `ADMIN_EMAIL` | Admin notification recipient (e.g. new booking alerts) |
| `ADMIN_URL` | Admin panel URL referenced in emails |
| `CONTACT_EMAIL_GENERAL`, `CONTACT_EMAIL_SUPPORT`, `CONTACT_EMAIL_SECURITY`, `CONTACT_EMAIL_PRIVACY`, `CONTACT_EMAIL_LEGAL`, `CONTACT_EMAIL_COLLAB` | Public-facing contact addresses surfaced by the public API |
| `CONTACT_YOUTUBE` | Public-facing social link surfaced by the public API |
| `VITE_G`, `VITE_L`, `VITE_M`, `VITE_T`, `VITE_W` | Referenced in the codebase but their exact purpose is unclear from context alone (short, unlabeled names) — **verify against your own `.env` before relying on this list**; likely leftover/shared naming from the frontend's Vite env conventions rather than variables this backend truly needs |

None of these are described here with invented defaults or guessed formats beyond what the code implies — where a variable's purpose was not obvious from its usage site, it is flagged rather than assumed.

## Available scripts

This is the **only** script currently defined in `package.json`:

```bash
npm test   # placeholder — prints an error and exits 1; no tests exist yet
```

There is no `start`, `dev`, `lint`, `build`, or `typecheck` script. In practice the server is run directly:

```bash
node app.js
```

> **RECOMMENDED ADDITION:** `"start": "node app.js"` and a `"dev": "nodemon app.js"` script (with `nodemon` as a dev dependency) so the run command is discoverable from `package.json` rather than tribal knowledge.

## Local development

```bash
node app.js
```

The server starts on `PORT` (default `5000`), connects to MongoDB via `MONGODB_URI`, and initializes Socket.io on the same HTTP server. CORS is restricted to `http://localhost:5173`, `https://shivam-webstack.netlify.app`, and `process.env.PRODUCTION_BASE_FRONTEND_URL` (configured in `app.js`) — update this list if your frontend runs on a different port/origin.

A basic health check is available at `GET /health`.

## API documentation

There is no OpenAPI/Swagger spec in this repository. `docs/api.md` (added as part of this audit) documents every route actually registered in `routes/*.js`, grouped by base path, reconstructed directly from the router definitions — not from external documentation. Where a route file is empty (`auth_routes.js`, `order_routes.js`, `payment_routes.js`), that is noted explicitly rather than omitted.

## Testing

**RECOMMENDED ADDITION.** There is no test runner, test files, or working `test` script in the project today (`npm test` is a placeholder that exits with an error). No testing claims are made in this README because none would be verifiable. Introducing Jest or Vitest with Supertest for route-level integration tests (starting with auth and the public catalog endpoints) would be a reasonable first step, followed by a `mongodb-memory-server`-backed test database for isolation.

## Deployment

The production API is deployed on **Render** (referenced as `shivam-stack-backend.onrender.com` in the companion frontend's configuration). There is no `Dockerfile`, `render.yaml`, or other deployment-as-code file in this repository — deployment configuration (build command `npm install`, start command `node app.js`, environment variables) is assumed to be set directly in the hosting provider's dashboard.

The per-minute `scheduler/keepAlive.js` job exists specifically to work around Render free-tier cold starts by pinging the service's own `/api/public/system-health` endpoint.

> **RECOMMENDED ADDITION:** a `render.yaml` (or equivalent) committed to the repo so the deployment configuration is versioned alongside the code, and a `Dockerfile` if portability beyond Render is ever needed.

## Security

See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability. In brief: `helmet`, `hpp`, `express-rate-limit` (currently defined but **not mounted** — see below), and `cors` with an explicit origin allowlist are in place; passwords are hashed with `bcryptjs`; JWTs are validated per-request against a revocable `tokens[]` list stored on the user/admin document rather than trusted blindly.

**Rate limiting is defined but not applied.** `app.js` constructs an `express-rate-limit` instance (`limiter`, 100 requests / 15 minutes) but the line that would mount it (`app.use('/api/', limiter)`) is commented out, so no route is currently rate-limited.

**Two route groups under `/api/public/*` have no authentication middleware despite performing write/admin-style operations.** This was found during this audit and is flagged here for the maintainer's attention rather than left implicit:
- The **case studies** routes in `routes/public_routes.js` (`POST /api/public/case-studies`, `PUT /api/public/case-studies/:id`, `DELETE /api/public/case-studies/:id`) accept create/update/delete requests with no auth check at all. A separate, admin-authenticated case-studies router exists (`routes/case_studies_routes.js`) but **is never mounted in `app.js`** — it appears the public router was meant to be a read-only public API and the authenticated router was meant to handle writes, but the public router currently also exposes the write operations unguarded.
- The **bookings** routes in `routes/public_routes.js` (`GET /api/public/bookings`, `PATCH /api/public/bookings/:bookingId/status`, `DELETE /api/public/bookings/:bookingId`, `POST /api/public/bookings/:bookingId/send-estimate`) are also unauthenticated. `GET /bookings` returns the full list of client bookings (names, emails, scheduling details) to any caller, and the status/delete/send-estimate endpoints allow modifying or removing bookings without any credential.

These are existing conditions in the code as of this audit, not new issues introduced by this documentation pass. Given the impact (unauthenticated data exposure and unauthenticated write access), **fixing these should be prioritized ahead of the recruiter-facing polish work** in this audit — see the [Final implementation checklist] provided separately for suggested ordering.

## Performance and scaling considerations

No load testing, caching layer, or horizontal-scaling configuration exists in this repository today. `compression` is enabled globally. The MongoDB connection uses Mongoose's default connection pooling with no custom tuning. These are documented as the current state, not as problems to be alarmed about — most portfolio/small-business traffic volumes will not stress this configuration, but it hasn't been load-tested to confirm a specific ceiling.

## Known limitations

Documented honestly rather than glossed over:

- **Two unauthenticated route groups under `/api/public/*` perform write/admin-style operations** — case studies create/update/delete, and bookings read/status-update/delete/send-estimate. See [Security](#security) above for full detail. This is the single highest-priority item in this audit.
- **`routes/case_studies_routes.js` is a fully implemented, admin-authenticated router that is never mounted in `app.js`.** It duplicates (with proper auth) functionality that's also present, unauthenticated, in `routes/public_routes.js`.
- **8 of 11 files in `controllers/` are empty placeholders** (`analytics_controller.js`, `auth_controller.js`, `blog_controller.js`, `coupon_controller.js`, `order_controller.js`, `payment_controller.js`, `product_controller.js`, `project_controller.js`). Their route logic instead lives directly inside the corresponding files in `routes/`. Only the messaging feature actually uses the controller pattern (`message_controller.js` and `admin_nessage_controller.js`, both wired into `routes/message_routes.js`). `controllers/user_controller.js` is an exact duplicate of `message_controller.js` and is not imported anywhere — likely a leftover copy.
- **`routes/auth_routes.js`, `routes/order_routes.js`, and `routes/payment_routes.js` are empty and unregistered** in `app.js`. There is no order-management or payment-processing API despite `Order` and `Payment` Mongoose models existing.
- **No payment gateway integration exists.** `config/razorpay.js` is an empty file; `razorpay` is not even a listed dependency in `package.json`.
- **Google/GitHub OAuth are stubs.** `GET /api/users/google` and `GET /api/users/github` each return a static JSON message (`"... will be implemented here"`) and perform no actual OAuth flow. `passport` is listed as a dependency but is not required/used anywhere in the code.
- **`config/db.js`, `jobs/cronJobs.js`, `middleware/admin.middleware.js`, `middleware/error.middleware.js`, `middleware/upload.middleware.js`, `utils/generateToken.js`, `utils/invoiceGenerator.js`, `utils/logger.js`, and `utils/sendEmail.js` are all empty files.** Their responsibilities are handled elsewhere: DB connection is inline in `app.js`, error handling is inline per-route (no centralized handler), invoice PDF generation is inline in `admin_routes.js`, logging is plain `console.log`/`console.error`, and email sending goes through `services/emailService.js` instead.
- **No centralized error-handling middleware.** Each route has its own `try/catch` with an inline `res.status(500).json(...)`; there is no Express error-handling middleware (`(err, req, res, next)`) registered in `app.js`.
- **Rate limiting is defined but not mounted** — see [Security](#security).
- **No automated tests** exist in the repository (see [Testing](#testing)).
- **No CI pipeline** currently runs on this repository.
- **No `.env.example`** currently exists in the repository (see [Environment variables](#environment-variables)); one has been added as part of this audit.

None of the above are described elsewhere in this README as implemented — they're listed here for transparency and as a starting point for contributors picking up "good first issue" work.

## Roadmap

See the project board / open issues for up-to-date status. At a high level:

**Already completed**
- Public content API (products, blogs, projects, case studies, categories)
- User auth (register/verify/login/refresh/reset) and profile management
- Admin auth with TOTP 2FA, role/permission system
- Full admin CRUD for content, catalog, coupons, reviews, users, other admins
- Cloudinary file/image uploads
- SendGrid transactional email (verification, booking, notifications)
- Real-time messaging via Socket.io
- Booking system for "book a free call" with reminder emails
- Invoice PDF generation (inline in admin routes)
- Keep-alive scheduler for free-tier hosting

**Next**
- Wire up `routes/order_routes.js` and `routes/payment_routes.js`, or remove them if order/payment is permanently out of scope
- Move route logic from `routes/*.js` into `controllers/*.js` to match the scaffolded architecture, or remove the empty controller files if that pattern is abandoned
- Add a centralized error-handling middleware and mount the already-defined rate limiter
- Add a `.env.example` (done as part of this audit) and a minimal test suite

**Future**
- Real OAuth (Google/GitHub) instead of the current stub responses
- Payment gateway integration if commerce features are actually needed
- CI pipeline (lint + test on PR)
- Structured logging (replace `console.log`) and centralized error tracking

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a pull request, and check [Known limitations](#known-limitations) above for good starting points.

## License

Licensed under the [MIT License](./LICENSE).
