# API Reference

There is no OpenAPI/Swagger spec in this repository. This document was reconstructed directly from the router definitions in `routes/*.js` as mounted in `app.js` — it reflects what's actually registered, not an idealized version of the API.

**Base URL:** `http://localhost:5000` (local) or the deployed Render URL (production — confirm current value with the maintainer; referenced elsewhere in this repo as `https://shivam-stack-backend.onrender.com`).

**Auth key:**
- 🔓 No authentication
- 🔑 User authentication required (`middleware/userAuth.js`)
- 🔐 Admin authentication required (`middleware/adminAuth.js`)
- ⚠️ Performs write/data-exposing operations with **no** authentication — see `README.md` → Security

---

## `/api/users` — User auth & profile

_Router: `routes/user_routes.js`_

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/register` | 🔓 | Sends an email verification OTP |
| POST | `/verify-email` | 🔓 | Confirms OTP |
| POST | `/resend-verification` | 🔓 | |
| POST | `/login` | 🔓 | Sets the `cookies1` session cookie |
| POST | `/refresh-token` | 🔓 | |
| POST | `/forgot-password` | 🔓 | |
| POST | `/validate-reset-token` | 🔓 | |
| POST | `/reset-password` | 🔓 | |
| POST | `/logout` | 🔑 | Revokes the current session token |
| POST | `/logout-all` | 🔑 | Revokes all session tokens for the user |
| GET | `/profile` | 🔑 | |
| PATCH | `/profile` | 🔑 | |
| POST | `/change-password` | 🔑 | |
| GET | `/activities` | 🔑 | User activity log |
| DELETE | `/account` | 🔑 | |
| GET | `/google` | 🔓 | **Stub** — returns `{"message":"Google OAuth will be implemented here"}`, no actual OAuth flow |
| GET | `/github` | 🔓 | **Stub** — same as above, GitHub |

## `/api/users/messages` — User ↔ admin messaging

_Router: `routes/message_routes.js`, delegating to `controllers/message_controller.js` and `controllers/admin_nessage_controller.js`_

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/user/conversations` | 🔑 (implied — verify in controller) | Should return the calling user's own conversation |
| GET | `/user/conversations/:conversationId` | 🔑 (implied) | |
| POST | `/user/messages` | 🔑 (implied) | |
| GET | `/admin/conversations` | 🔐 (implied) | All conversations, admin side |
| GET | `/admin/conversations/:conversationId` | 🔐 (implied) | |
| POST | `/admin/conversations/:conversationId/reply` | 🔐 (implied) | |
| PATCH | `/admin/conversations/:conversationId/read` | 🔐 (implied) | Mark as read |

Note: this router file itself does not visibly attach `userAuthenticate`/`adminAuthenticate` at the router level in the same explicit way other files do — confirm inside `message_controller.js` / `admin_nessage_controller.js` whether `req.user` / `req.admin` are required before treating these as safe to call unauthenticated. This is flagged for verification rather than asserted either way.

## `/api/admin` — Admin auth, profile, and business operations

_Router: `routes/admin_routes.js` — the largest router in the codebase (~2700 lines, 58 endpoints)_

**Auth & account**

| Method | Path | Auth |
|---|---|---|
| POST | `/register` | 🔓 |
| POST | `/login` | 🔓 |
| POST | `/forgot-password` | 🔓 |
| POST | `/validate-reset-token` | 🔓 |
| POST | `/reset-password` | 🔓 |
| POST | `/logout` | 🔐 |
| GET | `/profile` | 🔐 |
| POST | `/2fa/enable` | 🔐 | TOTP via `speakeasy` |
| POST | `/2fa/verify` | 🔐 |
| POST | `/2fa/disable` | 🔐 |
| POST | `/change-password` | 🔐 |
| GET | `/activities` | 🔐 | This admin's activity log |
| GET | `/all-activities` | 🔐 | All admins' activity |
| GET | `/dashboard/stats` | 🔐 |

**Admin management** (role/permission administration)

| Method | Path | Auth |
|---|---|---|
| GET | `/admins` | 🔐 |
| GET | `/admins/:id` | 🔐 |
| PATCH | `/admins/:id/permissions` | 🔐 |
| PATCH | `/admins/:id/role` | 🔐 |
| PATCH | `/admins/:id/block` | 🔐 |
| GET | `/admins-users` | 🔐 |

**User management**

| Method | Path | Auth |
|---|---|---|
| GET | `/users` | 🔐 |
| GET | `/users/:id` | 🔐 |
| PATCH | `/users/:id/toggle-block` | 🔐 |

