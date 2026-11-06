# Tweniee

Intracity, bike-only quick delivery for verified local businesses — Shiprocket-style mechanics (verification, prepaid wallet, passbook, RTO charge, status-driven work) for a single city.

The product source of truth is [`docs/masterplan.md`](docs/masterplan.md). Every rule below traces back to it.

## What's in this repo

```
apps/
  backend/   NestJS + Prisma + PostgreSQL — the API, state machine, wallet ledger, dispatch, jobs
  web/       Next.js — Admin console, Business portal, customer tracking page, driver onboarding form
  mobile/    Flutter — Driver (rider) app and Business app (one project, two entry points)
docs/
  masterplan.md       product decisions (founder interview, 5 Nov 2026)
  api.md              whitelisted API v1 guide for integrating businesses
  architecture.md     how the system is built and why
  open-questions.md   decisions still needed from the founder / legal / finance
```

The five surfaces from the masterplan map to:

| Surface | Where |
|---|---|
| Driver App | `apps/mobile/lib/main_driver.dart` |
| Business App | `apps/mobile/lib/main_business.dart` and `apps/web` → `/business` |
| Whitelisted API | `apps/backend` → `/api/v1/*` ([guide](docs/api.md)) |
| Admin / Management web | `apps/web` → `/admin` |
| Customer tracking (link only) | `apps/web` → `/track/<token>` |
| Driver onboarding (one-time link) | `apps/web` → `/onboard/<token>` |

## Run it locally

Requirements: Node 22, pnpm 10, PostgreSQL 16 (or Docker), Flutter 3.x for the mobile apps.

```bash
docker compose up -d                 # Postgres on :5432 (user/pass/db: qd/qd/quickdelivery)
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @qd/backend prisma migrate deploy
pnpm db:seed                         # pilot city, ₹35/₹25 pricing, demo users
pnpm dev:backend                     # http://localhost:4000/api
pnpm dev:web                         # http://localhost:3000
```

Demo logins created by the seed (password `ChangeMe@123`; change before any real use):

| Who | Login |
|---|---|
| Super Admin | `admin@tweniee.local` (also `support@…`, `staff@…` with narrower roles) |
| Business (verified, ₹1,000 wallet, API enabled) | `9876500001` |
| Rider (approved) | `9876511111` — phone + OTP; in development the OTP is returned in the API response |

Mobile apps:

```bash
cd apps/mobile && flutter pub get
flutter run -t lib/main_driver.dart   --dart-define=API_URL=http://10.0.2.2:4000
flutter run -t lib/main_business.dart --dart-define=API_URL=http://10.0.2.2:4000
```

### Try the whole flow in five minutes

1. Business portal → New order → paste `22.74, 75.88` as the pin → **Create & mark Ready**. With no rider online it goes to **No Rider** (no charge) — that's the honest message from the masterplan.
2. Driver app (or `POST /api/driver/availability {online:true, lat, lng}`) → go online near the pickup → Business retries → rider gets the offer with a 30 s countdown → Accept. Wallet shows ₹60 **held** (₹35 delivery + ₹25 possible return).
3. Rider: Pickup → ₹35 **charged**, ₹25 still held. Arrived → the customer's OTP is on the tracking link (`/track/<token>`) → enter it → **Delivered**, the ₹25 is released, rider earns ₹28.
4. Or: call the customer twice from the app, wait 15 minutes, mark **Could not deliver** → the held ₹25 becomes the return charge (₹60 total) → business sees a return code → rider enters it → **Returned**, rider earns ₹48.
5. Admin → Orders → open the order: timeline, wallet entries, GPS, calls, OTP attempts and offers on one screen.

## Tests

```bash
# backend: needs a Postgres database for tests (default postgresql://qd:qd@localhost:5432/quickdelivery_test)
DATABASE_URL=postgresql://qd:qd@localhost:5432/quickdelivery_test pnpm --filter @qd/backend prisma migrate deploy
pnpm test
cd apps/mobile && flutter analyze && flutter test
```

The backend suite (20 end-to-end tests) covers the three things the masterplan says must be right on day one:
the **order state machine**, the **wallet ledger**, and the **assignment offer** — plus OTP lockout, idempotent API creation under concurrency,
signed webhooks, the sandbox, onboarding-link rules, document expiry auto-pause, inactive-rider check-in, rider goodwill and weekly payouts. CI runs all of it (`.github/workflows/ci.yml`).

## The five rules, and where they're enforced

| Rule | Enforcement |
|---|---|
| Business only, verified only | `BusinessesService.signup` + admin review; orders, recharge and API all check `status = APPROVED` |
| Prepaid wallet only | `WalletService` — create blocked below ₹60 available; ₹60 held at accept, ₹35 charged at pickup, ₹25 released on delivery or charged on return (never negative); append-only ledger with row locks and idempotency keys |
| OTP or no delivery | `AssignmentService.deliver` — encrypted 4-digit OTP, never in business/API/admin responses, 3 wrong → locked |
| One order per rider | unique `Driver.currentOrderId` + conditional claim on accept; busy riders never get offers |
| No time promise | no ETA anywhere; copy says "usually 30–70 minutes, not a promise" |

## Production checklist (not done here)

These need accounts, keys or legal input, so they are stubbed behind interfaces:

- **SMS / WhatsApp**: `apps/backend/src/notifications/notifications.service.ts` logs to console. Plug in MSG91 / Gupshup / WhatsApp Cloud API.
- **Payments**: `PAYMENT_PROVIDER=razorpay` path is written (order create + signature-verified webhook) but untested without keys; `mock` is used in dev.
- **Maps / geocoding**: businesses set a pin by pasting a Google Maps link or using GPS. Add Google Maps / MapMyIndia autocomplete when keys exist.
- **Document storage**: local disk with signed, expiring URLs. Swap for S3 (Mumbai) presigned URLs.
- **Aadhaar / GSTIN OTP (Express KYC)**: manual document review only for now.
- **Redis**: rate limits and background loops are in-process (fine for one API instance). Move to Redis/BullMQ before running more than one.
- Two Android application ids (product flavors) before Play Store release — see `apps/mobile/README.md`.

See [`docs/open-questions.md`](docs/open-questions.md) for the decisions still needed.
