# Founder decisions and what is still open

Abhishek answered the 17 build questions on 6 Nov 2026. This page records each answer and where it lives in the code.

## Money
1. **Driver share: decided.** Driver 80%, platform 20%: ₹28 of ₹35 and ₹20 of ₹25. Set per city (`PricingConfig.driverSharePct`) and snapshotted on each order.
2. **₹35 timing: decided.** Held when a rider accepts, charged at pickup, released if cancelled before pickup. "No rider" costs nothing.
3. **Return charge: changed.** ₹60 (₹35 + ₹25) is held when a rider accepts, and an order needs ₹60 available. At pickup ₹35 is charged and ₹25 stays held. On delivery the ₹25 is released; if undelivered it becomes the return charge. The wallet never goes negative (`WalletService`).
4. **Driver payouts: decided.** Weekly, Monday to Sunday, with a statement and bank file, marked paid with the UTR. No instant payouts in V1.
5. **Recharge limits: decided.** ₹500 minimum and ₹50,000 maximum, set per city.
6. **Goodwill fee: decided.** It stays manual. On a cancelled order that a rider had accepted, support can credit the rider ₹10 if they had already left for pickup (Admin → Order → "Rider goodwill ₹10"). It needs a reason, is allowed once per order, is audited, and is paid in the weekly payout.

## Liability & legal
7. **₹5,000 cap: decided.** Liability is the lower of the declared value or ₹5,000, and a warning shows when the value is above ₹5,000. The terms, driver agreement and DPDP consent still need a lawyer.
8. **Gig worker status: decided.** Riders are partners only, and nothing in the product assumes employment.
9. **GST and invoices: open.** This needs finance advice before invoices are generated. It does not block the pilot wallet.

## Product
10. **Launch city: open.** Indore is only the sample seed so the app runs. Change it in Admin → Cities once the real city is picked.
11. **Business signup OTP: built, waiting on the SMS provider.** Signup now asks for a phone code and an email code (`POST /business/verify-contact`). Until an SMS/email provider is picked, codes go through the stub provider and are shown on screen in development. Manual staff review is still the gate, and no unverified business can create orders.
12. **Express KYC: decided.** Manual review only for now. Signzy, IDfy or Karza can be added later.
13. **Return confirmation: decided.** A 4-digit return code is shown to the business. The rider enters it, or the business taps "I received it".
14. **Wait rule: decided.** "Customer not reachable", "Wrong address" and "Could not find location" need a 15-minute wait and at least 2 logged calls. "Customer refused", "OTP not provided" and "Customer asked to return" need no wait.
15. **Assignment retries: decided.** The business gets 1 manual retry after "No rider", support can retry more, and unassigned Ready orders auto-cancel at day end.
16. **Inactive riders: built.** After 30 days with no delivery since approval or the last check-in, a rider is paused when they try to go online, and a 6-hourly job pauses offline riders too. Either way a support ticket opens. Support calls the rider, re-checks DL, RC and bank details, then presses Reactivate, which counts as the check-in (`drivers.service.ts` `isInactive`, `JobsService.inactiveRiders`).
17. **App names: from the Tweniee design.** The apps are called **Tweniee Business** and **Tweniee Partner** (driver). The final names, icons and Play Store package names are still needed from the founder.

## Vendors to pick (Phase 0)

- SMS + WhatsApp provider (OTP and tracking messages, DLT templates)
- Payment gateway: Razorpay is wired; Cashfree would need a small adapter
- Maps: Google Maps vs MapMyIndia
- Hosting: AWS or GCP Mumbai; managed Postgres; S3/GCS for documents