**Contact messages**

| Method | Path | Auth |
|---|---|---|
| GET | `/contact-messages` | 🔐 |
| GET | `/contact-messages/:id` | 🔐 |
| PATCH | `/contact-messages/:id/mark-read` | 🔐 |
| PATCH | `/contact-messages/:id/status` | 🔐 |
| PATCH | `/contact-messages/:id/toggle-flag` | 🔐 |
| POST | `/contact-messages/:id/reply` | 🔐 |
| PATCH | `/contact-messages/bulk-status` | 🔐 |
| DELETE | `/contact-messages/bulk` | 🔐 |
| DELETE | `/contact-messages/:id` | 🔐 |

**Newsletter subscribers**

| Method | Path | Auth |
|---|---|---|
| GET | `/newsletter-subscribers` | 🔐 |
| GET | `/newsletter-subscribers/export` | 🔐 | CSV export via `csv-writer` |
| GET | `/newsletter/subscribers` | 🔐 |
| PATCH | `/newsletter/subscribers/:id/toggle-status` | 🔐 |
| PATCH | `/newsletter/subscribers/bulk-status` | 🔐 |
| DELETE | `/newsletter/subscribers/bulk` | 🔐 |
| DELETE | `/newsletter/subscribers/:id` | 🔐 |
| POST | `/newsletter/subscribers/send-newsletter` | 🔐 |
| GET | `/newsletter/subscribers/stats` | 🔐 |

**Reviews, downloads, payments, invoices**

| Method | Path | Auth |
|---|---|---|
| GET | `/reviews` | 🔐 |
| PATCH | `/reviews/:id/approve` | 🔐 |
| DELETE | `/reviews/:id` | 🔐 |
| GET | `/downloads` | 🔐 |
| GET | `/downloads/stats` | 🔐 |
| GET | `/payments` | 🔐 |
| GET | `/invoices` | 🔐 |
| GET | `/invoices/:id/pdf` | 🔐 | Generates a PDF inline via `pdfkit` |

**Bookings ("book a free call")**

| Method | Path | Auth |
|---|---|---|
| GET | `/book-calls` | 🔐 |
| GET | `/book-calls/:id` | 🔐 |
| PUT | `/book-calls/:id` | 🔐 |
| PATCH | `/book-calls/bulk-status` | 🔐 |
| DELETE | `/book-calls/bulk` | 🔐 |
| DELETE | `/book-calls/:id` | 🔐 |
| GET | `/book-calls/stats/overview` | 🔐 |

Note the parallel, **unauthenticated** booking endpoints living under `/api/public/bookings` in `routes/public_routes.js` — see the ⚠️ section below and `README.md` → Security.

**Misc**

| Method | Path | Auth |
|---|---|---|
| GET | `/project-categories` | 🔐 |
| GET | `/main-settings` | 🔐 |

## `/api/admin/products` — Product & category management (admin only)

_Router: `routes/product_routes.js` — every route requires 🔐 admin auth except category-by-slug lookup_

| Method | Path | Auth |
|---|---|---|
| GET | `/categories` | 🔐 |
| GET | `/categories/:id` | 🔐 |
| GET | `/categories/slug/:slug` | 🔓 |
| POST | `/categories` | 🔐 |
| PUT | `/categories/:id` | 🔐 |
| DELETE | `/categories/:id` | 🔐 |
| POST | `/categories/bulk-delete` | 🔐 |
| GET | `/` | 🔐 |
| GET | `/:id` | 🔐 |
| GET | `/slug/:slug` | 🔓 |
| GET | `/:id/download` | 🔓 |
| POST | `/` | 🔐 | Cloudinary file upload |
| PUT | `/:id` | 🔐 |
| POST | `/:id/files` | 🔐 |
| DELETE | `/:id` | 🔐 |
| POST | `/bulk-delete` | 🔐 |
| POST | `/bulk-update-status` | 🔐 |

## `/api/admin/blogs` — Blog & category management (admin only)

_Router: `routes/blog_routes.js`_ — same pattern as products: full CRUD is 🔐, `slug` and `categories/slug` lookups are 🔓.

## `/api/admin/projects` — Project & category management (admin only)

_Router: `routes/project_routes.js`_ — same pattern, plus `POST /:id/images` (Cloudinary), `POST /bulk-update-featured`, and `GET /stats/summary`, all 🔐.

## `/api/admin/coupons` — Coupon management (admin only)

_Router: `routes/coupon_routes.js`_

