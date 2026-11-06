# Whitelisted API v1

For businesses that create orders from their own website, POS or app. Version 1 is frozen once live; breaking changes go to v2.

## Access

1. Your business must be **verified**.
2. Ask support for API access; Super Admin whitelists your business and sets your rate limit (default 100/min, 10,000/day).
3. In the Business portal → Settings & API, create a **TEST** key (sandbox) and later a **LIVE** key. The secret is shown once.

Every request sends:

```
X-API-Key: tw_live_xxxxxxxx
X-API-Secret: qds_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Base URL: `https://<your-api-host>/api/v1`. HTTPS only in production. Keys can be revoked instantly.

Money is in **paise** (₹35 = `3500`). Weight in grams.

## Create an order

`POST /v1/orders`

```json
{
  "businessReferenceId": "WOO-1001",
  "pickupAddressId": "optional, defaults to your default pickup",
  "customerName": "Asha",
  "customerPhone": "9123456789",
  "dropAddress": "22 Lake View, Vijay Nagar",
  "dropLandmark": "Near temple",
  "dropPincode": "452010",
  "dropLat": 22.74,
  "dropLng": 75.88,
  "parcelDescription": "Cake box",
  "weightGrams": 1500,
  "declaredValue": 80000,
  "isFragile": false,
  "specialInstructions": "Call on arrival",
  "markReady": true
}
```

- **Idempotent** on `businessReferenceId`: sending the same request twice returns the same order (`idempotentReplay: true`) and never charges twice.
- `markReady: true` means the parcel is packed and sealed; we start looking for a rider immediately. Otherwise call `POST /v1/orders/{id}/ready` later.
- Response includes `id`, `code`, `status`, `fees`, `trackingUrl` and `otp.status` (`SENT`/`NOT_SENT`). The OTP value is never returned.

## Other endpoints

| Method | Path | |
|---|---|---|
| GET | `/v1/quote` | Current fees and whether your wallet can cover an order |
| GET | `/v1/wallet` | Balance, held, available |
| GET | `/v1/orders/{id or code}` | Status, timeline, rider first name + masked phone, live location while with rider |
| GET | `/v1/orders?reference=WOO-1001` | Look up by your reference |
| POST | `/v1/orders/{id}/ready` | Mark packed & sealed |
| POST | `/v1/orders/{id}/retry-assignment` | After `NO_RIDER` (one retry) |
| POST | `/v1/orders/{id}/cancel` | Before a rider is assigned, no charge |
| GET | `/v1/statuses` | Status list and allowed transitions |
| POST | `/v1/sandbox/orders/{id}/advance` | TEST keys only: move a test order one step (`{"outcome":"undelivered"}` to test returns) |

## Statuses

`CREATED, READY, ASSIGNING, NO_RIDER, ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, UNDELIVERED, RETURNING, RETURNED, CANCELLED`

## Charges

- Creating an order needs ₹60 available (₹35 delivery + ₹25 possible return).
- ₹60 is held when a rider accepts. ₹35 is charged when the rider picks up.
- Delivered: the remaining ₹25 is released. Returned: the held ₹25 becomes the return charge (₹60 total). The wallet never goes negative.
- Nothing for creating, marking Ready, "no rider available", or cancelling before assignment.

## Webhooks

Set an HTTPS URL in Settings. Each status change POSTs:

```json
{ "event": "order.delivered", "status": "DELIVERED", "statusLabel": "Delivered", "occurredAt": "…", "order": { …same shape as GET /v1/orders/{id}… } }
```

Headers: `X-TW-Event`, `X-TW-Delivery` (unique id), `X-TW-Timestamp` (unix seconds), `X-TW-Signature`.

Verify: `hex(HMAC_SHA256(webhookSecret, X-TW-Timestamp + "." + rawBody)) == X-TW-Signature`, and reject timestamps older than 5 minutes.

Respond 2xx within 10 s. Failed deliveries retry after 30 s, 2 min and 10 min, then wait for manual retry by our support.

## Errors

```json
{ "error": { "code": "INSUFFICIENT_WALLET", "message": "Recharge ₹60 to create this order", "nextAction": "RECHARGE", "details": { … } } }
```

Common codes: `INSUFFICIENT_WALLET` (402), `OUTSIDE_SERVICE_AREA`, `OVERWEIGHT`, `OVERSIZE`, `INVALID_PHONE`, `VALIDATION_ERROR` (422), `BUSINESS_NOT_VERIFIED`, `API_NOT_WHITELISTED` (403), `API_KEY_INVALID` (401), `RATE_LIMITED` (429), `INVALID_STATE_TRANSITION`, `CITY_PAUSED` (409).
