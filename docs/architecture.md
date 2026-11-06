# Architecture

Boring, proven, one database of record (masterplan §10).

```
 Flutter Driver app ─┐                       ┌─ PostgreSQL (orders, wallet ledger, users, audit)
 Flutter Business app┤   HTTPS /api          │
 Next.js web ────────┼──▶ NestJS backend ────┼─ local disk / S3 (private documents, signed URLs)
 Business systems ───┘   (+ Socket.IO /ws)   └─ SMS / WhatsApp / payment gateway (adapters)
       ▲                        │
       └──── signed webhooks ◀──┘ (retry 3x with backoff, then manual retry in Admin)
```

## Backend modules (`apps/backend/src`)

| Module | Responsibility |
|---|---|
| `orders/order-state.service.ts` | **The only place an order's status changes.** Validates the transition table, applies an optimistic status check (no lost updates), writes a timeline entry with actor, time, GPS, reason. |
| `orders/order-status.ts` | Transition table, Appendix A status words, undelivered/cancel reasons. |
| `wallet/wallet.service.ts` | Append-only ledger. Each write locks the business row (`SELECT … FOR UPDATE`) and carries an idempotency key. HOLD → FORWARD_CHARGE / RELEASE, RETURN_CHARGE, RECHARGE, admin CREDIT/REFUND/DEBIT_ADJUSTMENT. |
| `assignment/assignment.service.ts` | Nearest-rider offers (30 s each, max 5 riders / 3 min), accept/decline/expire, and the live job: pickup, arrived, calls, OTP delivery, undelivered, return. Driver earnings are unique per (order, leg). |
| `orders/order-events.service.ts` | After commit: webhooks, Socket.IO pushes, business notifications, customer OTP + tracking SMS/WhatsApp. |
| `drivers/onboarding.service.ts` | One-time 48 h links (hashed token, single use, replaced by newer link, tied to phone), automatic checks, duplicate checks. |
| `public-api/*` | API key + secret auth, whitelisting, per-business rate limits, idempotent create, sandbox advance for TEST keys. |
| `admin/*` | Dashboard metrics, one-box search, one-screen order evidence, verification queues, payouts, audit log. |
| `jobs/jobs.service.ts` | In-process loops: offer expiry (5 s), webhook delivery (10 s), day-end auto-cancel, DL/RC expiry alerts + auto-pause, onboarding reminders. |

## Money

All amounts are integer **paise**. Fees and driver share are snapshotted on the order at creation, so price changes never touch existing orders.

| Event | Business ledger | Driver earning |
|---|---|---|
| Order create / Ready | requires available ≥ ₹60 (₹35 delivery + ₹25 possible return) | — |
| Rider accepts | HOLD ₹60 | — |
| Pickup | FORWARD_CHARGE ₹35 (₹25 stays held) | — |
| Delivered (OTP ok) | RELEASE ₹25 | DELIVERY ₹28 |
| Undelivered | RETURN_CHARGE ₹25 (from the held ₹25, so the wallet never goes negative) | — |
| Returned | — | DELIVERY ₹28 + RETURN ₹20 |
| Cancel before pickup | RELEASE ₹60 | support may add GOODWILL ₹10 manually (once per order, with a reason) |
| No rider / cancel before assign | nothing | — |

## Security & privacy

- Delivery OTP stored AES-256-GCM encrypted; returned only on the customer tracking page; masked in notification logs; never in business, API, or admin responses.
- Bank account encrypted; Aadhaar stored only as a hash (duplicate check) and last 4 digits.
- Documents private; admins get 5-minute signed URLs and every view is logged.
- Every admin action is in the audit log with actor, old/new value and reason. Ledger is never edited.
- Rider location accepted only while online or on a job.

## Scaling notes

Pilot target (500 orders/day) runs on one API instance + one Postgres. Before a second instance: move rate limits and job loops to Redis/BullMQ, Socket.IO to the Redis adapter, and pick a leader for the job loops.
