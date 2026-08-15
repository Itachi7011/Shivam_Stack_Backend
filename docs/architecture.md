# Architecture

## Overview

This repository is the **backend only** — a single Express 5 application (`app.js`) backed by MongoDB (via Mongoose), deployed on Render. It's called by a separately hosted frontend ([`Shivam_Stack_Frontend`](https://github.com/Itachi7011/Shivam_Stack_Frontend), a Vite/React app on Netlify) over HTTPS (Axios) and WebSockets (Socket.io). The frontend's source is not part of this repository.

## Request lifecycle

Every request passes through, in order (as wired in `app.js`):

1. `cors` — origin allowlist (`localhost:5173`, the Netlify frontend, `PRODUCTION_BASE_FRONTEND_URL`)
2. `cookie-parser`
3. `helmet` — standard security headers
4. `express.json` / `express.urlencoded` (10 MB limit)
5. `hpp` — HTTP parameter pollution protection
6. `compression`
7. The matched router (see below)

Rate limiting (`express-rate-limit`) is **constructed but not mounted** — see `README.md` → Security. There is no centralized error-handling middleware; each route handler catches its own errors and responds with `res.status(...).json(...)` inline.

## Route mounting

```js
app.use("/api/users", UserRoutes);              // routes/user_routes.js
app.use("/api/admin", AdminRoutes);              // routes/admin_routes.js
app.use("/api/admin/products", ProductRoutes);   // routes/product_routes.js
app.use("/api/admin/blogs", BlogsRoutes);        // routes/blog_routes.js
app.use("/api/admin/coupons", CouponsRoutes);    // routes/coupon_routes.js
app.use("/api/admin/projects", ProjectsRoutes);  // routes/project_routes.js
app.use("/api/public", PublicProductRoutes);     // routes/public_routes.js
app.use("/api/users/messages", MessagesRoutes);  // routes/message_routes.js
app.use("/api/admin/analytics", AnalyticsRoutes);// routes/analytics_routes.js
```

