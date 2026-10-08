# Bricks SEO Platform — Architecture & Delivery Plan

**Status:** Proposed — pending the decisions in §22
**Written:** 2026-10-05
**Scope:** The server side of Bricks SEO: Paddle fulfillment → accounts → license keys → plugin activation → update delivery → customer dashboard → admin/analytics dashboard.
**Stack (fixed by you):** Node.js + JavaScript (no TypeScript) + React + **Zod** for all validation.

> **Where this file lives:** it is parked in the plugin folder only so it is easy to find. It is **not** part of the plugin and must be excluded from the release zip (§10.3). When the new repo exists (`bricks-seo-platform/`), move it to `docs/ARCHITECTURE.md` and treat it as that repo's living source of truth, the same way `SPECIFICATION.md` is for the plugin.

---

## Table of contents

1. [What we are building (one page)](#1-what-we-are-building-one-page)
2. [Principles & non-goals](#2-principles--non-goals)
3. [End-to-end flows](#3-end-to-end-flows)
4. [Technology choices](#4-technology-choices)
5. [Repository & code structure](#5-repository--code-structure)
6. [Environments & configuration](#6-environments--configuration)
7. [Data model](#7-data-model)
8. [Paddle integration](#8-paddle-integration)
9. [License system](#9-license-system)
10. [Plugin-facing API & update delivery](#10-plugin-facing-api--update-delivery)
11. [Auth & sessions](#11-auth--sessions)
12. [Customer dashboard](#12-customer-dashboard-accountbricksseocom)
13. [Admin dashboard & analytics](#13-admin-dashboard--analytics)
14. [Email system](#14-email-system)
15. [Background jobs](#15-background-jobs)
16. [Security](#16-security)
17. [Operations: deploy, observability, backups](#17-operations-deploy-observability-backups)
18. [Testing strategy](#18-testing-strategy)
19. [Changes required in the WordPress plugin](#19-changes-required-in-the-wordpress-plugin)
20. [Delivery roadmap](#20-delivery-roadmap)
21. [Go-live checklist](#21-go-live-checklist)
22. [Open decisions & risks](#22-open-decisions--risks)
- [Appendix A — Paddle event cheat-sheet](#appendix-a--paddle-event-cheat-sheet)
- [Appendix B — Error code catalogue](#appendix-b--error-code-catalogue)
- [Appendix C — Checkout snippet for bricksseo.com](#appendix-c--checkout-snippet-for-bricksseocom)
- [Appendix D — Zod schema samples](#appendix-d--zod-schema-samples)

---

## 1. What we are building (one page)

Today the plugin has a License tab that posts to `https://api.bricksseo.com/v1/license`, which does not exist, and a temporary skeleton key (`License::DEV_TEST_KEY`) that must be deleted before any real sale. There is also no way to deliver updates.

We are building **one Node service plus one React app** that does five jobs:

| # | Job | Who touches it |
|---|-----|----------------|
| 1 | **Fulfil purchases.** Receive Paddle webhooks, create the customer's account with a temporary password, issue a license key for their plan, and email all of it. | Paddle → server (no human) |
| 2 | **Serve the plugin.** Activate / validate / deactivate a key per site, enforce the plan's site limit, record which sites are using which key. | WordPress sites → server |
| 3 | **Deliver updates.** Host release zips, answer WordPress's update checks, hand licensed sites a short-lived download URL. | WordPress sites → server |
| 4 | **Customer dashboard** (`account.bricksseo.com`). Log in with the emailed credentials, see license keys, plan, renewal date, activated sites (name + URL), download the plugin, manage billing. | Customers |
| 5 | **Admin dashboard** (same app, `/admin`). Revenue, MRR, licenses, sites, version adoption, refunds, release management, webhook/email health. | You |

The golden path you described:

```text
Buy button ─► Paddle checkout ─► (payment) ─► Paddle webhook ─► our server
                                                 │
                              creates user + temp password + license key
                                                 │
                                                 ▼
                         email: username, temp password, dashboard link, license key
                                                 │
   Paddle redirects buyer to bricksseo.com/thank-you  (independent of the above)
```

**Key property:** the license key works from the moment it is issued, with or without the buyer ever logging in. The dashboard is a convenience, never a dependency.

---

## 2. Principles & non-goals

### Principles

1. **Webhooks are the source of truth for money; the database is the source of truth for entitlement.** Paddle tells us what happened; we derive license state from it deterministically and idempotently.
2. **Respond fast, work later.** The webhook endpoint verifies, persists, enqueues and returns `200` in well under Paddle's 5-second limit. All real work runs in a worker.
3. **Every handler is idempotent and order-independent.** Paddle retries (live: 60 attempts over 3 days), can deliver duplicates, and does **not** guarantee ordering. Handlers must produce the same end state regardless.
4. **Fail open for customers, closed for us.** If our server is down, customers' plugins keep working and keep their last known license state. If Paddle sends something we don't understand, we store it, alert, and do nothing destructive.
5. **One place per decision.** Plan limits, effective license status, activation rules and dev-site classification each live in exactly one module. (Same spirit as `Ownership::will_output()` in the plugin.)
6. **Validate at every boundary with Zod.** Env vars, HTTP input, Paddle payloads, our own plugin-facing responses, and the shared form schemas used by React.
7. **Boring technology.** Postgres, a Postgres-backed queue, server-side sessions, one VPS. A solo founder must be able to operate this at 2 a.m.

### Non-goals (explicitly out of scope for v1)

- **DRM.** The plugin is PHP running on the customer's server; anyone determined can bypass licensing. The license system gates **updates and support**, not functionality (see decision D1). We do not obfuscate code or phone home aggressively.
- **Our own billing UI.** Invoices, card updates and cancellation use Paddle's hosted customer portal (§8.9).
- **Refund UI.** Refunds are issued in the Paddle dashboard; the platform reacts via webhook.
- **Self-serve plan upgrades/downgrades.** v1: admin changes the plan manually after a support request. v1.1: in-dashboard upgrade via Paddle's subscription-update API with proration.
- **Teams / multiple users per account, SSO, affiliate tracking, usage metering.**
- **SureCart/other-ecommerce anything** — unrelated to this service.

---

## 3. End-to-end flows

### 3.1 Purchase → account → license → email

```text
Buyer      bricksseo.com   Paddle         api.bricksseo.com               Worker (pg-boss)           Email provider
  │ click Buy ─►│              │                  │                               │                         │
  │             │ Paddle.Checkout.open({priceId, successUrl})                      │                         │
  │ ◄───── overlay checkout ──►│ pay              │                               │                         │
  │             │              │─ POST /v1/webhooks/paddle  (transaction.completed, signed) ─►              │
  │             │              │                  │ 1 verify Paddle-Signature (HMAC over raw body)          │
  │             │              │                  │ 2 INSERT webhook_events (UNIQUE event_id → dedupe)       │
  │             │              │ ◄──── 200 ───────│ 3 enqueue job "paddle.process_event" ─────►│             │
  │ ◄── redirect to /thank-you (Paddle, independent of our webhook)                           │             │
  │                                                                                           │ 4 GET Paddle /customers/{id}  → email, name
  │                                                                                           │ 5 TX: upsert user (temp pw if new)
  │                                                                                           │       insert transaction row
  │                                                                                           │       create license(s) per item×quantity
  │                                                                                           │       license_events, audit
  │                                                                                           │ 6 enqueue email job
  │                                                                                           │ 7 send welcome email ──────►│
  │ ◄───────────── email: login (email) + temp password + dashboard link + license key ───────────────────────────────┤
```

The buyer typically sees the thank-you page seconds before the email lands. The thank-you page therefore says "check your inbox (and spam) in the next couple of minutes" and links to `support@bricksseo.com`.

### 3.2 Plugin activation

```text
Customer pastes key in WP admin → License tab → "Activate"
  WP site ── POST /v1/plugin/license/activate {license_key, site{url,name,environment,locale}, client{versions}} ──► API
  API:   normalise key → HMAC lookup → license row FOR UPDATE
         status check (active? expired? revoked?)
         site_key = normalise(site.url)
         already activated?  → refresh metadata, return active
         counts toward limit? (dev/staging free, §9.5)  → count live activations < site_limit ?
         insert activation, license_event, return {license summary}
  WP stores {status, plan, expires_at, sites_used, site_limit, last_ok} in option brxseo_license
Daily WP-Cron: /license/validate → updates last_seen_at; picks up expiry/revocation/remote deactivation.
```

### 3.3 Update check and install

```text
WP core (every ~12h, or "Check again")  → filter update_plugins_api.bricksseo.com
  Updater::check() ── POST /v1/plugin/updates/check {license_key?, site, client, channel} ──► API
  API: latest published release for channel; compare to client.plugin_version
       return {update:{version, requires, tested, changelog, sha256, signature, package_available}, license:{status}}
  WP shows "Update available". If license inactive/expired: update row says "renew license to update".

User clicks Update:
  upgrader_pre_download filter (ours) ── POST /v1/plugin/updates/download {license_key, site, version} ──► API
  API: re-validate license + activation; log download; sign a 10-minute URL to the zip in object storage
  Plugin: download_url(signed URL) → verify sha256 and Ed25519 signature → hand zip path back to WP core.
```

### 3.4 Subscription lifecycle (Solo / Studio / Agency are annual subscriptions)

```text
Renewal paid      transaction.completed (+ subscription.updated)  → license.expires_at = new period end
Payment fails     subscription.past_due                           → access KEPT, dashboard banner, Paddle dunning emails run
Customer cancels  subscription.updated (scheduled_change=cancel)  → access kept until effective_at, banner "ends on …"
Period ends       subscription.canceled                           → license EXPIRED (key stays valid for re-activation on renewal)
Refund (full)     adjustment.created/updated (refund, approved)   → license REVOKED, activations closed, subscription cancelled
Chargeback        adjustment (chargeback)                         → license REVOKED + customer flagged
Lifetime ($299)   transaction.completed, no subscription          → license with expires_at = NULL
```

### 3.5 Dashboard login

```text
Email: username = the buyer's email, temp password
→ POST /v1/auth/login → session cookie, must_change_password=true
→ SPA forces /change-password → then normal dashboard
→ license keys, sites, downloads, "Manage billing" (Paddle portal link generated on demand)
```

---

## 4. Technology choices

| Concern | Choice | Why (and what we rejected) |
|---|---|---|
| Runtime | **Node.js 22 LTS**, ESM (`"type":"module"`) | You already have Node 22 locally (`laragon/bin/nodejs/node-v22`). |
| Language | **JavaScript only**, JSDoc where it helps editors | Your requirement. Zod gives us runtime-checked shapes; no TS needed. |
| HTTP framework | **Fastify 5** | Built-in schema hooks, pino logging, encapsulated plugins, trivial raw-body access (mandatory for Paddle signatures), `app.inject()` for fast tests. Express would also work; Fastify gives us rate-limit, cookie, helmet and validation as first-party plugins. |
| Validation | **Zod 4** everywhere | Env, request/response, Paddle payloads, shared with React forms via `packages/shared`. We use `fastify-type-provider-zod`'s compilers from plain JS (we ignore its types). If it lags Zod 4, the fallback is a ~25-line custom `validatorCompiler`. |
| Database | **PostgreSQL 16** | Transactions with `SELECT … FOR UPDATE` (site-limit race), partial unique indexes, `citext`, `jsonb` for raw webhook payloads. MySQL (Laragon) would work but loses partial indexes and makes the queue story worse. |
| DB access | **Knex** (+ `pg`) | JS-native query builder and migrations. Prisma/Drizzle/Kysely are TS-first and bring little without types. Raw SQL via `knex.raw` for analytics. |
| Queue / jobs | **pg-boss** (Postgres-backed) | No Redis to run. Retries, backoff, cron schedules, dedupe keys, all in the DB we already back up. (Redis exists in Laragon, but one fewer moving part on the VPS is worth more.) |
| Passwords | **argon2id** via `@node-rs/argon2` | Prebuilt binaries (no node-gyp pain on Windows). |
| Sessions | **Opaque server-side sessions**, `HttpOnly; Secure; SameSite=Lax` cookie, SHA-256 of the token stored in DB | Revocable, no JWT pitfalls, same-origin SPA makes this trivial. |
| 2FA | TOTP (`otplib`) + recovery codes, **mandatory for admins** | Admin dashboard can see all customers and keys. |
| Email | Adapter interface; **SMTP → Mailpit** in dev (Laragon already has Mailpit); **Postmark or Resend** in prod (D5) | Transactional deliverability matters more than price here. Plain-JS template functions (HTML + text), no JSX render step. |
| Object storage | **Cloudflare R2** (S3 API via `@aws-sdk/client-s3`), local disk driver in dev | Release zips; no egress fees; presigned URLs. |
| Frontend | **React 19 + Vite**, React Router, **TanStack Query**, react-hook-form + `@hookform/resolvers/zod`, **Tailwind CSS**, Recharts, TanStack Table, lucide icons | No TypeScript: `.jsx` + JSDoc. Forms reuse the exact Zod schemas the API enforces. |
| Paddle client | Thin `fetch` wrapper (undici) + our own signature verification | Only ~7 endpoints are needed; easy to mock; no SDK surprises. Responses are Zod-parsed (loosely — Paddle adds fields). |
| Logging | **pino**, redaction of `license_key`, `password`, `authorization`, cookies | Never log secrets. |
| Testing | **Vitest**, `app.inject()`, dedicated test DB, Playwright for 3–4 browser journeys | Mirrors the plugin convention: tests never touch a live DB. |
| Lint/format | ESLint + Prettier | — |
| Packaging | **npm workspaces** monorepo | One repo, `apps/api`, `apps/web`, `packages/shared`. |
| Hosting | **One VPS + Docker Compose + Caddy** behind Cloudflare DNS (D4) | Cheapest operable option; Paddle retries cover short outages (§8.5). |

---

## 5. Repository & code structure

New repo: `C:\laragon\www\bricks-seo-platform\` (separate from the plugin; `git init` the plugin repo too — it is currently not under version control and we are about to start shipping releases from it).

```text
bricks-seo-platform/
├─ package.json                  # workspaces: apps/*, packages/*
├─ docker-compose.yml            # dev: postgres (+ optional mailpit); prod override in infra/
├─ .env.example
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ server.js            # process entry: build app, listen
│  │  │  ├─ app.js               # buildApp(opts) factory — what tests import
│  │  │  ├─ worker.js            # process entry: pg-boss workers + schedules
│  │  │  ├─ config/env.js        # Zod-parsed env, frozen; app refuses to boot on bad config
│  │  │  ├─ db/
│  │  │  │  ├─ knex.js
│  │  │  │  ├─ migrations/       # 001_extensions.js, 002_users.js, … one per concern
│  │  │  │  └─ seeds/            # plans, plan_prices (per APP_ENV), dev admin
│  │  │  ├─ http/                # cross-cutting Fastify plugins
│  │  │  │  ├─ error-handler.js  # AppError → JSON {ok:false,error:{code,message}}
│  │  │  │  ├─ auth.js           # session loading, requireUser/requireAdmin/requirePasswordChanged
│  │  │  │  ├─ rate-limit.js
│  │  │  │  ├─ raw-body.js       # keeps Buffer for /v1/webhooks/paddle
│  │  │  │  └─ security.js       # helmet, CORS (only for /v1/public/*), request ids
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/             # login, logout, change/forgot/reset password, TOTP
│  │  │  │  ├─ users/
│  │  │  │  ├─ plans/            # plan table + SINGLE source of limits (planFor(priceId))
│  │  │  │  ├─ licenses/         # keygen.js, service.js, repo.js, effective-status.js
│  │  │  │  ├─ activations/      # activate/validate/deactivate, normalize-site.js, classify-site.js
│  │  │  │  ├─ paddle/
│  │  │  │  │  ├─ client.js      # fetch wrapper (+ zod response schemas)
│  │  │  │  │  ├─ verify.js      # signature verification
│  │  │  │  │  ├─ webhook.routes.js
│  │  │  │  │  ├─ events.schemas.js
│  │  │  │  │  ├─ handlers/      # transaction-completed.js, subscription-updated.js, adjustment.js, …
│  │  │  │  │  ├─ fulfillment.js # the core provisioning function (§8.6)
│  │  │  │  │  └─ reconcile.js   # hourly sweep + backfill (§8.11)
│  │  │  │  ├─ plugin-api/       # /v1/plugin/* routes + zod contracts (§10)
│  │  │  │  ├─ releases/         # upload, validate zip, storage driver, signing verify, publish/yank
│  │  │  │  ├─ account/          # customer-facing routes
│  │  │  │  ├─ admin/            # admin routes
│  │  │  │  ├─ analytics/        # metric queries
│  │  │  │  ├─ email/            # mailer.js, providers/, templates/
│  │  │  │  ├─ audit/
│  │  │  │  └─ jobs/             # queue.js, job definitions, schedules
│  │  │  └─ lib/                 # crypto.js (AES-GCM, HMAC), ids.js, errors.js, semver.js, time.js
│  │  └─ test/                   # unit/, integration/, fixtures/paddle/*.json
│  └─ web/
│     ├─ index.html
│     ├─ vite.config.js          # dev proxy: /v1 → http://localhost:4000
│     └─ src/
│        ├─ main.jsx
│        ├─ app/                 # router, providers, route guards, query client
│        ├─ features/
│        │  ├─ auth/             # login, forced password change, forgot/reset, 2FA
│        │  ├─ licenses/         # list, detail, sites table, key reveal/copy
│        │  ├─ downloads/
│        │  ├─ billing/          # "Manage billing" → portal redirect
│        │  ├─ pay/              # /pay page running Paddle.js (default payment link, §8.10)
│        │  └─ admin/            # overview, customers, licenses, orders, sites, releases, system
│        ├─ components/ui/       # buttons, tables, dialogs, charts wrappers
│        ├─ lib/api.js           # fetch wrapper (credentials, error mapping, CSRF header)
│        └─ styles/              # tokens mirrored from plugin assets/css/admin.css
├─ packages/
│  └─ shared/                    # Zod schemas + constants used by BOTH api and web
│     └─ src/                    # auth.js, license.js, plugin-contract.js, plans.js, errors.js
├─ scripts/                      # create-admin.js, seed.js, sign-release.js, reconcile.js, import-paddle-history.js
├─ infra/                        # Caddyfile, Dockerfile.api, Dockerfile.web, compose.prod.yml, backup.sh
└─ docs/                         # ARCHITECTURE.md (this file), RUNBOOK.md, API.md (generated from Zod)
```

**Layering rule for `apps/api` modules:** `routes → service → repo`. Routes parse with Zod and call services; services hold business rules and own transactions; repos contain SQL only. Nothing below `routes` knows about HTTP.

**Error rule:** services throw `AppError(code, httpStatus, message, details?)`. The error handler is the only place that turns errors into responses. Unknown errors become `500 internal_error` with a request id and are logged with full detail.

---

## 6. Environments & configuration

| Environment | API | Paddle | Mail | DB | Storage |
|---|---|---|---|---|---|
| **local** | `localhost:4000` (+ `ngrok` tunnel for webhooks — ngrok is already in Laragon) | **Sandbox** | Mailpit (Laragon, SMTP :1025 / UI :8025) | Docker Postgres `bricks_seo_platform` | local disk |
| **test** | in-process `app.inject()` | mocked | stub mailer | `bricks_seo_platform_test` (never the dev DB) | in-memory |
| **staging** (recommended) | `staging-api.bricksseo.com` | **Sandbox** | Postmark/Resend sandbox stream | separate DB | separate R2 bucket |
| **production** | `api.bricksseo.com` | **Live** | Postmark/Resend | prod DB | prod R2 bucket |

Paddle sandbox and live are **separate accounts** with separate products, prices, API keys, client tokens and webhook secrets. `PADDLE_ENV` selects the API base (`https://sandbox-api.paddle.com` vs `https://api.paddle.com`) and which price ids in `plan_prices` count.

### Environment variables (all validated by Zod at boot — see Appendix D)

| Var | Notes |
|---|---|
| `APP_ENV` | `local` \| `staging` \| `production` |
| `PORT`, `LOG_LEVEL`, `TRUST_PROXY` | |
| `APP_URL` | `https://account.bricksseo.com` (used in emails, cookie scope) |
| `API_URL` | `https://api.bricksseo.com` |
| `MARKETING_URL` | `https://bricksseo.com` (CORS allow-list for `/v1/public/*`) |
| `DATABASE_URL` | |
| `APP_ENCRYPTION_KEYS` | `v1:<base64-32-bytes>[,v0:…]` — first is current; supports rotation. Encrypts license keys at rest, TOTP secrets, temp passwords. |
| `LICENSE_KEY_PEPPER` | 32+ random bytes; HMAC secret for key lookup hashes. **Never rotate casually** (invalidates all lookups; see §9.2). |
| `PADDLE_ENV` | `sandbox` \| `production` |
| `PADDLE_API_KEY` | server-side key, least-privilege scopes (customers read, addresses read, subscriptions read/write, transactions read, prices write, customer-portal-sessions write) |
| `PADDLE_WEBHOOK_SECRET` | the notification-destination secret (`pdl_ntfset_…`) |
| `PADDLE_CLIENT_TOKEN` | public client-side token for Paddle.js (served to the SPA `/pay` page) |
| `PADDLE_WEBHOOK_TOLERANCE_SECONDS` | default `300` (see §8.4 for why this is not the security boundary) |
| `PADDLE_ENFORCE_IP_ALLOWLIST` | default `false`; only enable if the proxy chain yields a trustworthy client IP |
| `AUTO_CANCEL_SUBSCRIPTION_ON_REFUND` | default `true` |
| `EMAIL_PROVIDER` | `smtp` \| `postmark` \| `resend` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `ADMIN_ALERT_EMAIL` | |
| `SMTP_URL` / `POSTMARK_SERVER_TOKEN` / `RESEND_API_KEY` | per provider |
| `STORAGE_DRIVER` | `local` \| `r2` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` / `LOCAL_STORAGE_DIR` | |
| `RELEASE_SIGNING_PUBLIC_KEY` | Ed25519 **public** key (base64). The private key never lives on the server (§10.4). |
| `SENTRY_DSN` | optional |

Runtime-tunable policy (stored in the `settings` table, editable in the admin UI, not env): `lifetime_cap` (25), `stale_activation_days` (45), `dev_host_patterns`, `max_dev_activations_per_license` (10), `past_due_grace_days`, `maintenance_mode`.

---

## 7. Data model

PostgreSQL 16. Extensions: `citext`, `pgcrypto` (for `gen_random_uuid()`). All timestamps `timestamptz` (UTC). Money is **integer minor units + ISO currency** — Paddle sends amounts as strings; parse to integers at the edge.

### 7.1 Entity overview

```text
users 1───* sessions
users 1───* auth_tokens
users 1───* licenses *───1 plans 1───* plan_prices
users 1───* subscriptions   licenses *───0..1 subscriptions
users 1───* transactions 1───* adjustments
licenses 1───* activations
licenses 1───* license_events
releases 1───* release_downloads
webhook_events   email_log   audit_log   settings   daily_snapshots   (standalone)
```

### 7.2 Tables

**`users`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `email` | citext unique not null | login username |
| `name` | text | from Paddle customer |
| `role` | text check (`customer`,`admin`) | default `customer` |
| `status` | text check (`active`,`disabled`) | |
| `password_hash` | text not null | argon2id |
| `must_change_password` | bool | true for temp-password accounts |
| `temp_password_ciphertext` | text null | AES-GCM; **nulled once the welcome email is sent** (§11.2) |
| `temp_password_expires_at` | timestamptz null | 7 days |
| `totp_secret_ciphertext` | text null | |
| `totp_enabled_at` | timestamptz null | |
| `recovery_codes_hash` | jsonb null | array of hashes |
| `paddle_customer_id` | text unique null | `ctm_…` |
| `failed_login_count`, `locked_until` | int, timestamptz | |
| `flagged` | bool | chargeback / abuse flag |
| `created_at`, `updated_at`, `last_login_at`, `deleted_at` | | `deleted_at` = anonymised per privacy request |

**`sessions`**: `id`, `user_id`, `token_hash` (sha256, unique), `created_at`, `last_used_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `ip`, `user_agent`, `password_change_required` (restricted session).

**`auth_tokens`**: `id`, `user_id`, `purpose` (`password_reset`), `token_hash` unique, `expires_at` (1 h), `used_at`, `created_at`, `ip`.

**`plans`**: `code` pk (`solo`,`studio`,`agency`,`lifetime`), `name`, `site_limit` int null (**null = unlimited**), `interval` (`year`,`lifetime`), `sort`, `active`.

| code | site_limit | interval |
|---|---|---|
| solo | 1 | year |
| studio | 5 | year |
| agency | NULL | year |
| lifetime | NULL | lifetime |

**`plan_prices`**: `paddle_price_id` pk, `plan_code` fk, `environment` (`sandbox`,`production`), `paddle_product_id`, `active`. *This table — not env vars — is how an incoming Paddle price id becomes a plan.* Keeping old price ids after a price change means existing subscriptions continue to map correctly.

**`licenses`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | fk | |
| `plan_code` | fk | changes on upgrade |
| `key_hash` | bytea unique | `HMAC-SHA256(pepper, normalised_key)` — lookup |
| `key_ciphertext` | text | AES-256-GCM — so the dashboard can show the key again |
| `key_hint` | text | `BSEO-…-X7QF` — safe for logs and admin lists |
| `status` | text check | `active`,`expired`,`suspended`,`revoked` |
| `status_reason` | text null | `refunded`,`chargeback`,`canceled`,`paused`,`admin`,`past_due`… |
| `site_limit` | int null | **snapshot** from the plan at issue (admin can override; null = unlimited) |
| `issued_at`, `expires_at` | timestamptz | `expires_at` NULL = never (lifetime) |
| `paddle_subscription_id` | text null | indexed |
| `paddle_transaction_id` | text not null | originating transaction |
| `item_index`, `unit_index` | smallint | **unique (`paddle_transaction_id`,`item_index`,`unit_index`)** → fulfillment idempotency |
| `notes` | text | admin-only |
| `created_at`, `updated_at` | | |

**`subscriptions`**: `paddle_subscription_id` pk, `user_id`, `plan_code`, `paddle_price_id`, `status` (`active`,`trialing`,`past_due`,`paused`,`canceled`), `current_period_start`, `current_period_end`, `scheduled_change_action` (`cancel`,`pause`,null), `scheduled_change_effective_at`, `canceled_at`, `currency`, `unit_price_minor`, `last_event_at` (the `occurred_at` of the newest event applied — out-of-order guard), `updated_at`.

**`transactions`**: `paddle_transaction_id` pk, `user_id`, `paddle_subscription_id` null, `origin`, `status`, `currency`, `subtotal_minor`, `discount_minor`, `tax_minor`, `total_minor`, `payout_currency`, `payout_earnings_minor`, `payout_fee_minor`, `country_code` null, `invoice_number` null, `items` jsonb (`[{price_id, quantity, plan_code}]`), `billed_at`, `created_at`.

**`adjustments`**: `paddle_adjustment_id` pk, `paddle_transaction_id` fk, `action` (`refund`,`chargeback`,`credit`…), `status`, `total_minor`, `currency`, `reason`, `full_refund` bool (computed), `created_at`, `updated_at`.

**`activations`**

| Column | Notes |
|---|---|
| `id` uuid pk, `license_id` fk | |
| `site_key` | normalised `host[/path]` — identity for slot counting (§9.4) |
| `site_url`, `site_name` | as reported by the plugin (display) |
| `environment` | `production`,`staging`,`development`,`local` (from `wp_get_environment_type()`) |
| `counts_toward_limit` bool | decided once by `classify-site.js` at activation |
| `plugin_version`, `wp_version`, `php_version`, `bricks_version`, `locale` | analytics |
| `first_activated_at`, `last_seen_at` | |
| `deactivated_at`, `deactivated_by` | `site`,`customer`,`admin`,`system_stale`,`system_revoked` |
| `last_ip` inet | |

Indexes: **unique partial** `(license_id, site_key) WHERE deactivated_at IS NULL`; `(license_id) WHERE deactivated_at IS NULL`; `(last_seen_at)`.

**`license_events`** (timeline): `id`, `license_id`, `type` (`issued`,`renewed`,`expired`,`revoked`,`reinstated`,`plan_changed`,`extended`,`site_activated`,`site_deactivated`,`key_regenerated`,`limit_blocked`), `actor` (`paddle`,`system`,`customer:<id>`,`admin:<id>`,`site:<activation_id>`), `meta` jsonb, `created_at`. Drives the per-license timeline in both dashboards and historical analytics.

**`releases`**: `id`, `version` unique, `version_sort` (padded semver for ordering), `channel` (`stable`,`beta`), `status` (`draft`,`published`,`yanked`), `summary`, `changelog_md`, `requires_wp`, `requires_php`, `tested_up_to`, `storage_key`, `size_bytes`, `sha256`, `signature` (base64 Ed25519), `published_at`, `created_by`, `created_at`.
**`release_downloads`**: `id`, `release_id`, `license_id`, `activation_id` null, `kind` (`wp_update`,`dashboard`), `created_at`.

**`webhook_events`**: `id` uuid, `paddle_event_id` text **unique**, `paddle_notification_id`, `event_type`, `occurred_at`, `payload` jsonb, `status` (`pending`,`processing`,`processed`,`failed`,`skipped`), `attempts`, `last_error`, `received_at`, `processed_at`.

**`email_log`**: `id`, `user_id` null, `to`, `template`, `subject`, `provider`, `provider_message_id`, `idempotency_key`, `status` (`queued`,`sent`,`failed`), `error`, `created_at`, `sent_at`.

**`audit_log`**: `id`, `actor_user_id` null, `actor_label`, `action`, `target_type`, `target_id`, `meta` jsonb, `ip`, `created_at`. **Every admin mutation writes a row.**

**`settings`**: `key` pk, `value` jsonb, `updated_by`, `updated_at`.

**`daily_snapshots`**: `date` pk, `active_licenses`, `active_sites`, `mrr_minor_usd`, `lifetime_sold`, `customers_total`, `jsonb breakdowns`. Written nightly so MRR/sites history charts do not have to be reconstructed.

### 7.3 Derived values — one function each

- **`effectiveLicenseStatus(license, subscription, now)`** (`modules/licenses/effective-status.js`) — the **only** place that answers "is this license usable right now?" Everything (plugin API, dashboards, emails) calls it. Rules in §9.3.
- **`siteLimitFor(license)`** — `license.site_limit` (snapshot), never the plan table directly.
- **`planFor(paddlePriceId, env)`** — `plan_prices` lookup; unknown price ⇒ item ignored and an admin alert raised.

---

## 8. Paddle integration

### 8.1 What we verified in Paddle's docs (2026-10-05)

| Fact | Consequence for design |
|---|---|
| Header `Paddle-Signature: ts=<unix>;h1=<hex>`; signature = **HMAC-SHA256** over `"{ts}:{rawBody}"` with the destination secret; **raw body must not be re-serialised.** | Webhook route keeps the untouched `Buffer`; compare with `crypto.timingSafeEqual`. |
| Respond **`200` within 5 seconds**. Live: **60 retries over 3 days**; sandbox: 3 retries over 15 min. Failed notifications can be **replayed up to 90 days**. | Persist-then-ack; a multi-hour outage loses nothing. |
| **No ordering guarantee; duplicates possible.** Docs advise checking `occurred_at` and storing processed `event_id`. | `UNIQUE(paddle_event_id)` + `occurred_at` guards + state-based handlers (§8.5). |
| `transaction.completed` carries `customer_id`, `address_id`, `subscription_id`, `custom_data`, `items[].price.id` + `quantity`, `details.totals`, `details.payout_totals`, `billing_period` — **but not the customer's email.** | Fulfillment must `GET /customers/{id}` before it can create the account. |
| Authenticated customer-portal links: `POST /customers/{id}/portal-sessions` with up to 25 `subscription_ids` (deep links for cancel / update payment method). Sessions are temporary and must not be cached. | "Manage billing" button generates a fresh link per click. |
| Paddle publishes **separate webhook source IP lists** for sandbox and live. | Optional defence in depth (§8.4). |
| Paddle's own guidance: listen to `subscription.created` / `subscription.updated`, keep a lean cache, run periodic reconciliation. `subscription.updated` is the catch-all for renewals, plan changes, pauses, cancellations. | Matches our design (§8.5, §8.11). |

### 8.2 To confirm in the Paddle **sandbox** before relying on them

These are not documented clearly enough to design around blindly; each has a defined fallback and a sandbox test in the roadmap (Phase 2):

1. `successUrl` supports **no transaction-id placeholder** → the thank-you page is static (design already assumes this).
2. Whether a **default payment link** is required and what it must host (§8.10).
3. Exact shape of `adjustment.*` for full vs partial refunds, and whether Paddle auto-cancels the subscription on refund (design assumes it does **not**).
4. Whether retry deliveries carry a fresh `ts` (design tolerates either: wide tolerance + idempotency).
5. `origin` values on renewal vs plan-change transactions (design does not branch on `origin`).
6. Filter names for listing transactions by update time (needed for reconciliation); fallback is paging by `after` cursor.

### 8.3 Paddle account setup (done once, per environment)

1. Products & prices (create in **sandbox first**, then replicate in live): Solo / Studio / Agency as **annual recurring** prices ($39 / $89 / $179), Lifetime as a **one-time** price ($299). Product `tax_category`: standard digital goods / SaaS.
2. Collect every `pri_…` id into `plan_prices` (seed script reads a small JSON per environment).
3. Notification destination → `https://api.bricksseo.com/v1/webhooks/paddle` with events listed in Appendix A. Copy its secret into `PADDLE_WEBHOOK_SECRET`.
4. API key with the least-privilege scopes listed in §6.
5. Client-side token for Paddle.js.
6. Default payment link (§8.10).
7. Checkout appearance, support email, and **statement descriptor** (shows on the buyer's card statement; mismatch causes disputes).
8. Payout method: Payoneer (already researched).

### 8.4 Webhook receiver (`POST /v1/webhooks/paddle`)

```text
1. rawBody = request body Buffer (content-type parser with parseAs:'buffer', route-scoped)
2. [optional] PADDLE_ENFORCE_IP_ALLOWLIST → reject if source IP ∉ Paddle list for PADDLE_ENV
3. parse "Paddle-Signature" → ts, h1 (reject malformed with 400)
4. expected = HMAC_SHA256(secret, `${ts}:${rawBody}`); timingSafeEqual(expected, h1) else 401
5. |now - ts| > tolerance → 401   (hygiene only: replays are harmless because of step 7)
6. body = JSON.parse(rawBody); z.looseObject({event_id, event_type, occurred_at, notification_id, data}).parse(body)
7. INSERT INTO webhook_events (...) ON CONFLICT (paddle_event_id) DO NOTHING
     • inserted  → enqueue pg-boss job {webhookEventId} (singletonKey = paddle_event_id)
     • conflict  → already received; return 200 (job already exists or ran)
8. return 200 {ok:true}      ← target < 100 ms, hard limit 5 s
```

Security notes: the signature is the security boundary; the timestamp tolerance and IP list are extra hygiene. Cloudflare note: if `api.bricksseo.com` is proxied, add a WAF rule that **skips bot checks** for this path (Paddle's own recommendation) — and do **not** enable the IP allowlist unless the real client IP is trustworthy through the proxy.

### 8.5 Idempotency & ordering strategy

- **Dedupe:** `webhook_events.paddle_event_id` unique. Replays from Paddle's dashboard create no duplicates.
- **Fulfillment idempotency:** licenses are unique on `(paddle_transaction_id, item_index, unit_index)`. Re-running fulfillment for the same transaction is a no-op that returns the existing licenses.
- **Ordering:** handlers never assume "created before updated". Each handler upserts by natural key and then calls one of two **recompute** functions that derive state from stored facts:
  - `recomputeLicenseFromSubscription(subscriptionId)` — runs after every subscription or transaction event.
  - `recomputeLicenseFromAdjustments(transactionId)` — runs after every adjustment event.
- **Stale event guard:** `subscriptions.last_event_at`; an event with `occurred_at` older than the stored value updates nothing (it is still stored and marked `processed`).
- **Poison events:** after 8 failed job attempts the event is `failed`, an alert email fires, and the admin UI offers **Replay**. Nothing is ever silently dropped.

### 8.6 Fulfillment algorithm (`fulfillment.js`, called for `transaction.completed`)

```text
input: transaction (from webhook payload)
1. items = transaction.items mapped through plan_prices[PADDLE_ENV]
   - none known → mark event 'skipped', alert admin ("unknown price"), stop.
2. customer = users.byPaddleCustomerId(txn.customer_id)
   if none → Paddle GET /customers/{id} → {email, name}      (outside DB tx; retried by the job)
3. BEGIN TX
   a. user = users.byEmail(email) (citext)
        found  → attach paddle_customer_id if missing                      → isNewUser=false
        absent → create customer user, random temp password, must_change_password,
                 temp_password_ciphertext (AES-GCM), expires in 7 days      → isNewUser=true
   b. upsert transactions row (amounts, payout totals; best-effort country via address)
   c. IF txn.subscription_id AND licenses exist for it  → renewal / period sync:
          recomputeLicenseFromSubscription(); license_event 'renewed'; NO welcome email
      ELSE for each item, for unit 0..quantity-1:
          insert license (unique key above → ON CONFLICT DO NOTHING RETURNING)
          key = generateKey(); key_hash, key_ciphertext, key_hint
          plan → site_limit snapshot; expires_at = interval==='year' ? txn.billing_period.ends_at : NULL
          license_event 'issued'
   d. COMMIT
4. enqueue email job once per transaction:
      isNewUser            → template `welcome`      (credentials + all new keys)
      existing user        → template `new_license`  (keys only; no password)
      (idempotency key `fulfil:{transactionId}`)
5. enqueue admin alert "New sale: {plan} – {email}"
6. lifetime plan sold → checkLifetimeCap() (§8.8)
```

Defensive behaviours: quantity > 1 creates one license per unit (checkout is configured for quantity 1, but never trust that); multiple items per transaction each become licenses; `custom_data` is recorded but **never** used to decide entitlement — price ids are.

### 8.7 Event handling matrix

| Event | Action |
|---|---|
| `transaction.completed` | Fulfillment (§8.6). Covers first purchase, lifetime, and each renewal. |
| `transaction.payment_failed` | Record; notify customer only if Paddle's own dunning is disabled (default: Paddle handles it). |
| `subscription.created` / `activated` / `updated` / `resumed` / `trialing` | Upsert `subscriptions` (price, status, period, scheduled change); price change ⇒ map new plan, update `licenses.plan_code` + `site_limit`, `license_event plan_changed`; recompute. |
| `subscription.past_due` | status ⇒ `past_due`; **access kept**; dashboard banner with portal link. |
| `subscription.paused` | license `suspended` (reason `paused`). |
| `subscription.canceled` | status `canceled`; license `expired` (reason `canceled`) at `canceled_at`. |
| `adjustment.created` / `updated` | Upsert `adjustments`; if refund **approved** and total ≥ transaction total ⇒ **revoke** licenses of that transaction (`refunded`), close activations (`system_revoked`), and (flag `AUTO_CANCEL_SUBSCRIPTION_ON_REFUND`) cancel the subscription via API; partial refund ⇒ admin alert only. `chargeback` ⇒ revoke + `users.flagged`. |
| `customer.updated` | Sync name/email only if the user has not changed theirs here (rare; log + alert on email change, never auto-change a login identifier silently). |
| anything else | Stored, `skipped`. |

### 8.8 Lifetime cap ("25 only")

- Source of truth: `settings.lifetime_cap` and `COUNT(licenses WHERE plan_code='lifetime' AND status <> 'revoked')`.
- After each lifetime fulfillment, if sold ≥ cap → call Paddle `PATCH /prices/{id}` to **archive** the lifetime price (new checkouts become impossible). Admin → Offers panel can re-open it (e.g. after a refund frees a slot).
- Public read-only endpoint `GET /v1/public/offers/lifetime` → `{cap, sold, remaining}` so the pricing section can show a live counter (CORS-allowed for `bricksseo.com` only; cached 60 s).
- Known tolerated race: two buyers paying in the same few seconds can push sold to 26. We honour both orders (never refund a paying customer for our race); the cap is a marketing promise, not a hard constraint. (Decision D7.)

### 8.9 Billing management

"Manage billing" in the customer dashboard calls `POST /v1/account/billing/portal` → server verifies the user owns the subscription, calls Paddle `POST /customers/{paddle_customer_id}/portal-sessions` (passing the user's `subscription_ids`), and returns the short-lived URL → browser redirects. Never cached or stored. Customers cancel, update the card and view invoices inside Paddle's portal; we learn about the result through webhooks.

### 8.10 Checkout wiring on the marketing site

- Pricing buttons call `Paddle.Checkout.open({ items:[{priceId, quantity:1}], customData:{plan, source:'pricing'}, settings:{ successUrl:'https://bricksseo.com/thank-you', displayMode:'overlay' } })` (snippet in Appendix C — you paste it into Bricks; this resolves the dead `/pricing/` links because the buttons stop being links).
- **Default payment link:** Paddle needs a page that runs Paddle.js for flows that start from a Paddle-generated transaction (e.g. updating a payment method from the portal). We host this at **`https://account.bricksseo.com/pay`** (a tiny SPA route that initialises Paddle.js with `PADDLE_CLIENT_TOKEN`). Confirm in sandbox (§8.2 #2).
- `/thank-you` is static: "Payment received. Your login and license key are on the way — check your inbox in the next couple of minutes (and your spam folder). Didn't get it? support@bricksseo.com."

### 8.11 Reconciliation & backfill

Job `paddle.reconcile` (hourly + on demand from the admin UI):

1. List recently updated completed transactions and subscriptions from Paddle's API.
2. For each, check we have the corresponding `transactions` / `subscriptions` row and licenses.
3. Anything missing is fed into the **same** fulfillment/recompute functions (marked `source: reconcile`).
4. Writes a summary row to `audit_log` and alerts if it had to repair anything (that means a webhook was lost — worth knowing).

The same code, run with a wide date range, is the **backfill** for any purchase that happened before the platform existed (`scripts/import-paddle-history.js`). Check the live Paddle dashboard for real sales to date before launch.

---

## 9. License system

### 9.1 Key format

`BSEO-XXXXX-XXXXX-XXXXX-XXXXX` — Crockford base32 (no `I L O U`), 20 random characters = **100 bits of entropy** from `crypto.randomBytes`. Uniform prefix (the plan is **not** encoded in the key, since plans change on upgrade). Case-insensitive, whitespace/dash-tolerant on input; normalised to uppercase with dashes before hashing. Key space makes online guessing infeasible; rate limits (§16) are belt-and-braces.

### 9.2 Storage

- **Lookup:** `key_hash = HMAC-SHA256(LICENSE_KEY_PEPPER, normalisedKey)`; unique index. A DB dump alone cannot be used to activate plugins.
- **Display:** `key_ciphertext` (AES-256-GCM with `APP_ENCRYPTION_KEYS`, key-id prefixed for rotation) so the customer can view/copy their key in the dashboard. Decrypted only inside the request that serves the owner (or an admin, which is audit-logged).
- **Logs/admin lists:** only `key_hint`.
- **Pepper rotation** would invalidate every lookup hash; if ever needed, do a one-off script that decrypts each key and re-hashes. Do not rotate casually.

### 9.3 Effective status (the single rule set)

```text
license.status = 'revoked'                      → revoked   (terminal unless admin reinstates)
license.status = 'suspended'                    → suspended (paused subscription)
license linked to a subscription:
    sub.status ∈ {active, trialing}             → active
    sub.status = past_due                       → active   (Paddle's recommendation: keep access, show banner)
    sub.status = paused                         → suspended
    sub.status = canceled                       → expired  (at canceled_at; access until then)
    sub.scheduled_change = cancel (future)      → active, but flagged "ends on <date>"
license with no subscription (lifetime)         → active
license.expires_at in the past AND no sub       → expired
```

```text
              purchase paid
  (none) ─────────────────────────► ACTIVE ◄──────── renewal paid / admin reinstate
                                     │   │
        canceled & period ended      │   │  full refund / chargeback / admin revoke
                                     ▼   ▼
                                 EXPIRED   REVOKED
        paused ─► SUSPENDED ─(resumed)─► ACTIVE
```

The key never changes across renewals, lapses and reactivations — a lapsed customer who renews simply flips back to active.

### 9.4 Site identity (`normalize-site.js`)

Lowercase host, IDNA/punycode, strip scheme, strip `www.`, strip default ports and trailing slash, keep the **path** (so `example.com/blog` and `example.com/shop` are different WordPress installs). Examples: `https://WWW.Example.com/` → `example.com`; `http://example.com:80/blog/` → `example.com/blog`. If a site's URL changes (migration, `http→https`), the old activation is freed by the customer in the dashboard, or by staleness (§9.6) — we deliberately do **not** try to auto-detect moves (cloned staging sites copy any "instance id", which would make activations ping-pong between prod and staging).

### 9.5 Which activations count toward the limit (`classify-site.js`)

Default policy (editable in settings; flagged as decision D3):

- **Free (does not count):** `environment ∈ {local, development}` **or** host matches dev patterns: `localhost`, bare IPs, `*.local`, `*.test`, `*.localhost`, `*.ddev.site`, `*.lndo.site`, and common agency staging hosts (`*.instawp.xyz`, `*.tastewp.com`, `*.kinsta.cloud`, `*.flywheelsites.com`, `*.wpenginepowered.com`, `staging.*`, `dev.*`).
- **Counts:** everything else, including `environment=staging` on an arbitrary public host (conservative — prevents trivially setting `WP_ENVIRONMENT_TYPE` to dodge limits).
- Free activations are capped (`max_dev_activations_per_license`, default 10) to stop abuse.

### 9.5.1 Activation algorithm (inside one DB transaction)

```sql
BEGIN;
SELECT * FROM licenses WHERE key_hash = $1 FOR UPDATE;      -- serialises concurrent activations
-- effective status must be 'active' to ACTIVATE (validate may report any status)
-- existing live activation for (license, site_key)?  → refresh metadata, return OK.
SELECT count(*) FROM activations
 WHERE license_id = $id AND deactivated_at IS NULL AND counts_toward_limit
   AND last_seen_at > now() - make_interval(days => $stale_days);   -- stale slots do not count
-- limit not null AND count >= limit AND this site counts → ROLLBACK, 409 site_limit_reached
-- site does NOT count (dev/staging, §9.5) → skip the limit check, but enforce max_dev_activations_per_license
INSERT INTO activations (...);  INSERT INTO license_events (...);
COMMIT;
```

### 9.6 Slot hygiene

- **Stale reclaim:** an activation not seen for `stale_activation_days` (45) stops counting toward the limit and is auto-deactivated (`system_stale`) by the nightly job. Plugins check in daily, so this only happens to sites that vanished.
- **Customer self-service:** the dashboard lists every site (name, URL, plugin/WP/PHP/Bricks versions, last seen) with a **Deactivate** button. The plugin notices on its next check (`license.status: inactive`) and shows "this site was deactivated remotely".
- **Limit reached message to the plugin** points the user at their dashboard.

### 9.7 What the plugin does when the license is not active (decision D1 — recommended default)

**Nothing is switched off.** SEO features keep working on every site regardless of license state. An inactive/expired/revoked license means: no update offers with a downloadable package, and a notice in the License tab and plugin screens. Rationale: zero risk of breaking a customer's site on renewal day, far fewer support tickets, and anything stronger is trivially bypassable in PHP anyway. If you later add paid-only features, gate those individually.

---

## 10. Plugin-facing API & update delivery

Base: `https://api.bricksseo.com/v1/plugin` (replaces the old `…/v1/license` default; overridable via the existing `bricks_seo_license_api_url` filter and a new `BRICKS_SEO_LICENSE_API` constant for local testing). All endpoints: `POST`, JSON in/out, HTTPS only, `User-Agent: BricksSEO/<version>; <site url>`.

### 10.1 License endpoints

**Common request body** (Zod: `PluginRequestSchema`, Appendix D):

```json
{
  "license_key": "BSEO-ABCDE-FGHJK-MNPQR-STVWX",
  "site": {
    "url": "https://example.com/",
    "name": "Example Co",
    "environment": "production",
    "locale": "en_US"
  },
  "client": {
    "plugin_version": "1.0.0",
    "wp_version": "6.8.1",
    "php_version": "8.3.6",
    "bricks_version": "1.12.4"
  }
}
```

(The set of fields sent is deliberately minimal and must be disclosed in the Privacy Policy — see §21. No content, no user data, no IP beyond what the TCP connection reveals.)

| Endpoint | Purpose |
|---|---|
| `POST /license/activate` | Bind key to this site (consumes a slot if it counts). Requires effective status `active`. |
| `POST /license/validate` | Daily/manual re-check. Updates `last_seen_at` + client versions. Works for any effective status. |
| `POST /license/deactivate` | Free this site's slot. Idempotent. |

**Success (`200`):**

```json
{
  "ok": true,
  "license": {
    "status": "active",
    "plan": "studio",
    "plan_name": "Studio",
    "expires_at": "2027-10-05T00:00:00Z",
    "renews": true,
    "ends_on": null,
    "site_limit": 5,
    "sites_used": 2
  },
  "site": { "activation_id": "…", "counts_toward_limit": true },
  "message": "License activated.",
  "server_time": "2026-10-05T12:00:00Z"
}
```

`license.status` ∈ `active | expired | suspended | revoked | inactive` (`inactive` = key is valid but **this site** is not activated, e.g. removed from the dashboard). `expires_at: null` ⇒ lifetime.

**Failures** — real HTTP statuses plus a stable machine code (Appendix B):

```json
{ "ok": false, "error": { "code": "site_limit_reached", "message": "All 5 site activations are in use. Deactivate a site in your dashboard." } }
```

| HTTP | `code` | Plugin behaviour |
|---|---|---|
| 400 | `validation_failed` | show generic error |
| 404 | `invalid_key` | status `invalid` (same response for unknown keys and malformed keys) |
| 403 | `license_expired` / `license_revoked` / `license_suspended` | store status, show matching notice |
| 409 | `site_limit_reached` | show message; key not stored as active |
| 429 | `rate_limited` | back off, keep last state |
| 5xx / network | — | **keep the last known state**; show "could not verify" only after 14 days without a successful check |

**Critical plugin rule:** a network failure or 5xx **never** downgrades a stored `active` status. Only an explicit, successful server answer can change it.

### 10.2 Update endpoints

**`POST /updates/check`** — body as above, with `license_key` **optional** (unlicensed sites can still be told an update exists), plus `channel` (`stable` default).

```json
{
  "ok": true,
  "update": {
    "version": "1.0.1",
    "released_at": "2026-11-01T09:00:00Z",
    "requires": "6.2",
    "requires_php": "8.0",
    "tested": "6.8",
    "url": "https://bricksseo.com/changelog/",
    "changelog_html": "<h4>1.0.1</h4><ul><li>…</li></ul>",
    "sha256": "…",
    "signature": "<base64 ed25519>",
    "package_available": true,
    "package": "https://api.bricksseo.com/v1/plugin/updates/package?release=1.0.1"
  },
  "license": { "status": "active" }
}
```

`update` is `null` when the site is current. `package_available` is `false` when the license is not active; the plugin then shows "Renew your license to update" in the plugins list instead of an Update link. `package` is a **non-secret placeholder**: opening it unauthenticated returns `401`. Rationale: WordPress caches update data for ~12 hours, so any expiring token embedded in it would be dead by the time someone clicks Update. Instead the real URL is minted at install time:

**`POST /updates/download`** — body: license key + site + `version`. Server re-validates license **and** that the site is an active activation, logs a `release_downloads` row, then returns:

```json
{ "ok": true, "url": "https://<r2-presigned>…", "expires_in": 600, "sha256": "…", "signature": "…" }
```

The plugin's `upgrader_pre_download` hook (only for our placeholder URL) calls this, downloads the zip with `download_url()`, **verifies SHA-256 and the Ed25519 signature**, and returns the local file path to WordPress core. WordPress then performs its normal install, rollback-on-failure and auto-update flow.

**`GET /updates/info?slug=bricks-seo`** feeds the "View details" modal (`plugins_api`): description, changelog, requires, tested, banners/icons.

### 10.3 Release pipeline

```text
Developer (you)                                         Server
 1. bump version in bricks-seo.php header (+ readme/changelog)
 2. scripts/build-release  (in the plugin repo)  → bricks-seo-1.0.1.zip
       • single top-level folder `bricks-seo/`
       • EXCLUDES: vendor/ (dev PHPUnit lives there today), tests/, composer.*, *.md dev docs
         (SPECIFICATION.md, this file), .git*, node_modules, any local config
       • verifies Version header == requested version, php -l on every PHP file
 3. scripts/sign-release  (on YOUR machine, private key never uploaded)
       sha256(zip) → Ed25519 signature → release-1.0.1.json {sha256, signature}
 4. Admin dashboard → Releases → Upload zip + changelog + sig
       server re-computes sha256, verifies the signature with RELEASE_SIGNING_PUBLIC_KEY,
       reads the Version header from the zip's main plugin file, checks version > current latest,
       checks single top-level folder + required header fields, stores to R2 as draft
 5. Preview (download link for you), then Publish → becomes "latest" for its channel
 6. Problem found? Yank → no longer offered; ship 1.0.2 (WordPress never downgrades).
```

### 10.4 Why release signing is in scope for v1

Whoever controls the update server can push code to **every customer's WordPress site**. That is the single highest-impact risk in this whole system. Because the signing key lives only on your machine and the public key is embedded in the plugin, a compromised server or storage bucket cannot serve a malicious update that WordPress sites will accept. Cost: ~40 lines of PHP (`sodium_crypto_sign_verify_detached`, bundled with PHP ≥ 7.2) and one Node script (`crypto.sign(null, data, privateKey)`, Ed25519 is built into Node). If sodium is somehow unavailable on a host, the plugin still enforces the SHA-256 check and degrades gracefully.

---

## 11. Auth & sessions

### 11.1 Accounts

- **No public sign-up.** Customer accounts come only from fulfillment; admin accounts only from `scripts/create-admin.js`.
- Username = email. Passwords: argon2id; minimum 10 characters on change; checked against a small common-password list (no network call).
- **Login:** `POST /v1/auth/login` → generic failure message; per-account counter (5 failures ⇒ 15-minute lock) plus per-IP rate limit.
- **Session cookie:** `__Host-bsid` (`Secure; HttpOnly; SameSite=Lax; Path=/`), 32 random bytes, only `sha256(token)` stored. Customer: 7-day idle / 30-day absolute. Admin: 2-hour idle / 12-hour absolute.
- **CSRF:** SameSite + required `Origin` match on state-changing requests + JSON-only content type + a custom `X-Requested-With` header the SPA's fetch wrapper always sends.
- `POST /v1/auth/logout`, `POST /v1/auth/logout-all` (revokes every session).

### 11.2 Temporary password (as you specified, hardened)

You asked for: login (email) + temp password + dashboard link + license key, all in one email. Implementation:

- Temp password: 16 characters from a 31-symbol unambiguous alphabet, formatted `Xk7m-Qp2w-Rt9v-Hn4c` (~79 bits). Stored as an argon2id hash like any password, **plus** an AES-GCM ciphertext in `temp_password_ciphertext` so a retried email job sends the *same* password (and the provider-level idempotency key stays valid). The ciphertext is **deleted the moment the welcome email is confirmed sent**; a later "resend credentials" admin action generates a fresh temp password.
- `must_change_password = true` and a **7-day expiry**. Logging in with it creates a *restricted* session (`password_change_required`): every API call except `change-password` and `logout` returns `403 password_change_required`, and the SPA routes to `/change-password`.
- Expired and unused → login says "temporary password expired — use *Forgot password*".
- **Why this is still safe enough:** the license key is independent of the account; the password is single-purpose, short-lived, force-rotated, and the email contains nothing that lets a stranger touch billing (that needs a Paddle-side login). **Recommended alternative** (decision D2): replace the temp password with a one-time "Set your password" link (1 hour → 24 hours expiry). Same flow, no password ever travels by email. The code path is identical except for the token type, so switching later is a half-day change; the doc and templates are written so either can ship.

### 11.3 Forgot / reset password

`POST /v1/auth/forgot` always returns the same response (no account enumeration). Token: 32 random bytes, `sha256` stored, 1-hour expiry, single use, all other sessions revoked on reset. Emails a notification when a password changes.

### 11.4 Admin 2FA

Admin role requires TOTP: first admin login forces enrolment (QR + 8 one-time recovery codes, shown once). Sensitive admin actions (revoke, reveal key, reissue key, delete customer) re-prompt for a TOTP code even within a session.

### 11.5 Authorisation

- Customer routes always scope queries by `user_id = session.user_id` **in the repo layer** (not just the route) — IDOR protection by construction.
- Admin routes require `role='admin'` + 2FA-satisfied session; admin mutations write `audit_log`.
- Revealing a license key decrypts only for the owner or an admin (admin reveals are audit-logged).

---

## 12. Customer dashboard (`account.bricksseo.com`)

Single-page React app; same origin as the API via Caddy (`/v1/*` → API) so cookies are first-party and there is no CORS surface.

| Page | Contents |
|---|---|
| **Login** | Email + password; link to Forgot password. |
| **Change password** (forced) | New password form; unlocks the rest of the app. |
| **Overview** | Greeting; one card per license (plan, status badge, renewal/expiry date, "x of y sites used"); banner for past-due ("Update payment method") and scheduled cancellation ("Ends on …"); latest plugin version + Download button. |
| **License detail** | Masked key with **Reveal / Copy**; plan & dates; timeline (issued, renewed, site activated…); **Sites table**: name, URL (link), environment, plugin/WP/PHP/Bricks version, first activated, last seen, **Deactivate** button; stale sites marked. |
| **Downloads** | Latest zip + previous versions (only while a license is active), changelog per version. |
| **Billing** | Orders list (date, plan, amount, invoice link via Paddle) and **Manage billing** → Paddle portal. |
| **Account** | Name, email (read-only; change via support in v1), change password, active sessions + "log out everywhere". |
| **Help** | Docs link, `support@bricksseo.com`, how to activate the key. |

Customer API (all under `/v1/account`, session required): `GET /me`, `PATCH /me`, `GET /licenses`, `GET /licenses/:id`, `POST /licenses/:id/reveal`, `DELETE /licenses/:id/activations/:activationId`, `GET /transactions`, `POST /billing/portal`, `GET /downloads`, `GET /downloads/:version` (302 to a signed URL; logged), `GET /sessions`, `DELETE /sessions/:id`.

UI conventions: reuse the plugin's admin visual language (near-black canvas, Instrument Serif headings, Inter body, IBM Plex Mono for license keys/URLs; tokens copied from `assets/css/admin.css`) so the product feels like one thing.

---

## 13. Admin dashboard & analytics

Same React app, routes under `/admin`, role-gated, lazy-loaded chunk so customers never download it.

### 13.1 Pages

| Page | What you do there |
|---|---|
| **Overview** | KPI cards (below), revenue chart (daily/weekly/monthly), MRR trend, new vs churned licenses, lifetime slots (`sold/cap`) with Close/Re-open sales button, "needs attention" list (failed webhooks, failed emails, unknown prices, partial refunds). |
| **Customers** | Search by email/name/Paddle id; detail with licenses, orders, sessions, flagged status. Actions: resend credentials, reset password, disable/enable, flag, anonymise (privacy request). |
| **Licenses** | Search by key hint/email/site. Actions (all audit-logged, TOTP re-prompt for destructive ones): **extend**, **revoke / reinstate**, **change plan**, **override site limit**, **reissue key**, add note, deactivate a site. |
| **Orders & revenue** | Transactions, adjustments (refunds/chargebacks), filters by plan/date/country, CSV export. |
| **Sites** | Every active activation: URL, plan, versions, last seen. Version distribution (plugin, WP, PHP, Bricks), stale list, top domains. |
| **Releases** | Upload zip + signature, edit changelog, publish / yank, per-release downloads and adoption %. |
| **Offers** | Lifetime cap, current sold count, archive/unarchive the Paddle price. |
| **System** | Webhook events (status, payload, **Replay**), email log (**Resend**), job queue health, reconcile now, audit log, settings (policy values from §6). |

### 13.2 Metric definitions (so numbers mean the same thing everywhere)

| Metric | Definition |
|---|---|
| **Gross revenue** | Σ `transactions.total_minor` (completed) converted/reported per currency; headline uses payout currency. |
| **Net revenue** | Σ `payout_earnings_minor` (after tax and Paddle fees) in payout currency. **This is what actually lands in Payoneer.** |
| **MRR** | Σ over subscriptions with status `active`/`past_due`/`trialing` of `(net payout of latest completed transaction) ÷ 12`. Lifetime is excluded and reported separately as "Lifetime revenue". |
| **ARR** | MRR × 12. |
| **Active licenses** | `effectiveLicenseStatus = active`, by plan. |
| **New customers** | Users created in period. |
| **Churn (period)** | licenses that became `expired` in period ÷ active at period start. |
| **Refund rate (30 d)** | refunded transactions ÷ completed transactions in the last 30 days. |
| **Active sites** | Distinct live activations seen within `stale_activation_days`. |
| **Version adoption** | % of active sites on latest stable. |
| **Time to first activation** | `first activation` − `license.issued_at` per license (are people actually activating?). Licenses never activated after 14 days → "at-risk" list (likely refund candidates, worth a friendly onboarding email). |

v1 computes everything with live SQL (volumes are small — hundreds to low thousands of rows); `daily_snapshots` exists only for trend lines. Add materialised views if a query ever exceeds ~200 ms.

Optional v2 funnel analytics: forward Paddle.js checkout `eventCallback` events (`checkout.loaded`, `checkout.completed`…) to a small `/v1/public/events` endpoint to see pricing-page → checkout-open → paid conversion. Out of scope for launch.

---

## 14. Email system

### 14.1 Prerequisite (not code, but it gates the whole flow)

You said email is not correctly configured on the site. Because delivery of credentials **is** product delivery, this is a Phase 0 blocker:

- **Sending domain:** authenticate `bricksseo.com` (or a subdomain such as `mail.bricksseo.com`) with the provider: **SPF**, **DKIM**, **DMARC** (start `p=none` with reporting, move to `quarantine` once clean), and a custom return-path/bounce domain.
- **From address:** `Bricks SEO <hello@bricksseo.com>` (or `no-reply@`); **Reply-To:** `support@bricksseo.com`.
- **Receiving:** `support@bricksseo.com` must be a real mailbox/forwarder (Cloudflare Email Routing, Zoho Mail free, or Google Workspace). Decide this before launch; buyers *will* reply.
- **Verify** with a real Gmail, Outlook and Yahoo inbox plus mail-tester.com; check that the welcome email does not land in spam.
- Provider choice (D5): Postmark (best transactional reputation, per-message streams) or Resend (best DX, idempotency keys). Both have APIs; neither needs SMTP. The code uses an adapter, so switching is a config change.

### 14.2 Mailer design

`mailer.send({ to, template, data, idempotencyKey })`:

1. Render the template (HTML + text) from a plain JS function; all dynamic values pass through `escapeHtml`.
2. Insert `email_log` (`queued`).
3. Call the provider adapter with the idempotency key.
4. Update `email_log` (`sent` + provider message id, or `failed` + error, which makes the **job** retry with exponential backoff, up to 8 attempts).

Dev adapter: SMTP to Mailpit (visible at `localhost:8025`). Test adapter: in-memory capture for assertions.

### 14.3 Templates

| Template | Trigger | Contents |
|---|---|---|
| `welcome` | first purchase, new user | username (email), temp password, dashboard URL, license key(s) + plan, 3-step "activate in WordPress" instructions, support contact, "your password expires in 7 days". |
| `new_license` | purchase by existing user | key(s), plan, "log in with your existing password". |
| `password_reset` | forgot password | one-time link, 1-hour expiry. |
| `password_changed` | after change/reset | security notice. |
| `license_ending` | subscription scheduled to cancel / non-renewing, T-7 days | ends-on date, how to keep it. |
| `license_expired` | became expired | what stops (updates), how to renew. |
| `license_revoked` | refund/chargeback | explanation + refund confirmation language. |
| `admin_alert` | to `ADMIN_ALERT_EMAIL` | new sale, failed webhook, unknown price, partial refund, reconcile repaired something. |

Paddle already emails receipts/invoices and (by default) payment-failure dunning, so we **do not** duplicate those.

Every email is plain, short, mobile-friendly, and has a text part. The welcome email carries the plaintext credentials exactly once; links use `APP_URL`; no tracking pixels.

---

## 15. Background jobs

Run in a separate `worker` process (same codebase and image, different entrypoint) so a slow job can never starve HTTP.

| Job | Trigger | Notes |
|---|---|---|
| `paddle.process_event` | per webhook | retry w/ backoff, 8 attempts, then `failed` + alert |
| `email.send` | enqueued by services | retry w/ backoff, provider idempotency key |
| `paddle.reconcile` | hourly + manual | §8.11 |
| `licenses.expire_sweep` | every 15 min | marks licenses whose subscription ended / `expires_at` passed (belt-and-braces for missed webhooks) |
| `activations.reclaim_stale` | nightly | §9.6 |
| `sessions.purge` | nightly | delete expired sessions/tokens |
| `snapshots.daily` | nightly 00:10 UTC | `daily_snapshots` row |
| `emails.license_ending` | daily | T-7-day notices |
| `webhook_events.prune` | weekly | payloads older than 180 days → null the payload, keep metadata |
| `health.heartbeat` | every 5 min | worker liveness ping; the uptime monitor alerts if the heartbeat goes stale (a dead worker means webhooks queue up silently) |

---

## 16. Security

### 16.1 Threat → control

| Threat | Control |
|---|---|
| Forged Paddle webhook | HMAC verification on raw body, timing-safe compare, (optional) IP allow-list. |
| Replayed/duplicate webhook | `UNIQUE(paddle_event_id)`; fulfillment idempotent on `(txn,item,unit)`. |
| License-key guessing / scraping | 100-bit keys; HMAC lookup; per-IP **and** per-key rate limits; identical responses for unknown vs malformed. |
| DB dump → free licenses | keys stored only as HMAC (lookup) + AES-GCM ciphertext (display); pepper and encryption keys live in env, not DB. |
| Credential stuffing on dashboard | argon2id, lockout, per-IP+account rate limits, generic errors, optional breach-list check. |
| Session theft / CSRF | HttpOnly Secure cookie, SameSite=Lax, Origin check, custom header, short admin sessions, `logout-all`. |
| IDOR on licenses/sites | all customer queries scoped by `user_id` in the repo layer; tests assert cross-account access returns 404. |
| Malicious update delivered to all sites | **Offline Ed25519 release signing** verified in the plugin (§10.4) + SHA-256 + HTTPS. |
| Update URL leakage | placeholder package URL; real URL minted at install time, 10-min expiry, tied to license + site. |
| Admin compromise | mandatory TOTP, re-prompt for destructive actions, audit log, optional Cloudflare Access / IP allow-list in front of `/admin`. |
| XSS | React escaping; strict CSP (no inline scripts except Paddle.js on `/pay` via nonce/allow-list); all email values escaped; release changelog rendered through a sanitiser (markdown → sanitised HTML) both server- and client-side. |
| SQL injection | Knex parameter binding only; `knex.raw` always with bindings; Zod-validated inputs. |
| SSRF | the server only calls Paddle, the email provider and R2 — fixed hosts; never fetches user-supplied URLs (site URLs are stored, not requested). |
| Secrets in logs | pino redaction (`license_key`, `password`, `token`, cookies, `authorization`); never log full webhook payloads at info level. |
| Zip upload abuse | admin-only, size cap, zip inspected in memory/temp dir, path-traversal checks (zip-slip), only one top-level folder, signature required. |
| DoS | Cloudflare in front; body size limits (webhook 1 MB, plugin API 16 KB); pagination caps; rate limits per route class. |
| Data protection | TLS everywhere, encrypted backups, least-privilege DB role for the app, no card data ever touches us (Paddle is merchant of record). |

### 16.2 Rate-limit classes (starting values, tune with real traffic)

| Route class | Limit |
|---|---|
| `/v1/plugin/license/*` | 30/min/IP **and** 20/hour/license-key-hash |
| `/v1/plugin/updates/check` | 60/hour/IP |
| `/v1/plugin/updates/download` | 10/hour/license |
| `/v1/auth/login` | 10/15 min/IP **and** 5 failures → account lock 15 min |
| `/v1/auth/forgot` | 5/hour/IP and 3/hour/email |
| `/v1/webhooks/paddle` | not rate-limited (signature-gated); body limit 1 MB |
| `/v1/public/*` | 60/min/IP, cacheable |
| authenticated dashboard | 300/min/session |

### 16.3 Privacy

The platform stores: customer name + email, site URL/name, environment, plugin/WP/PHP/Bricks versions, locale, last-seen time, and the last IP seen on activation. Purpose: license enforcement, support and product analytics. Requirements: disclose in the Privacy Policy (§21), provide **export** and **anonymise** actions (admin tool for v1), retention rules (anonymise on request; keep transaction records as legally required; prune webhook payloads at 180 days).

---

## 17. Operations: deploy, observability, backups

### 17.1 Topology (recommended default, decision D4)

```text
Cloudflare (DNS, proxy, WAF)
   │
   ├─ account.bricksseo.com ─┐
   └─ api.bricksseo.com ─────┤
                             ▼
                      VPS (Hetzner/DigitalOcean-class, 2 vCPU / 2–4 GB)
                      Docker Compose
                       ├─ caddy        (TLS, serves SPA build, proxies /v1/* and api host to api:4000)
                       ├─ api          (node apps/api/src/server.js)
                       ├─ worker       (node apps/api/src/worker.js)
                       ├─ postgres:16  (volume)
                       └─ backup       (nightly pg_dump → age-encrypt → R2/B2)
   Cloudflare R2 bucket: private release zips (presigned URLs)
   Email: Postmark / Resend API       Errors: Sentry (optional)     Uptime: Better Stack / UptimeRobot
```

Why this is enough: a license-server outage does **not** break customer sites (plugins keep last-known state) and Paddle retries webhooks for 3 days, so the realistic worst case is delayed fulfillment/updates, not data loss. Move to managed Postgres when revenue justifies it; nothing in the design depends on self-hosting the DB.

### 17.2 Deploys

Start simple: `git pull && docker compose -f compose.prod.yml up -d --build` over SSH, migrations run on API container start (`knex migrate:latest`, forward-only; destructive migrations are two-step). Add a GitHub Actions pipeline (lint → test → build images → deploy) once the first version is live. The SPA build is served from a Docker volume by Caddy; assets are content-hashed.

### 17.3 Observability

- `GET /healthz` (process up) and `GET /readyz` (DB reachable, queue reachable) → uptime monitor + alert to you.
- Structured pino JSON logs with request ids; logs rotate on the VPS.
- Admin **System** page doubles as the dashboard for webhook/email/job health; failures send `admin_alert` emails.
- Sentry (free tier) for unhandled exceptions in api, worker and web.
- Business alerts: "no sale in 14 days" is *not* an alert; "webhook failed 3×", "reconcile repaired X", "unknown price id", "partial refund", "license activated on > N sites" are.

### 17.4 Backups & recovery

- Nightly `pg_dump -Fc`, encrypted (age), shipped to R2/B2, 30 daily + 12 monthly retained. Release bucket versioning on.
- **Monthly restore drill** into a scratch DB (documented in `RUNBOOK.md`); an untested backup is not a backup.
- Recovery order if the VPS is lost: new VPS → compose up → restore DB → point DNS → run `paddle.reconcile` (it backfills anything that happened since the last backup).
- Secrets (`APP_ENCRYPTION_KEYS`, `LICENSE_KEY_PEPPER`, signing **private** key) are backed up **separately and offline** — losing the encryption key makes stored keys undisplayable; losing the pepper invalidates every lookup hash.

### 17.5 Runbook topics to write during Phase 7

Rotate Paddle webhook secret; replay a failed webhook; manually issue a license; handle a chargeback; yank a bad release; restore from backup; rotate encryption key; admin 2FA lost-device recovery; what to do if the signing key is compromised (ship a plugin update that pins a new public key — which is why the plugin should allow **two** accepted public keys).

---

## 18. Testing strategy

| Layer | Tooling | What it covers |
|---|---|---|
| Unit | Vitest | key generation/normalisation, site normalisation & classification, effective-status table, signature verification (including malformed headers & tampered bodies), temp-password formatting, money parsing, Zod schemas. |
| Integration | Vitest + `app.inject()` + **dedicated test DB** (`bricks_seo_platform_test`, truncated per test file; never the dev DB) | webhook → fulfillment end-to-end with recorded Paddle fixtures; duplicate delivery; out-of-order (`subscription.updated` before `transaction.completed`); existing-user purchase; quantity 2; unknown price; renewal; cancel; refund; chargeback; activation limits & concurrency (parallel activations never exceed the limit); stale reclaim; auth lockout; IDOR attempts; release upload validation (bad zip, wrong version, bad signature). Paddle API and mailer are stubbed. |
| Contract | Vitest | every plugin-facing response is parsed back through the Zod response schema; the same schemas are exported to the plugin test fixtures so server and plugin cannot drift. |
| E2E | Playwright (3–4 journeys) | forced password change → dashboard → deactivate a site → download; admin 2FA enrolment; release publish. |
| Plugin side | PHPUnit (existing harness) | `License` response mapping via the `pre_http_request` filter, "network failure never downgrades active", updater transient injection, signature verification with a test keypair. |
| **Sandbox rehearsal** (manual checklist, Phase 2/7) | Paddle sandbox + ngrok + Mailpit | real checkout with Paddle test cards for each plan; replay; refund; cancel; renewal simulation; lifetime cap. This is where the §8.2 open facts get settled. |

Conventions carried over from the plugin: every changed file linted (`eslint`, `node --check`), real HTTP smoke test after every change, test data created during manual QA is always cleaned up and the cleanup verified.

---

## 19. Changes required in the WordPress plugin

None of this is started; listed so the contract in §10 and the plugin land together. All follow `SPECIFICATION.md` conventions (strict types, `Loader`, escaping, §4.4 "write the file first, wire the `require_once` last").

| # | File | Change |
|---|---|---|
| 1 | `includes/class-license.php` | New request/response contract (§10.1); send site name/environment/locale/versions; statuses `active/expired/suspended/revoked/inactive/invalid`; store `plan`, `expires_at`, `sites_used`, `site_limit`, `last_ok`; **network failure keeps previous state**; **delete `DEV_TEST_KEY`, `dev_test_key()` and the hint rendered at `admin/views/settings-page.php:529`** — use a seeded dev license on a local server via `BRICKS_SEO_LICENSE_API` instead (so no skeleton key ever ships). |
| 2 | `includes/class-updater.php` **(new)** | `update_plugins_api.bricksseo.com` filter (needs the `Update URI` header), `plugins_api` for the details modal, `upgrader_pre_download` swap-and-verify, `in_plugin_update_message-*` for the "renew" message, a **Check for updates** action. |
| 3 | `bricks-seo.php` | Header `Update URI: https://api.bricksseo.com/v1/plugin/updates`; `require_once` + instantiate updater (last step of the change); schedule/unschedule the daily validation event on activation/deactivation. |
| 4 | WP-Cron | `brxseo_license_daily` → `License::scheduled_validate()`; failure-tolerant per above; clean up in `uninstall.php` (also confirm `uninstall.php` removes `brxseo_license`). |
| 5 | `admin/views/settings-page.php` (License tab) | Show plan, status badge, renewal/ends-on date, "x of y sites", **Manage in dashboard** link (`account.bricksseo.com`), Check-for-updates button. Keep the existing separate-`<form>` structure (§2.13). |
| 6 | Admin notices | A single dismissible notice on Bricks SEO screens only for `expired`/`revoked`/long-unverified. Never nag on unrelated admin pages. |
| 7 | Public key | Embed the release-signing public key(s) (allow two, for key rotation). |
| 8 | Release tooling | `bin/build-release` (zip, excludes per §10.3) and `bin/sign-release` (or in the platform repo's `scripts/`). |
| 9 | Tests | PHPUnit for items 1–2 (HTTP mocked through `pre_http_request`). |
| 10 | `SPECIFICATION.md` | Rewrite §2.13; add a new section for the updater; update §3.3/§3.5 (option shape, `BRICKS_SEO_LICENSE_API`, changed filter semantics); while there, fix the stale `class-elements-manager.php` / `element-faq.php` references in §10 point 3. |
| 11 | Version numbering | The plugin header says `0.3.1` (spec: `0.3.0`) while the marketing changelog, per the previous session, advertises `0.8.0`. WordPress never offers a *lower* version, so decide one scheme **before** the first release goes into the update system (see D8). |

---

## 20. Delivery roadmap

Sizes: **S** ≈ a focused session, **M** ≈ 2–3 sessions, **L** ≈ 4+ sessions. Phases 0 and 1 run in parallel. **Launch MVP = Phases 0–5 + 7; Phase 6 (admin/analytics) can follow launch** — until then you have the Paddle dashboard and SQL.

### Phase 0 — Prerequisites (yours; unblocks everything) — S, mostly clicking
- [ ] Email deliverability (§14.1): provider account, SPF/DKIM/DMARC, From/Reply-To, working `support@` inbox.
- [ ] DNS plan: `api.`, `account.` records; Cloudflare in front.
- [ ] Paddle **sandbox**: products + prices (§8.3), notification destination (ngrok URL for dev), API key, client token.
- [ ] Hosting account (VPS) and Cloudflare R2 bucket(s); backup bucket.
- [ ] Decisions D1–D8 (§22).
- [ ] `git init` for the plugin repo; create `bricks-seo-platform` repo.

### Phase 1 — Foundation — M
Monorepo scaffold, Zod-validated env, Docker Postgres, all Knex migrations (§7), seeds (plans, plan_prices), Fastify app factory, error handler, logging with redaction, health endpoints, pg-boss wiring, Vitest harness with the dedicated test DB, CI lint/test.
**Done when:** `npm test` green on a clean checkout; `/readyz` reports DB + queue OK; an empty webhook-style job round-trips through the queue.

### Phase 2 — Paddle → fulfillment → email (the golden path) — L
Signature verification, receiver, event storage, `process_event` job, Paddle client, fulfillment (§8.6), key generation/storage (§9), temp-password users, mailer + `welcome`/`new_license` templates, subscription/transaction/adjustment handlers + recompute functions, admin alert emails, reconcile job, fixtures from real sandbox payloads.
**Done when:** a sandbox purchase of each of the 4 plans produces, in Mailpit, the correct welcome email with a working key; replaying the same event changes nothing; a full refund revokes; out-of-order fixtures converge to the same state; §8.2 questions are answered and written into this doc.

### Phase 3 — Plugin license API + plugin changes — M
`/v1/plugin/license/*`, activation algorithm with limits and concurrency test, site classification, stale reclaim, plugin-side `License` rewrite (§19 items 1, 4–6, 9), **removal of the dev key**.
**Done when:** the dev WordPress site activates a sandbox-issued key against the local API; a 2nd site on a Solo key is refused with a helpful message; deactivate from the dashboard (or API) frees the slot; stopping the API never flips a site to inactive.

### Phase 4 — Auth + customer dashboard — M
Login/session/CSRF, forced password change, forgot/reset, customer routes (§12), React shell, overview, license detail with reveal/copy and sites table, billing portal redirect, `/pay` route, downloads page (placeholder until Phase 5).
**Done when:** the full emailed-credentials journey works in a real browser (Playwright), a customer can never see another customer's data (IDOR tests), and "Manage billing" opens a sandbox Paddle portal.

### Phase 5 — Releases + update delivery — M
R2 storage driver (+ local), release upload/validation/publish/yank, signing script, `/updates/check|download|info`, plugin `Updater` with signature verification, release build script.
**Done when:** the dev WordPress site shows an update from the platform, installs it through the normal Updates screen, rejects a tampered zip, and shows "renew to update" for an expired license.

### Phase 6 — Admin dashboard & analytics — L
Admin shell + TOTP enrolment, overview KPIs and charts, customers, licenses (+ actions with audit log), orders, sites, releases UI, offers (lifetime cap), system pages (webhooks/emails/jobs/audit), daily snapshots.
**Done when:** every metric in §13.2 matches a hand calculation on seeded data, and every admin mutation leaves an audit row.

### Phase 7 — Hardening & launch — M
Rate limits tuned, CSP/headers review, dependency audit, backup + **restore drill**, uptime/alerts, runbook, Paddle **live** configuration (§21), staging rehearsal end-to-end, backfill of any existing live sales, privacy-policy and docs updates, go-live checklist.

---

## 21. Go-live checklist

**Platform**
- [ ] `PADDLE_ENV=production`; live `plan_prices` seeded; live webhook destination + secret set; live API key (least privilege).
- [ ] Live purchase of the cheapest plan by you, then refund it — verify email, license, activation, refund-revoke.
- [ ] Backups running **and** a restore drill completed.
- [ ] Uptime monitor + alert recipients verified (send a test alert).
- [ ] Admin account created with TOTP; no default credentials anywhere; seed/dev users absent from prod.
- [ ] Secrets backed up offline (encryption keys, pepper, release-signing private key).

**Plugin**
- [ ] `License::DEV_TEST_KEY` and its UI hint **deleted** (grep the final zip for `DEV-TEST`).
- [ ] Release zip built by the script: no `vendor/`, `tests/`, `composer.*`, dev docs; `php -l` clean; version header matches.
- [ ] Release signed and uploaded; install tested from a *different* WordPress site than the dev one.
- [ ] PHP requirement shown to buyers is **8.0+** (plugin header says 8.0).

**Marketing site (you apply; I can only hand you copy)**
- [ ] Paddle.js + checkout snippet on pricing buttons (Appendix C) — fixes the dead `/pricing/` links.
- [ ] `/thank-you` page copy (§8.10).
- [ ] Docs "Requires PHP 7.4+" → "8.0+".
- [ ] Privacy Policy mentions: what the plugin sends to the license/update server (§10.1 field list), what the account system stores, retention; Terms mention license scope (sites per plan, updates/support only, what happens on expiry).
- [ ] Reconsider the full home address and personal phone on Terms/Privacy/Contact (still unanswered from the last session; your call, flagged for safety).
- [ ] Email deliverability verified from the live domain.

---

## 22. Open decisions & risks

Each decision has a **recommended default** so you can answer "go with defaults" and we proceed.

| # | Decision | Recommended default | Why it matters |
|---|---|---|---|
| **D1** | What does the plugin do when a license is expired/revoked/missing? | **Keep all features working**; gate only updates + support. | Zero risk of breaking customer sites; simplest; stronger gating is bypassable anyway. |
| **D2** | Temp password vs "set your password" link in the welcome email. | Build **temp password as you specified** (forced change, 7-day expiry, ciphertext purged after send); keep the setup-link variant ready as a one-line switch. | Plaintext passwords in email are the weakest part of the flow; the license key (not the password) protects the product, so it is acceptable, but the link is strictly safer. |
| **D3** | Do staging/dev sites count toward the limit? | **No** for `local`/`development` and well-known dev/staging hosts; capped at 10 per license. | Agencies hate burning slots on staging; abuse is bounded. |
| **D4** | Hosting. | One VPS + Docker Compose + Caddy + Cloudflare; managed Postgres later. | Cheapest operable setup; outages degrade gracefully. |
| **D5** | Email provider. | **Postmark** (deliverability) or **Resend** (DX) — pick one; adapter makes it swappable. | Credentials-by-email is only as reliable as the sender reputation. |
| **D6** | Admin on the same hostname (`account…/admin`) or its own (`admin…`). | Same app, `/admin`, mandatory TOTP, optional Cloudflare Access later. | Simplicity now; splitting later is only a Caddy rule. |
| **D7** | Lifetime cap overshoot (race). | Honour both late buyers; archive the Paddle price at the cap. | Never refund someone for our race condition. |
| **D8** | Version numbering. | Choose one scheme now (e.g. start the update stream at **1.0.0** for the first sellable release, and align the website's changelog). | The updater compares versions; mismatched numbering strands users. |
| **D9** | Refund → also cancel the subscription automatically? | **Yes** (`AUTO_CANCEL_SUBSCRIPTION_ON_REFUND=true`). | A refunded customer who stays subscribed gets re-billed next year → chargeback. |
| **D10** | Self-serve upgrades. | v1.1 via Paddle's subscription-update API; v1 manual by admin. | Proration and edge cases are real work; launch without it. |

### Risks

| Risk | Mitigation |
|---|---|
| Email lands in spam → buyer thinks they were scammed | Phase 0 deliverability work; dashboard keeps the key; "Forgot password" works; support address on thank-you page; admin **Resend** action; alert on bounces/failures. |
| Missed or reordered webhooks | idempotent + order-independent handlers; hourly reconcile; Paddle's 3-day retry; replay tool. |
| §8.2 assumptions wrong | each has a sandbox test and a defined fallback; results recorded in this doc. |
| Update server compromise | offline release signing (§10.4). |
| Solo-operator burden | boring stack, one VPS, alerts to email, runbook, restore drills. |
| Legal/tax | Paddle is merchant of record (tax, invoicing, refunds on their side); we store no card data. Terms/Privacy updates in §21. |
| Plugin bypass / piracy | accepted (non-goal); revenue model rests on updates, support, and convenience. |

---

## Appendix A — Paddle event cheat-sheet

Subscribe the notification destination to (verified event names, Paddle docs 2026-10-05):

`transaction.completed`, `transaction.payment_failed`, `transaction.paid`, `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `subscription.trialing`, `adjustment.created`, `adjustment.updated`, `customer.created`, `customer.updated`.

Fields we rely on from `transaction.completed`: `id`, `status`, `origin`, `customer_id`, `address_id`, `subscription_id`, `custom_data`, `currency_code`, `items[].price.id`, `items[].quantity`, `details.totals.{subtotal,discount,tax,total}`, `details.payout_totals.{earnings,fee,currency_code}`, `billing_period.{starts_at,ends_at}`, `billed_at`. **Parsed with `z.looseObject`** — unknown/extra fields are tolerated, missing *required-by-us* fields fail the job loudly (stored, alerted, replayable).

Paddle API calls we make (thin wrapper, Zod-parsed): `GET /customers/{id}`, `GET /addresses` (country), `GET /subscriptions/{id}`, list transactions (reconcile), `POST /customers/{id}/portal-sessions`, `POST /subscriptions/{id}/cancel`, `PATCH /prices/{id}` (archive lifetime). Base URL by `PADDLE_ENV`.

## Appendix B — Error code catalogue

`validation_failed` (400) · `unauthenticated` (401) · `invalid_credentials` (401) · `password_change_required` (403) · `forbidden` (403) · `totp_required` (403) · `account_locked` (423) · `not_found` (404) · `invalid_key` (404) · `license_expired` (403) · `license_revoked` (403) · `license_suspended` (403) · `site_limit_reached` (409) · `dev_site_limit_reached` (409) · `release_not_found` (404) · `version_not_newer` (409) · `bad_signature` (422) · `bad_package` (422) · `rate_limited` (429) · `webhook_signature_invalid` (401) · `internal_error` (500).
Error body shape is always `{ "ok": false, "error": { "code", "message", "details?" } }`; `message` is safe to show to end users, `code` is for machines.

## Appendix C — Checkout snippet for bricksseo.com

*I can't edit the live site; this is the copy-paste text for your Bricks builder (Custom Code → before `</body>`). Replace the `pri_…` placeholders with the ids from Paddle (sandbox ids while testing). Give each pricing button the class `bseo-buy` and the attribute `data-plan` set to `solo`, `studio`, `agency` or `lifetime`.*

```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
<script>
  // sandbox only: Paddle.Environment.set('sandbox');
  Paddle.Initialize({ token: 'live_xxxxxxxxxxxxxxxxxxxxxxxxxxx' }); // client-side token (safe to expose)

  var BSEO_PRICES = {
    solo:     'pri_xxxxxxxxxxxxxxxxxxxxxxxxxx',
    studio:   'pri_xxxxxxxxxxxxxxxxxxxxxxxxxx',
    agency:   'pri_xxxxxxxxxxxxxxxxxxxxxxxxxx',
    lifetime: 'pri_xxxxxxxxxxxxxxxxxxxxxxxxxx'
  };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.bseo-buy');
    if (!btn) return;
    e.preventDefault();
    var plan = btn.getAttribute('data-plan');
    if (!BSEO_PRICES[plan]) return;
    Paddle.Checkout.open({
      items: [{ priceId: BSEO_PRICES[plan], quantity: 1 }],
      customData: { plan: plan, source: 'pricing' },
      settings: { displayMode: 'overlay', successUrl: 'https://bricksseo.com/thank-you' }
    });
  });
</script>
```

Entitlement is derived on the server from the **price id**, never from `customData`.

## Appendix D — Zod schema samples

```js
// apps/api/src/config/env.js  (boot fails fast on any invalid value)
import { z } from 'zod';

export const EnvSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.url(),
  API_URL: z.url(),
  MARKETING_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgres'),
  APP_ENCRYPTION_KEYS: z.string().regex(/^v\d+:[A-Za-z0-9+/=]{43,}(,v\d+:[A-Za-z0-9+/=]{43,})*$/),
  LICENSE_KEY_PEPPER: z.string().min(32),
  PADDLE_ENV: z.enum(['sandbox', 'production']),
  PADDLE_API_KEY: z.string().min(10),
  PADDLE_WEBHOOK_SECRET: z.string().startsWith('pdl_ntfset_'),
  PADDLE_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(5).default(300),
  EMAIL_PROVIDER: z.enum(['smtp', 'postmark', 'resend']),
  EMAIL_FROM: z.string().min(3),
  ADMIN_ALERT_EMAIL: z.email(),
  STORAGE_DRIVER: z.enum(['local', 'r2']),
  RELEASE_SIGNING_PUBLIC_KEY: z.string().min(40),
}).superRefine((env, ctx) => {
  if (env.APP_ENV === 'production' && env.PADDLE_ENV !== 'production') {
    ctx.addIssue({ code: 'custom', message: 'production APP_ENV must use PADDLE_ENV=production' });
  }
});
```

```js
// packages/shared/src/plugin-contract.js  (used by the API *and* tests; mirrored by the PHP plugin)
import { z } from 'zod';

export const LicenseKey = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().regex(/^BSEO[0-9A-HJKMNP-TV-Z]{20}$/, 'invalid_key'))
  .transform((s) => `BSEO-${s.slice(4, 9)}-${s.slice(9, 14)}-${s.slice(14, 19)}-${s.slice(19, 24)}`);

export const PluginRequest = z.object({
  license_key: LicenseKey,
  site: z.object({
    url: z.url().max(255),
    name: z.string().trim().max(120).default(''),
    environment: z.enum(['production', 'staging', 'development', 'local']).default('production'),
    locale: z.string().max(16).optional(),
  }),
  client: z.object({
    plugin_version: z.string().max(32),
    wp_version: z.string().max(32).optional(),
    php_version: z.string().max(32).optional(),
    bricks_version: z.string().max(32).optional(),
  }),
});

export const LicenseSummary = z.object({
  status: z.enum(['active', 'expired', 'suspended', 'revoked', 'inactive']),
  plan: z.enum(['solo', 'studio', 'agency', 'lifetime']),
  plan_name: z.string(),
  expires_at: z.iso.datetime().nullable(),
  renews: z.boolean(),
  ends_on: z.iso.datetime().nullable(),
  site_limit: z.number().int().nullable(), // null = unlimited
  sites_used: z.number().int(),
});
```

```js
// apps/api/src/modules/paddle/events.schemas.js  — loose: tolerate fields Paddle adds later
export const PaddleEnvelope = z.looseObject({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.iso.datetime({ offset: true }),
  notification_id: z.string().optional(),
  data: z.looseObject({}),
});

export const TransactionCompleted = z.looseObject({
  id: z.string().startsWith('txn_'),
  customer_id: z.string().startsWith('ctm_'),
  subscription_id: z.string().nullish(),
  custom_data: z.record(z.string(), z.unknown()).nullish(),
  currency_code: z.string().length(3),
  items: z.array(z.looseObject({
    price: z.looseObject({ id: z.string().startsWith('pri_') }),
    quantity: z.number().int().min(1),
  })).min(1),
  billing_period: z.looseObject({ ends_at: z.iso.datetime({ offset: true }) }).nullish(),
  details: z.looseObject({
    totals: z.looseObject({ total: z.string() }),
    payout_totals: z.looseObject({ earnings: z.string(), fee: z.string(), currency_code: z.string() }).nullish(),
  }),
});
```
