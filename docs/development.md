# Development Guide

## Prerequisites

- Node.js 18 or later
- npm
- A MongoDB connection string — a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works fine for local development
- A [Cloudinary](https://cloudinary.com/) account (free tier) — required for any route that uploads images/files (products, projects, blogs)
- A [SendGrid](https://sendgrid.com/) account with a verified sender — required for any route that sends email (registration OTP, password reset, booking confirmations/reminders)
- Optionally, a running instance of [`Shivam_Stack_Frontend`](https://github.com/Itachi7011/Shivam_Stack_Frontend) to exercise the API end-to-end. The API can also be exercised directly with curl, Postman, or Insomnia.

## Setup

```bash
git clone https://github.com/Itachi7011/Shivam_Stack_Backend.git
cd Shivam_Stack_Backend
npm install
cp .env.example .env
```

Fill in `.env` — at minimum `MONGODB_URI` and `JWT_SECRET` are required for the server to start and for any authenticated route to function. See the [Environment variables](../README.md#environment-variables) table in the main README for what each variable does and where it's used.

## Running the server

There is no `dev`/`start` script defined in `package.json` yet (see [Known limitations](../README.md#known-limitations)). Run the entry point directly:

```bash
node app.js
```

This will:
1. Load `.env` via `dotenv`
2. Connect to MongoDB (`MONGODB_URI`) — the process exits with an error if this fails
3. Start Express on `PORT` (default `5000`)
4. Initialize Socket.io on the same HTTP server
5. Start the hourly booking-reminder cron job

For auto-restart on file changes during development, install `nodemon` as a dev dependency and run `npx nodemon app.js` — this is not currently wired up as an npm script.

> **RECOMMENDED ADDITION:** add `"start": "node app.js"` and `"dev": "nodemon app.js"` to `package.json` scripts.

## Verifying the server is up

```bash
curl http://localhost:5000/health
```

Should return `{"status":"success","message":"Server is running", ...}`.

There's also `GET /api/test` (returns a plain string) and `GET /api/test-cors-block` (echoes the request's `Origin` header, useful for debugging CORS issues against the frontend).

## Working with the database

The app connects with no custom Mongoose options (`mongoose.connect(process.env.MONGODB_URI, {})`). No seed script or fixtures exist in the repository — you'll need to create data manually (e.g. via the admin registration/login flow, then the various admin CRUD endpoints) to have something to test against.

## CORS during local development

`app.js` hardcodes an allowlist:
```js
origin: [
  "http://localhost:5173",
  "https://shivam-webstack.netlify.app",
  process.env.PRODUCTION_BASE_FRONTEND_URL,
]
```
If your local frontend runs on a different port, either change this list temporarily or set `PRODUCTION_BASE_FRONTEND_URL` — note the CORS list does not currently read `DEVELOPMENT_BASE_FRONTEND_URL` or `CLIENT_URL`/`FRONTEND_URL`, despite those variables existing and being used elsewhere (email links, Socket.io CORS). This is worth reconciling — see [Known limitations](../README.md#known-limitations).

## Linting

**None configured.** There is no ESLint config in this repository (unlike the frontend repo, which has one). `npm run lint` does not exist.

> **RECOMMENDED ADDITION:** add an ESLint flat config (`eslint.config.js`) with a Node/CommonJS preset, and a `"lint": "eslint ."` script.

## Testing

**None exist.** `npm test` currently runs a placeholder that prints an error and exits 1. There are no test files, no test runner installed, and no test database setup.

> **RECOMMENDED ADDITION:** Jest or Vitest + Supertest for route-level integration tests, starting with the highest-value/highest-risk areas: auth (`/api/users/login`, `/api/admin/login`), and the currently-unauthenticated case-studies and bookings write endpoints flagged in the main README's Security section — tests here would also serve as regression protection once those endpoints are fixed.

## Common gotchas

- **`config/db.js` is empty.** The actual MongoDB connection happens inline in `app.js`, not in this file — don't expect to find connection logic here.
- **`middleware/error.middleware.js` is empty.** There's no central error handler; a thrown error in a route not wrapped in try/catch will crash the request without a formatted JSON response.
- **`routes/case_studies_routes.js` is not mounted.** If you're testing case studies, you're hitting the (currently unauthenticated) endpoints in `routes/public_routes.js`, not this file.
- **`utils/invoiceGenerator.js` and `utils/sendEmail.js` are empty.** Invoice PDF generation is inline in `routes/admin_routes.js` (using `pdfkit` directly); email sending goes through `services/emailService.js`.

## Branching and PRs

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the contribution workflow.