| Method | Path | Auth |
|---|---|---|
| GET | `/` | 🔐 |
| GET | `/:id` | 🔐 |
| GET | `/validate/:code` | 🔓 | Used by the frontend at checkout time to validate a code |
| POST | `/` | 🔐 |
| PUT | `/:id` | 🔐 |
| DELETE | `/:id` | 🔐 |
| POST | `/:id/use` | 🔐 |
| POST | `/bulk-delete` | 🔐 |
| POST | `/bulk-update-status` | 🔐 |
| GET | `/stats/summary` | 🔐 |

## `/api/admin/analytics` — Dashboard analytics (admin only)

_Router: `routes/analytics_routes.js`_ — all 10 endpoints (`dashboard/stats`, `recent/products`, `recent/blogs`, `recent/projects`, `recent/coupons`, `content/overview`, `commerce/overview`, `portfolio/overview`, `activities/recent`, `main-settings`) require 🔐 admin auth.

## `/api/public` — Public-facing aggregated API

_Router: `routes/public_routes.js` (2833 lines) — mixes genuinely public read endpoints with several write endpoints that have no auth (see ⚠️ below)_

**Products & categories** (🔓 read-only)
`GET /products`, `GET /products/:slug`, `GET /categories/:slug/products`, `GET /categories`, `GET /download/:id`

**Blogs** (🔓 reads, 🔑 writes)
`GET /blogs`, `GET /blogs/slug/:slug` (🔓); `POST /blogs/:id/like`, `POST /blogs/:id/comments`, `PUT /blogs/:id/comments/:commentId`, `DELETE /blogs/:id/comments/:commentId` (🔑 user auth)

**Projects** (🔓 reads, 🔑 writes)
`GET /projects/categories`, `GET /projects`, `GET /projects/slug/:slug` (🔓); `POST /projects/:id/like`, `POST /projects/:id/comments`, `PUT /projects/:id/comments/:commentId`, `DELETE /projects/:id/comments/:commentId` (🔑 user auth)

**Case studies** ⚠️
`GET /case-studies`, `GET /case-studies/:slugOrId` (🔓 — fine, read-only); **`POST /case-studies`, `PUT /case-studies/:id`, `DELETE /case-studies/:id`, `PATCH /case-studies/:id/like`, `POST /case-studies/:id/comments`, `DELETE /case-studies/:id/comments/:commentId` — all unauthenticated ⚠️.** A separate, properly admin-authenticated router for this exact resource exists at `routes/case_studies_routes.js` but is not mounted. See `README.md` → Security.

**Bookings** ⚠️
`GET /services`, `GET /available-slots`, `POST /bookings` (🔓 — intentional, this is the public "book a call" form); **`GET /bookings`, `PATCH /bookings/:bookingId/status`, `DELETE /bookings/:bookingId`, `POST /bookings/:bookingId/send-estimate` — all unauthenticated ⚠️**, despite returning/modifying the full client booking list. See `README.md` → Security. Also: `GET /schedule`, `GET /statistics` (🔓).

**Contact**
`GET /contact/info` (🔓), `POST /contact/submit` (🔓 — the public contact form), `GET /contact/messages` (🔓 — returns submitted contact messages; likely should be admin-only, worth confirming intent).

**Newsletter**
`POST /newsletter/subscribe`, `DELETE /newsletter/unsubscribe`, `GET /newsletter/stats` (all 🔓).

**System**
`GET /system-health` (🔓) — used by `scheduler/keepAlive.js`.

---

## Not implemented

- **`routes/auth_routes.js`** — empty, not mounted. No routes exist under a dedicated `/api/auth` path; auth lives entirely under `/api/users` and `/api/admin`.
- **`routes/order_routes.js`** — empty, not mounted. No order-management API despite an `Order` Mongoose model existing.
- **`routes/payment_routes.js`** — empty, not mounted. No payment API despite a `Payment` Mongoose model existing; no payment gateway dependency (e.g. Razorpay/Stripe) in `package.json`.

## Real-time events (Socket.io)

Not a REST endpoint, but part of the API surface: connecting to the Socket.io server requires a JWT in `socket.handshake.auth.token`. See `docs/architecture.md` → Real-time for the room-joining behavior. Specific event names emitted/listened for are defined inline in `services/socketService.js` and the message controllers — refer to those files directly, as no event catalog currently exists.

> **RECOMMENDED ADDITION:** a table of Socket.io event names, payloads, and which room they're emitted to, once the messaging feature is documented further.
