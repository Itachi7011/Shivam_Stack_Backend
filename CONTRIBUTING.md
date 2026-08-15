# Contributing to Shivam Stack — Backend

Thanks for your interest in contributing. This is primarily a personal/business project, but external contributions (bug fixes, documentation, small features) are welcome.

## Before you start

- Check [Known limitations](./README.md#known-limitations) in the README — several files in the repo are intentional empty scaffolds (`controllers/`, several `middleware/` and `utils/` files, `routes/auth_routes.js`, `routes/order_routes.js`, `routes/payment_routes.js`). These are good candidates for a first contribution, but please open an issue first to confirm scope before building out a large feature, since the intended direction (e.g. whether the controller layer should actually be used) may need maintainer input.
- For anything beyond a small fix, open an issue describing what you want to change before writing code, to avoid duplicated or wasted effort.

## Development setup

```bash
git clone https://github.com/Itachi7011/Shivam_Stack_Backend.git
cd Shivam_Stack_Backend
npm install
cp .env.example .env
node app.js
```

See [`docs/development.md`](./docs/development.md) for full setup details, including which third-party accounts (MongoDB, Cloudinary, SendGrid) you'll need for different parts of the API to work.

You'll also need a running instance of the companion frontend (separate repository) to exercise most flows end-to-end, though the API can be tested directly with a REST client (curl, Postman, Insomnia).

## Making changes

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
2. Make your changes.
3. There is currently no linter or test suite configured (see [Known limitations](./README.md#known-limitations)) — until one exists, manually verify the affected endpoints against a running MongoDB instance before opening a PR.
4. Commit with a clear message describing *what* and *why*.
5. Push and open a pull request against `main`, filling out the [pull request template](./.github/pull_request_template.md).

## Code style

- Match the existing pattern: route handlers live directly in `routes/*.js`. If you want to move logic into `controllers/*.js` (which currently exist as empty scaffolds), raise it as an issue first so the direction is agreed on before a large refactor.
- Keep auth logic consistent with the existing `middleware/userAuth.js` / `middleware/adminAuth.js` patterns (JWT + revocable token list on the Mongoose document) rather than introducing a new auth mechanism in isolation.
- New environment variables must be added to both `.env.example` and the table in `README.md`.

## Reporting bugs

Use the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md). Include steps to reproduce, what you expected, and what actually happened.

## Suggesting features

Use the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md).

## Security issues

Do not open a public issue for a security vulnerability — see [`SECURITY.md`](./SECURITY.md).

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