Notably **not mounted**: `routes/auth_routes.js`, `routes/order_routes.js`, `routes/payment_routes.js` (all empty files), and `routes/case_studies_routes.js` (fully implemented and admin-authenticated, but never `app.use()`'d — case studies are instead served, unauthenticated for writes, from `routes/public_routes.js`; see the Security section of the main README).

## Authentication

Two independent JWT flows, sharing `JWT_SECRET` but with separate token stores and cookie names:

| | User (`middleware/userAuth.js`) | Admin (`middleware/adminAuth.js`) |
|---|---|---|
| Cookie | `cookies1` | `adminToken` |
| Header fallback | `Authorization: Bearer <token>` | `Authorization: Bearer <token>` |
| Token validation | Looked up against a `tokens[]` array on the `User` document (`isRevoked: false`, `type: 'access'`) | Looked up against a `tokens[]` array on the `Admin` document, plus `isActive`/`isBlocked` checks |
| Session model | Multiple concurrent sessions per user; `logout-all` revokes all of them | Same pattern, admin-side |
| Extra | — | `hasPermission([...])` middleware factory: `superadmin` role bypasses all checks; other roles are checked against an `Admin.permissions` array |

`middleware/admin.middleware.js` is a separate, empty file — not to be confused with the implemented `middleware/adminAuth.js`.

## Controller pattern (partially adopted)

Most domains keep their logic directly inside the router file (`routes/product_routes.js`, `routes/blog_routes.js`, `routes/admin_routes.js`, etc.) — there is no separation between routing and business logic for these. The **messaging** domain is the one exception: `routes/message_routes.js` is a thin router that delegates to `controllers/message_controller.js` (user-facing) and `controllers/admin_nessage_controller.js` (admin-facing, filename typo present in the repo and left as-is here). `controllers/user_controller.js` is a byte-for-byte duplicate of `message_controller.js` and is not imported anywhere — it appears to be a leftover copy rather than a distinct, in-use file. The remaining 8 controller files are empty.

## Data layer

MongoDB via Mongoose, organized into four model directories by ownership:

- `models/admin/` — `Admin`, `AdminActivity`, `AnalyticsSnapshot`, `AuditLog`, `SiteSettings`
- `models/public/` — `Blog`, `BlogCategory`, `BookCall`, `CaseStudies`, `Contact`, `Conversation`, `Message`, `NewsletterSubscriber`, `Product`, `ProductCategory`, `Project`, `ProjectCategory`, `Review`
- `models/shared/` — `Coupon`, `Invoice`, `Notification`, `Order`, `Payment`
- `models/users/` — `Comment`, `Download`, `User`, `UserActivity`

`Order` and `Payment` models exist but have no corresponding route files mounted (`order_routes.js` / `payment_routes.js` are empty) — there is currently no way to create or query orders/payments through the API.

## File uploads

`middleware/cloudinaryUploader.js` (419 lines, implemented) wraps `multer` + the Cloudinary SDK (`config/cloudinary.js`) to handle image/file uploads for products, projects, and blogs directly to Cloudinary. `middleware/upload.middleware.js` is a separate, empty file.

## Email

`services/emailService.js` (340 lines) is the single implemented email layer, using `@sendgrid/mail`. It exports named senders for each transactional email type: OTP verification, welcome, booking confirmation/reminder/cancellation, follow-up estimate, and admin booking notifications. `utils/sendEmail.js` is a separate, empty file — not used.

## Real-time (Socket.io)

`services/socketService.js` initializes Socket.io on the same HTTP server as Express. Its `io.use()` middleware authenticates the handshake by verifying the JWT passed in `socket.handshake.auth.token` and looking up either a `User` or an `Admin` document depending on which ID is present in the decoded payload. Authenticated sockets join a room:

- Users join `user_<userId>`
- Admins join both `admins` (broadcast room) and `admin_<adminId>` (private room)

This is used by the user↔admin messaging feature (`routes/message_routes.js` + the two message controllers).

## Background jobs

Two `node-cron` jobs, both started from application code rather than `jobs/cronJobs.js` (which is empty and unused):

1. **`services/reminderService.js`** — runs hourly (`0 * * * *`), finds confirmed `BookCall` bookings starting within the next hour that haven't had a reminder sent, and emails the client via `sendBookingReminderEmail`. Started by `scheduleReminders()`, called directly in `app.js`.
2. **`scheduler/keepAlive.js`** — runs every minute (`* * * * *`), pings `${backendURL}/api/public/system-health` (using `PRODUCTION_BASE_BACKEND_URL` or `DEVELOPMENT_BASE_BACKEND_URL` depending on `NODE_ENV`) and logs a total-user count. This exists to mitigate Render free-tier cold starts. `config/scheduler.js` wraps this in a `SchedulerManager` class, but that wrapper is **not currently invoked** from `app.js` — the keep-alive job's actual entry point is a separate, more minimal path (worth double-checking against the deployed instance's logs to confirm which invocation path is actually live).

## Deployment topology

```
┌──────────────────────┐   REST + WebSocket   ┌──────────────────────────────┐
│  Netlify — frontend    │ ───────────────────▶ │  Render — this repository      │
│  Shivam_Stack_Frontend  │                      │  Shivam_Stack_Backend           │
│  (separate repository)  │ ◀─────────────────── │  Express + Socket.io + MongoDB   │
└──────────────────────┘                      └───────────────┬──────────────┘
                                                                │
                                     ┌──────────────┬───────────┴───────────┬──────────────┐
                                     ▼              ▼                       ▼              ▼
                                MongoDB Atlas   Cloudinary              SendGrid    Render self-ping
                                (data)          (file uploads)          (email)     (keep-alive cron)
```

## Not yet implemented (architecturally relevant)

- Orders and payments — models exist, routes do not
- Real OAuth (Google/GitHub) — routes exist and return static "not implemented" JSON
- Centralized error handling — every route handles its own errors
- Rate limiting enforcement — configured, not mounted
- Auth on the case-studies and bookings endpoints under `/api/public/*` — see `README.md` → Security

See [Known limitations](../README.md#known-limitations) in the main README for the complete, current list.
