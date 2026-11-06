# Open questions for the founder

These are the masterplan's **[TO CONFIRM]** items and a few decisions the build surfaced. For each one the code currently does the **default** shown, and the place to change it is listed.

## Money

1. **Driver share: does the driver get 80%?** Founder's words were "I will get 80%". Built as *driver 80%, platform 20%* (₹28/₹7 per delivery, ₹20/₹5 per return). It's a per-city Super Admin setting (`PricingConfig.driverSharePct`), snapshotted on each order.
2. **When is ₹35 taken?** Built per assumption A1: **held** when a rider accepts, **charged** at pickup, released if cancelled before pickup. "No rider" costs nothing.
3. **Return charge when the wallet is empty.** The ₹25 return is charged even if it takes the balance below zero (the parcel already travelled). New orders are then blocked until recharge. Alternative: hold ₹60 at accept and release ₹25 on delivery. Tell us which you prefer.
4. **Driver payouts** — built as weekly (Monday–Sunday), statement + bank file export, marked paid with the UTR. Instant payouts are not built.
5. **Minimum recharge** defaults to ₹500, maximum ₹50,000 (Super Admin setting per city).
6. **Rider goodwill fee when support cancels after the rider accepted** — not automated (masterplan says not V1).

## Liability & legal

7. **₹5,000 cap** read as *lower of declared value or ₹5,000*. Businesses see a warning when value > ₹5,000. Legal wording of terms, driver agreement and DPDP consent still needs a lawyer.
8. **Gig worker status, insurance, accident cover** — nothing in the product assumes employment.
9. **GST on platform fee / invoices** — no invoice generation yet; needs finance advice on what to invoice (full fee vs platform share).

## Product

10. **Launch city.** The seed uses a sample centre (Indore) only so the app runs; change it in Admin → Cities. Everything is city-agnostic.
11. **Business signup OTP.** Signup does not yet verify the mobile/email by OTP; verification is the manual staff review. Add OTP when the SMS provider is chosen.
12. **Express KYC (Aadhaar / GSTIN OTP)** — needs a KYC provider (e.g. Signzy, IDfy, Karza). Manual review only for now.
13. **Return confirmation.** Built as a 4-digit **return code shown to the business**, which the rider enters (or the business taps "I received it"). OK?
14. **Wait rule.** Built as 15 minutes and at least 2 logged calls before "Customer not reachable", "Wrong address" or "Could not find location". "Customer refused", "OTP not provided" and "Customer asked to return" need no wait.
15. **Assignment retries.** Business gets 1 manual retry after "No rider"; support can retry more. Unassigned Ready orders auto-cancel at day end.
16. **Inactive riders (30 days without a delivery)** — not enforced yet; tell us if they should be forced to check in.
17. **App identities.** One Flutter project, two apps. Need final app names, icons, and Play Store package names.

## Vendors to pick (Phase 0)

- SMS + WhatsApp provider (OTP and tracking messages, DLT templates)
- Payment gateway: Razorpay is wired; Cashfree would need a small adapter
- Maps: Google Maps vs MapMyIndia
- Hosting: AWS or GCP Mumbai; managed Postgres; S3/GCS for documents
