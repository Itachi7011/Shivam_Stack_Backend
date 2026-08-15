# Security Policy

## Supported versions

This project does not yet follow a formal versioning/release scheme (`package.json` version is `1.0.0` with no tagged releases at the time of writing). Security fixes will be applied to the `main` branch.

## Reporting a vulnerability

If you discover a security vulnerability in this repository, please **do not open a public GitHub issue**. Instead:

1. Use GitHub's [private vulnerability reporting](https://github.com/Itachi7011/Shivam_Stack_Backend/security/advisories/new) feature if enabled on this repository, or
2. Email the maintainer directly at the contact address listed on the [live site](https://shivam-webstack.netlify.app/contact).

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code if applicable)
- Any suggested remediation, if you have one

## Scope

This repository is the **backend API only**. It handles authentication, data storage, file uploads, email, and real-time messaging, and is called by a separately hosted frontend. Vulnerabilities specific to the frontend should be reported to the [`Shivam_Stack_Frontend`](https://github.com/Itachi7011/Shivam_Stack_Frontend) repository instead.

Backend-relevant concerns in scope here include (but aren't limited to):
- Authentication/authorization bypass (user or admin JWT flows, permission checks in `middleware/adminAuth.js`)
- Injection or NoSQL-injection issues in Mongoose queries
- Improper input validation on any `/api/*` endpoint
- Insecure handling of secrets (`JWT_SECRET`, Cloudinary/SendGrid credentials)
- Missing or bypassable rate limiting — note that `express-rate-limit` is currently defined but **not mounted** in `app.js`; see the README's [Known limitations](./README.md#known-limitations)
- Dependency vulnerabilities surfaced by `npm audit`

## Response

This is currently a small, individually maintained project without a dedicated security team or SLA. Reports will be acknowledged and investigated on a best-effort basis. Please be patient, and thank you for reporting responsibly.
