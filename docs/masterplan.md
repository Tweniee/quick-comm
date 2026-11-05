# Quick Delivery System — Masterplan

**Project:** City intracity quick-delivery platform for local businesses, bike riders only
**Model:** Shiprocket-style, for intracity. Not intercity courier, not food delivery, not a marketplace.
**Date:** 5 November 2026
**Status:** Locked decisions from founder interview, 5 Nov 2026. Open items are marked **[TO CONFIRM]** and must not be treated as decided.
**Author voice:** This file is written as two voices working together.
- **CTO voice:** what to build, why, what not to build, what order, what risk to accept.
- **Software Engineer voice:** how it should work conceptually, what the system must handle, what breaks if we get it wrong. No code in this file.

**How to read this file:** Part A is the one-page truth. If you read nothing else, read Part A and the Locked Decisions table in Section 1. Parts B to F are the full blueprint. Appendices are checklists a builder can work from without re-deciding the product.

---

## PART A — THE ONE-PAGE TRUTH

### What it is, in one paragraph

A local business, a restaurant, a clothing shop, a pharmacy, a bakery, any shop, takes an order on its own website, on its own app, or by phone. It packs the parcel and marks it Ready in our Business App or through our API. We assign the nearest available bike rider. The rider picks it up, rides it across the city, and hands it to the customer only after the customer shares the delivery OTP. The customer tracks it on a web link. If the customer cannot be reached, we bring the parcel back to the business. That is the whole product.

### What it is not

- Not a customer marketplace. Customers do not browse shops or place orders with us. The business owns the customer, the menu, the price, the order.
- Not Zomato, Swiggy, or Instamart. We do not sell food or groceries. We sell the delivery leg to businesses that already sell.
- Not intercity courier. No outstation, no warehousing, no multi-day shipping.
- Not auto, taxi, or truck. Bike only, at launch.
- Not COD. Prepaid only, at launch.
- Not a time-promise service. We do not promise 30 minutes. We move as fast as the city allows.

### The Shiprocket analogy, correctly used

Shiprocket is the reference model, but only for the *business mechanics*, not for the geography.

What we copy from Shiprocket:
1. Business signs up, submits details, gets verified before it can ship. No anonymous shipping.
2. Prepaid wallet. Business recharges, we deduct per shipment from the wallet at processing, exactly as Shiprocket deducts freight from the wallet when an order is processed.
3. Forward charge plus a separate RTO, return to origin, charge when a parcel cannot be delivered and comes back.
4. A passbook, every debit and credit visible, with a reason.
5. Status-driven work. An order is a state machine, not a chat message.

What we deliberately do *not* copy:
1. Shiprocket is intercity, multi-courier, multi-day, weight and zone priced. We are intracity, one fleet type, same-day, one configurable price at launch.
2. Shiprocket re-attempts delivery up to 3 times over days and uses NDR, non-delivery report, workflows. We do one live attempt, a short wait, and a return the same trip.
3. Shiprocket has COD, COD remittance, COD KYC and bank penny-drop. We have no COD at launch, so we do not build COD remittance at all.

If a future builder proposes a feature by saying "Shiprocket has it", the CTO test is: does it fit intracity, bike-only, OTP, prepaid, no-promise delivery? If not, it is out of scope for V1.

### The five rules that decide almost everything

1. **Business only, verified only.** No individual can sign up and send a parcel. Verification is a gate, not a formality.
2. **Prepaid wallet only.** No wallet balance, no rider assignment. No credit, no postpaid, no COD.
3. **OTP or no delivery.** No OTP, no handover. No exception for "the customer is my regular" or "the rider knows them".
4. **One order per rider.** A rider never carries two live orders at once at launch. Simplicity beats batching efficiency until density proves otherwise.
5. **No time promise.** We show live status and location, we never show a countdown promise we cannot keep.

Every later section is an expansion of these five rules.

---

## 1. LOCKED DECISIONS — FROM THE FOUNDER, 5 NOVEMBER 2026

These are not recommendations. These are the founder's decisions, recorded verbatim in cleaned form. Where the founder's spoken answer was garbled, the interpretation is marked and must be confirmed before build.

| # | Area | Locked decision |
|---|---|---|
| 1 | Launch city | Not decided. City-agnostic design. Launch city is a later business choice, not a product constraint. |
| 2 | Service area | Intracity only. 40 to 45 km diameter. If a pickup or drop is outside that circle, the order cannot be created. |
| 3 | Delivery promise | None. No 30-minute, 45-minute, or 60-minute promise. Natural time inside 40-45 km is 30 to 70 minutes depending on distance and traffic, and that is stated as an observed range, never as a promise. |
| 4 | Vehicle | Bike riders only. No auto, no taxi, no truck, no three-wheeler at launch. |
| 5 | Supply | Onboard gig workers already working with Zomato, Swiggy, Instamart. They are the first recruiting pool. They are not employees in this plan, they are onboarded delivery partners. Employment status, contracts, and insurance need separate legal advice before launch. |
| 6 | Demand | Any local business. Restaurants, clothing brands, pharmacies, bakeries, electronics, gifts, any legitimate business that has been verified. |
| 7 | Business channels | Two ways to create an order. (a) Business App, manual creation. (b) Whitelisted API. API is the priority. No SDK at launch. |
| 8 | Customer order origin | Customer may order on the business's own site, or by phone call to the business. Both are fine. In both cases the business creates the delivery order with us. We do not take the customer order. |
| 9 | Customer tracking | Web tracking link, sent to the customer. No customer app, no customer login required to track. |
| 10 | Order flow | Shiprocket mechanism, adapted: order placed with business, business packs, business marks Ready for delivery, then we assign a rider. Assignment happens only after Ready, never before. |
| 11 | No rider available | If no rider can be assigned, that is our failure. We show "no rider available at this moment". We do not fake an assignment, we do not queue silently, and we do not charge. The order stays Ready and the business can retry or cancel. |
| 12 | Pricing basis | Not flat by weight and distance at launch. Price is configurable by Super Admin. Starting values: ₹35 delivery, ₹25 return. |
| 13 | Undelivered charge | If undelivered, total deducted is ₹60. That is ₹35 forward plus ₹25 return. The return leg is charged even though the parcel did not reach the customer. |
| 14 | Business fees | No monthly fee. No signup fee decided. Signup is required, verification is required, then use is pay per delivery from the wallet. |
| 15 | Payment | No COD. Prepaid wallet only. Business recharges the wallet, we deduct per order. |
| 16 | Driver share | Driver gets 80% of what we make, platform keeps 20%. **[TO CONFIRM — founder's wording was "I will get 80%", read here as driver gets 80%.]** On ₹35, that is ₹28 to driver, ₹7 to platform. On ₹25 return, ₹20 to driver, ₹5 to platform. On ₹60 undelivered, ₹48 to driver, ₹12 to platform. |
| 17 | Assignment | Auto-assign the nearest driver, driver manually accepts. Auto-assign is a proposal, not a forced dispatch. If the proposed driver declines or times out, assign the next nearest. |
| 18 | Driver documents | Driving Licence, Vehicle RC, Aadhaar, Bank details. All mandatory. Expiry must be checked. DL expiry and RC validity are blocking. |
| 19 | Driver activation | Account is NOT immediately active. Staff starts onboarding, sends a one-time link, driver uploads documents and details, support verifies, support approves, only then active. |
| 20 | Driver onboarding link | One-time use link, expires in 24 to 48 hours. After expiry, staff must send a fresh link. The link must not be reusable after submission. |
| 21 | OTP delivery | Delivery is always OTP-based. No OTP, no delivery. OTP is sent to the customer phone given by the business. |
| 22 | Wait and calls | Driver waits 10 to 15 minutes at the location, makes 2 to 3 calls, up to 4 attempts in total in the founder's words. This plan standardises it as: 15 minutes maximum, 3 call attempts, then mark undelivered. See Section 6 for the exact timer. |
| 23 | Orders per rider | One order per rider at a time. No batching, no stacking at launch. |
| 24 | Banned items | No separate banned-items list at launch. Business verification before onboarding is the control. Illegal items remain illegal regardless, see Section 8. |
| 25 | Loss and damage | Platform is not liable if a parcel is lost or damaged, provided the business packed it and handed it over sealed. Business is responsible for packing. Liability cap: ₹5,000. **[TO CONFIRM — founder said "cap of ₹5,000", read as lower of order value or ₹5,000, mirroring Shiprocket's lost-shipment SOP. Legal wording must be drafted before launch.]** |
| 26 | Surfaces | Four surfaces at launch: (1) Driver App, (2) Business App, (3) Whitelisted API, (4) Admin / Management Web App for staff, support, and Super Admin. Plus (5) Customer tracking web page, link only, no app. |

### Assumptions the CTO is making, to be confirmed

- **A1. Wallet deduction timing:** ₹35 is deducted, or held, at assignment, not at order creation, so a "no rider available" order costs nothing. The ₹25 return is deducted only when the return leg starts. If this is wrong, the wallet ledger in Section 7 must change.
- **A2. Driver payout timing:** Driver earnings accrue per completed leg and are settled on a weekly cycle to the verified bank account, not instantly per order. Instant payout is a future feature, not V1.
- **A3. OTP generation:** OTP is generated at assignment or at pickup, and sent to the customer by SMS and WhatsApp, with the tracking link in the same message. The OTP is 4 digits, expires when the order closes, and is never shown to the business or the driver in advance.
- **A4. Parcel cap:** 20 kg maximum, and must fit a standard bike delivery box. See Section 8 for dimensions. The founder said "as per the size of the bike". This plan sets 20 kg as the starting cap because Indian bike courier services cap bike parcels at up to 20 kg within size limit, and the WRI India paper lists two-wheelers at 30 kg maximum allowable cargo weight. 20 kg is the safe, rideable, insurable starting point. 30 kg is not a starting point for a normal bike without a cargo box.
- **A5. Business verification documents:** At minimum, business name, owner name, phone, pickup address, GSTIN if registered, or shop licence / Udyam / trade licence if unregistered, plus website, Instagram, or Google Business Profile link to prove legitimacy. See Section 5.
- **A6. No rider available is not an RTO.** It is a failed assignment, no charge, no return leg, because the parcel never left the business.

### What the founder asked for, in his own structure

He asked for two agents: one CTO, one Software Engineer, answering the questions together, and a masterplan.md that is in depth, 10 pages or 50 or 100 or 200, length is not an issue. This file honours that by giving, for every major decision, both a CTO answer, why this choice, what it costs, what it avoids, and an Engineer answer, what the system must do to make that choice real, what can break, what must be logged.

No code is in this file. That was the original interview rule, and it still holds.

---

## 2. WHY THIS CAN WORK, AND WHY IT CAN FAIL

### CTO — The opportunity

**CTO:** Local businesses in a Tier 2 / Tier 3 Indian city already take orders by phone, WhatsApp, Instagram, and their own websites. They do not have delivery. Zomato and Swiggy solve delivery only if you are a restaurant on their marketplace, and you pay their commission and lose the customer. Instamart solves it only for groceries they sell.

The gap is the *independent delivery leg*. A clothing shop in the city gets a phone order for a kurta. It has no rider. It either says no, or asks a staff member to go, or uses a random local courier who may or may not come. That is the customer.

The supply insight is also sound. Zomato, Swiggy, and Instamart riders already know the city, already have a bike, a phone, and a habit of accepting jobs. They work in gaps, between lunch and dinner, on days they are not on a shift. If you can give them a second income stream without asking them to quit their first platform, you do not need to build a fleet from zero. You need to recruit, verify, and retain.

The Shiprocket insight is sound for the same reason. Shiprocket did not own trucks. It owned trust, verification, wallet, and status. You are doing the same, at city scale, on bikes.

### Engineer — Why the model is technically simpler than it looks, and harder than it looks

**Engineer:** Simpler, because there is no catalogue, no cart, no payment from the customer, no marketplace search, no restaurant menu sync. The order is created by the business, with five facts: who picks up, who receives, what is it, how heavy, what phone. Everything else is status and location.

Harder, because the hard parts are not screens. They are:
- Assignment in real time, nearest rider, who is actually online, moving, and willing, not just "online" in a database.
- Money that must never be wrong. Wallet deduction, driver 80%, return charge, failed assignment with no charge. One rounding or double-deduction bug destroys trust faster than any late delivery.
- Proof. OTP, photo, GPS, timestamps. Without proof, every dispute becomes "he said, she said" and support drowns.
- Verification that cannot be gamed. A fake business, a fake driver, a fake delivery, all three are fraud vectors on day one.

### The three failure modes to design against from day one

1. **No riders at 7 pm.** Demand peaks, supply does not. The business marks Ready, no rider accepts, the customer waits, the business blames you. Mitigation is not an app feature, it is supply planning, incentives, and honest "no rider available" messaging. See Section 11.
2. **Wallet disputes.** "You deducted ₹60, the customer was home." Without OTP logs, GPS, call logs, and a photo of the return, you cannot resolve it. Mitigation is evidence on every order, Section 10.
3. **A bad actor.** A business ships something illegal, a driver takes a parcel and disappears, a customer claims non-delivery after OTP. Mitigation is verification, OTP, caps, and a kill switch, Section 13.

### Success, in numbers, for the pilot

Do not launch without these targets written down, even though the city is not chosen yet. The CTO recommends these as pilot targets, to be reset once the city is chosen:

- 30 verified businesses live in week 4, 100 by week 12.
- 20 active riders in week 4, 50 by week 12. Active means at least 3 completed deliveries that week.
- Assignment success, Ready to Accepted, above 85% in peak hours, above 95% off-peak.
- Delivered rate above 92% of assigned orders. Undelivered, RTO, below 8%.
- OTP failure rate, rider at door but no OTP, below 2%.
- Wallet dispute rate below 1% of orders.
- Median Ready to Delivered, inside the 40-45 km circle, under 60 minutes, with no promise shown to the customer.

If assignment success is below 70% for two weeks, the problem is supply, not the app. Stop building features and recruit.

---

## 3. WHO IT IS FOR

### 3.1 Businesses — the paying customer

**Who:** Any legitimate local business that takes orders outside a marketplace.
Examples, in priority order for launch:
1. Restaurants and cloud kitchens, food, but not on Zomato/Swiggy for that order, or taking direct phone orders.
2. Clothing, footwear, boutiques.
3. Pharmacies, cakes and bakeries, gifts, electronics accessories, stationery, flowers.
4. Local D2C brands selling on Instagram or WhatsApp.

**What they want:** A rider when they need one, without hiring one. A price they know before they click. A status they can see and forward to their customer. No monthly fee. No COD handling.

**What they do not want:** A new marketplace, a commission on the order value, a delivery promise they have to defend to their customer, a phone call to arrange every delivery.

**CTO note:** The business is the customer, not the end customer. Every product decision should be judged by: does this make the business more likely to create the next order? The end customer experience matters, but only because the business will churn if its customers complain.

### 3.2 Delivery partners — the supply

**Who:** Gig workers already with Zomato, Swiggy, Instamart, plus local bike owners who want flexible work. Age, licence, bike, phone, bank account.

**What they want:** Clear pay per trip, ₹28 on a ₹35 delivery, ₹20 on a ₹25 return, no hidden deduction, weekly payout to bank, work when they want, one order at a time, no customer payment handling because there is no COD.

**What they fear:** Fake orders, unpaid return trips, waiting 30 minutes at a door for free, being blamed for a damaged parcel they did not pack.

**Engineer note:** The Driver App must be usable with one hand, in sunlight, on a low-end Android phone, with poor network. If a rider cannot accept in 10 seconds, the assignment system fails in practice, even if it works in a demo.

### 3.3 End customers — the recipient

**Who:** The person who ordered from the business. They did not choose us. They may not know our name. They get an SMS or WhatsApp with a tracking link and an OTP.

**What they want:** To know where their parcel is, when the rider is near, and what OTP to give. Nothing else. No app install, no account, no password.

**CTO note:** Do not build a customer app. The tracking link is the product for this person. Every extra step, install, login, OTP to view tracking, is a reason for the delivery to fail.

### 3.4 Staff, support, and Super Admin — the operators

**Who:** The internal team. Staff who onboard drivers and businesses. Support who resolve "where is my parcel", "why was ₹60 deducted", "rider is not moving". Super Admin who sets prices, manages cities, whitelists APIs, and can suspend a business, a rider, or a city.

**What they need:** One web app, not five tools. Search by phone, order ID, business, rider. See the full timeline, GPS, calls, OTP attempts, wallet ledger. Act in one click, reassign, cancel, refund, block, approve. Every action logged with who did it and why.

---

## 4. PRODUCT SURFACES — WHAT EXISTS, AND WHAT DOES NOT

There are five surfaces. No more at launch. Any proposal for a sixth surface is a Phase 2 discussion.

### 4.1 Business App — for the business

**Purpose:** Create an order, mark it Ready, watch it move, see wallet, see history, raise a support ticket.

**Engineer — Core screens, conceptually:**
- Home, today's orders, Ready / Assigned / Picked / Delivered / Returned, with counts.
- Create Order, single form: customer name, phone, address, landmark, parcel description, weight, size, value for cap purposes, special instructions, pickup address if multiple branches.
- Order detail, timeline, rider name and phone, masked, live location after pickup, OTP status, tracking link copy and share.
- Wallet, balance, recharge, passbook, low-balance warning.
- Branches / pickup addresses, manage multiple pickup points.
- Support, tickets, past orders, invoices.

**CTO — What not to build in V1:**
- No catalogue, no inventory, no menu builder. The business already has its selling channel.
- No customer chat inside the Business App. Rider and business communicate through the order, with masked calls if needed, not free chat.
- No bulk upload in V1, unless the API covers it. Bulk CSV is a Phase 2 feature, the API is the bulk path.

**Key rule:** An order cannot be created if the wallet balance is below the delivery fee. The app must show the fee before creation, and block creation with a clear "Recharge ₹35 to create this order" message. Never create an order you cannot pay for.

### 4.2 Whitelisted API — for businesses with their own system

**Purpose:** Let a business's website, POS, or order system create orders and receive statuses without opening our app.

**CTO:** API is the priority, per the founder. It is how you win a larger business, a chain with 3 branches, a D2C brand on Shopify or WooCommerce. Those businesses will not have staff typing orders into a second app. If the API is hard, they will not integrate.

**Engineer — Conceptual design, no code:**
- Whitelisting: A business applies, is verified, then Super Admin enables API access and issues a key. The key is tied to that business, that city, and a rate limit. A key is never shared across businesses.
- Authentication: API key plus secret, per request, over HTTPS only. Keys can be revoked in one click. Test keys and live keys are separate.
- Order creation: One call creates one order. It returns an order ID, a fee quote, a tracking link, and an OTP reference, not the OTP itself.
- Status: Webhooks push every status change to the business's URL, plus a pull endpoint to fetch status by order ID. Webhooks must be retryable and signed, so the business can trust they came from us.
- Idempotency: If the business retries the same creation request, it must not create two orders or deduct twice. Every creation carries a business-side reference ID.
- Rate limits and quotas: Per business, per minute and per day, to prevent a bug in their system from creating 1,000 orders.
- Statuses: The API must expose the same statuses as the app, see Section 6. No hidden statuses.

See Section 11 for the full API contract in words.

### 4.3 Driver App — for the rider

**Purpose:** Go online, accept one order, navigate to pickup, confirm pickup, navigate to drop, collect OTP, mark delivered, or mark undelivered and return.

**Engineer — Core screens, conceptually:**
- Home, online/offline toggle, today's earnings, live order if any.
- New job card, pickup address, drop distance, fee, ₹28, accept or decline, with a countdown, e.g. 30 seconds to decide.
- Pickup screen, business name, address, navigation, call business, confirm pickup, photo of parcel if required.
- Drop screen, customer name, address, navigation, call customer, enter OTP, confirm delivery.
- Undelivered flow, reason picker, call log, wait timer, return navigation, confirm return to business.
- Earnings, wallet, payout history, documents status.
- Support, one-tap help during a live order.

**CTO — Non-negotiables:**
- One live order only. The app must not show a second job while one is live.
- Offline by default. A rider is not available unless they explicitly go online.
- Battery and data light. Location updates must be throttled sensibly, not every second, or riders will kill the app.
- Language: Hindi and English at minimum, with large tap targets. The rider may be riding, in rain, with gloves.

### 4.4 Admin / Management Web App — for staff, support, Super Admin

**Purpose:** Run the city. Onboard, verify, assign, watch, resolve, price, suspend.

**Engineer — Modules, conceptually:**
- Dashboard, live orders map, riders online, unassigned Ready orders, wallet low balances, tickets open.
- Business management, signup queue, verification, documents, branches, API whitelist, suspend, wallet adjustments with reason.
- Driver management, onboarding queue, document verification, expiry alerts, suspend, earnings, payouts.
- Order management, search, timeline, manual reassign, cancel, force return, refund.
- Support, tickets linked to orders, canned replies, call logs.
- Pricing, Super Admin only, set delivery fee and return fee per city, effective date, history.
- City management, Super Admin only, define the 40-45 km circle, enable or disable a city, set operating hours.
- Audit log, every admin action, who, when, what changed, why.

**CTO:** This is the most important surface for trust, even though the customer never sees it. If support cannot see why ₹60 was deducted in 30 seconds, the business will leave. Build the admin view before you polish the business app.

### 4.5 Customer tracking web — link only

**Purpose:** Let the recipient see where the parcel is and what OTP to share, without an app or login.

**Engineer — What it shows:**
- Order status in plain language: Packed, Rider assigned, Picked up, On the way, Arrived, Delivered, Returned.
- Rider first name and masked phone, live location after pickup, only while the order is live.
- OTP, shown to the customer, with "Share this only when you have the parcel in your hand" warning.
- Business name, so the customer knows who sent it.
- Support contact, for the business, not for us directly, unless the business has handed support to us.

**CTO:** The tracking page must work on a 2G connection, in a basic browser, without login. If it needs an app, it has failed.

---

## 5. BUSINESS SIGNUP AND VERIFICATION — SHIPROCKET-STYLE, INTRACITY VERSION

### CTO — Why verification is the product

**CTO:** If anyone can sign up and send anything, you become a courier for fraud, for stolen goods, for illegal items, and for fake orders that waste rider time. Verification is not bureaucracy. It is the reason a good business trusts you with its customers, and the reason a rider trusts that the pickup address is real.

Shiprocket's model is the template. Shiprocket signup is: create account, OTP verify mobile, complete a 6-step onboarding form, business details, how many orders, then KYC. KYC is selfie for photo identification, then Express KYC by Aadhaar OTP or GSTIN OTP in about 30 minutes, or manual document upload in 2 to 3 business days. For companies, PAN is mandatory, plus GST certificate or incorporation document. Bank details are verified by penny drop for COD payouts.

We copy the shape, we adapt the content. We have no COD, so we do not need bank verification for COD remittance. We do need bank verification for the business only if we ever refund to bank, which we do not in V1, refunds go to wallet. That simplifies V1.

### Engineer — Signup flow, step by step

1. **Create account:** Business name, owner name, mobile, email, password. OTP verify mobile and email. No order can be created until verification is complete.
2. **Business details:** Business type, Individual, Sole Proprietorship, Partnership, LLP, Private Limited. Pickup address, billing address if different, city, pincode. Website, Instagram, Google Business Profile, or marketplace link. At least one public presence is required to prove legitimacy. A business with no website, no Instagram, no Google listing, and no shop board photo is flagged for manual review.
3. **Documents:** Depending on type.
   - Individual: Aadhaar OTP or PAN plus Aadhaar, selfie.
   - Sole Proprietorship: GSTIN OTP if registered, or Aadhaar OTP, plus shop licence / Udyam / trade licence, PAN.
   - Partnership / LLP / Company: Company PAN mandatory, GST certificate if registered, incorporation certificate, authorised person Aadhaar and selfie.
   - All: Pickup address proof, a photo of the shop board or storefront, and a live photo of the pickup point if requested.
4. **Verification:** Express path, Aadhaar OTP or GSTIN OTP, auto-verified in minutes. Manual path, document upload, staff review in 1 to 2 business days. Staff can approve, reject with reason, or ask for a re-upload.
5. **Wallet activation:** After approval, business can recharge the wallet. Before approval, wallet recharge is blocked, to avoid taking money from an unverified business.
6. **API access:** Separate request after approval. Super Admin whitelists, issues key, sets rate limit. API access can be revoked without suspending the business app.

**What staff must check, manually, even on Express KYC:**
- Does the website / Instagram / Google listing match the business name and pickup address?
- Is the pickup address a real shop, not a home address with no signage, unless it is a genuine home business with proof?
- Is the business category plausible for bike delivery? A business selling furniture is not a bike customer.
- Has this phone, GSTIN, PAN, or address been rejected before? Duplicate check is mandatory.

### Verification outcomes

- **Approved:** Can create orders, recharge, use API if whitelisted.
- **Pending:** Can log in, can see dashboard, cannot create orders, cannot recharge.
- **Rejected:** Reason shown, can re-apply once with corrected documents. Second rejection requires a manual call.
- **Suspended:** After approval, if fraud, repeated undelivered abuse, or illegal items, Super Admin can suspend. Suspension blocks new orders immediately, does not cancel live orders, and wallet balance remains visible but frozen until review.

### What "legit" means, in practice

A legit business, for V1, is:
- A real person, with a real phone and Aadhaar / PAN.
- A real pickup point, with an address that can be found on a map.
- A real selling presence, website, Instagram, Google, or a shop.
- A plausible product for a bike, not a prohibited item, not a vehicle.

If any of those four is missing, the business is not approved. No exception for "a friend" or "a big brand". Big brands go through the same flow, faster, but not skipped.

---

## 6. ORDER LIFECYCLE — THE STATE MACHINE THAT RUNS THE BUSINESS

This is the core of the system. Everything else is a view on this state machine.

### CTO — The flow, in plain words

**CTO:** The business creates the order. The business packs it. The business says Ready. Only then do we look for a rider. That order matters. If we assign before Ready, the rider arrives, waits, and wastes a trip. Shiprocket has the same discipline, pickup is scheduled after the shipment is ready, not before.

Once Ready, we auto-assign the nearest online rider. The rider accepts. The rider goes to pickup, confirms pickup. The rider goes to drop. The customer gives the OTP. Done.

If the customer is not there, the rider waits, calls, and if still nothing, brings it back. That is not a failure of the rider. That is a return, and it is charged.

If no rider is available, we say so. We do not pretend.

### Engineer — States, and what each state means

| State | Who can move it | What it means | Money |
|---|---|---|---|
| `CREATED` | Business | Order created in app or API, parcel not yet packed. | No deduction yet. |
| `READY` | Business | Packed, sealed, ready for pickup. Assignment can start. | No deduction yet, or hold ₹35 if the CTO chooses hold at Ready. See A1. |
| `ASSIGNING` | System | Looking for nearest rider, sending offers. | No deduction. |
| `NO_RIDER` | System | No rider accepted in the assignment window. | No deduction. Order stays READY, business can retry. |
| `ASSIGNED` | Rider accepts | Rider accepted, on the way to pickup. | ₹35 deducted or held now. |
| `PICKED_UP` | Rider confirms | Rider has the parcel. GPS tracking starts for customer. | ₹35 is now earned, not refundable if the rider is en route. |
| `OUT_FOR_DELIVERY` | System, on pickup | Rider is moving to drop. | — |
| `ARRIVED` | Rider, GPS or tap | Rider is at drop location. Wait timer starts. | — |
| `DELIVERED` | Rider enters OTP | Customer gave OTP, parcel handed over. Order closed. | Driver earns ₹28, platform ₹7. |
| `UNDELIVERED` | Rider, after wait and calls | Customer not reachable, refused, wrong address, OTP not given. Return starts. | ₹25 return deducted now. Total ₹60. |
| `RETURNING` | System | Rider is bringing parcel back to business. | — |
| `RETURNED` | Business confirms receipt | Parcel back with business, order closed. | Driver earns ₹20 for return leg, platform ₹5. |
| `CANCELLED` | Business, before assignment, or Support | Order cancelled before rider assigned. | No deduction, or full refund if held. |
| `CANCELLED_AFTER_ASSIGN` | Support only | Cancelled after rider accepted but before pickup. | Policy: no charge to business if rider had not reached pickup, rider gets a small cancellation fee from platform, to be decided by Super Admin, not in V1 scope to automate. |

**Rules that must never be broken:**
- An order cannot go from CREATED to ASSIGNED. It must go through READY.
- An order cannot go from PICKED_UP to DELIVERED without OTP. The system must reject a delivery confirmation without a valid OTP.
- An order cannot go from DELIVERED to any other state. Delivered is terminal.
- RETURNED is terminal. After RETURNED, the business can create a new order, not reopen the old one.
- Every state change must have a timestamp, an actor, GPS if relevant, and a reason if it is UNDELIVERED or CANCELLED.

### The wait, call, and OTP rules, exact

**Wait:** When the rider taps Arrived, a 15-minute timer starts, visible to rider, business, and support. The rider must stay at or near the location. The timer is the evidence. If the rider leaves before 15 minutes, the undelivered marking is invalid.

**Calls:** The rider must make at least 2 calls, up to 3 calls, to the customer phone, from the app, so the calls are logged. The founder said 2 to 3 calls, 4 attempts in total. This plan uses 3 call attempts as the standard. The 4th attempt is the support call, if support intervenes, not a rider call.

**OTP:** The OTP is 4 digits, sent to the customer at assignment and again at pickup, by SMS and WhatsApp. The customer reads it only after receiving the parcel. The rider enters it in the app. Three wrong OTP entries lock the delivery attempt and require support to resend or verify. The OTP expires when the order closes.

**No OTP, no delivery:** If the customer cannot give the OTP, because they do not have the phone, they are not the recipient, or they refuse, the rider must not hand over the parcel. The rider marks Undelivered, reason "OTP not provided", and returns the parcel.

**Engineer note on OTP fraud:** The OTP must never be shown in the Business App, in the API response, or in the Admin App, except as "sent" or "not sent". If a business can see the OTP, it can tell the rider the OTP without the customer, and proof collapses. The OTP is only on the customer's phone and in the tracking link, which is sent to the customer's phone.

### No rider available, exact behaviour

- Assignment window: Offer to nearest rider, wait 30 seconds. If decline or timeout, offer to next nearest, up to 5 riders or 3 minutes, whichever comes first.
- If no rider accepts, state becomes NO_RIDER, business and support are notified, order stays READY.
- Business can: Retry assignment, Edit the order, Cancel with no charge.
- System must not auto-retry forever. One manual retry, then the order stays Ready until the business acts or the day ends. At day end, unassigned Ready orders auto-cancel with no charge and a notification.
- The "no rider available" message must be honest and specific: "No rider available at this moment in your area. Please retry in 10 minutes." Never "Your order is delayed" when no rider was ever assigned.

### Cancellation rules

- Before assignment: Business can cancel, no charge.
- After assignment, before pickup: Business can request cancellation, support approves, rider is notified, no charge to business if rider had not left for pickup, rider gets a goodwill fee only if Super Admin enables it.
- After pickup: Business cannot cancel. The parcel is with the rider. The only outcomes are Delivered or Returned.
- Customer cannot cancel directly with us. The customer cancels with the business, the business cancels with us, if the state allows it.

---


## 7. PRICING, WALLET, AND DRIVER PAY — MONEY MUST NEVER BE WRONG

### CTO — The pricing philosophy

**CTO:** Price is a Super Admin setting, not a formula, at launch. That is a deliberate choice, not a limitation. In a single city, with bike-only delivery, a simple, understandable price wins trust faster than a distance and weight matrix that no shop owner can predict.

Starting price: ₹35 delivery, ₹25 return. Undelivered total: ₹60.

That price must be shown before the business creates the order, and it must be the price deducted. No surge, no hidden fee, no weight extra at launch. If Super Admin changes the price, it applies to new orders from the effective time, never to orders already created.

Future pricing, after density, can add distance slabs, weight slabs, night charges, or peak charges. Do not build those in V1. Build the config so they can be added, but do not launch with them.

### Engineer — Wallet, the Shiprocket way

Shiprocket's prepaid model is: recharge the wallet, amount for each shipment is deducted when you process the order, and the passbook shows every charge, freight, RTO freight, reversal, and credit. We copy that ledger discipline.

**Wallet rules, V1:**
- Recharge by UPI, net banking, or card, through a payment gateway. Minimum recharge ₹500, to be confirmed by Super Admin. Maximum recharge to be set by Super Admin.
- Balance is per business, not per branch. Branches share the same wallet.
- Deduction timing, per Assumption A1: ₹35 is held at assignment, confirmed at pickup. If no rider is assigned, no hold, no deduction. If the order is cancelled before assignment, no deduction.
- Return deduction: ₹25 is deducted when the rider marks Undelivered and starts the return. The business sees two lines: Forward ₹35, Return ₹25, Total ₹60.
- Refunds: If an order is cancelled before assignment and a hold was placed, the hold is released immediately. If a system error deducts twice, support can credit the wallet with a reason, and the credit is visible in the passbook.
- Low balance: Warn at ₹200, block new orders below ₹35, show "Recharge to continue" in the app and API error.
- Passbook: Every entry has date, order ID, type, Forward, Return, Recharge, Credit, Refund, balance after, and a human-readable reason. The business can export the passbook.
- Invoices: Monthly GST invoice for the platform fee portion, if the platform is GST registered. This needs finance advice before launch, not a product decision to guess at.

**Driver pay, exact:**
- Delivery: ₹35 total, driver ₹28, platform ₹7.
- Return: ₹25 total, driver ₹20, platform ₹5.
- Undelivered total: ₹60 total, driver ₹48, platform ₹12.
- Payout: Weekly, to the verified bank account given at onboarding. Payout is for completed legs in that week, with a statement showing order IDs, dates, and amounts. No cash payout, no UPI payout to an unverified number.
- Deductions from driver pay: None at launch, except for proven fraud or loss where the driver is liable under the driver agreement, which needs legal drafting. Never deduct for a late delivery caused by traffic, or for a customer not being home, if the rider followed the wait and call rules.

**CTO warning:** The 80/20 split is generous to the rider, and that is intentional for supply. It leaves the platform ₹7 per delivery to cover SMS, WhatsApp, maps, payment gateway, support, and tech. At low volume, that does not cover costs. That is normal for a pilot, but it must be modelled. If the platform needs ₹15 per delivery to break even, the answer is not to cut the rider to 60% silently, it is to raise the business price, add a small platform fee, or accept a pilot subsidy with a clear end date. Do not solve unit economics by underpaying riders, or supply will vanish.

**Unit economics, worked example, for the pilot model:**
- 100 orders a day, 92 delivered, 8 undelivered.
- Business revenue: 92 x ₹35 = ₹3,220, plus 8 x ₹60 = ₹480, total ₹3,700 a day.
- Driver pay: 92 x ₹28 = ₹2,576, plus 8 x ₹48 = ₹384, total ₹2,960 a day.
- Platform gross: ₹740 a day, before SMS, maps, gateway, support, and tech.
- At 500 orders a day, platform gross is ₹3,700 a day, before costs. That is the scale where the model starts to work, if costs are controlled.
- This is why density in one city matters more than launching in three cities at once.

### What is not charged

- No charge for creating an order.
- No charge for marking Ready.
- No charge for "no rider available".
- No charge for a cancelled order before assignment.
- No monthly fee, no signup fee decided, no API fee at launch.

If Super Admin later adds a fee, it must be announced 30 days in advance, and it must be visible before order creation.

---

## 8. DRIVER SUPPLY AND ONBOARDING — THE 24 TO 48 HOUR LINK

### CTO — Recruit where riders already are

**CTO:** Do not post a generic job ad and hope. Go to where Zomato, Swiggy, and Instamart riders wait, near restaurants, malls, and dark stores, at lunch and dinner changeover. Talk to them in person, in Hindi, with a one-page offer: ₹28 per delivery, ₹20 per return, weekly bank payout, one order at a time, no COD handling, work when you want.

Referrals are the second channel. A rider who brings a verified rider gets a bonus, to be set by Super Admin, only after the new rider completes 10 deliveries. Do not pay for a signup, pay for a working rider.

### Engineer — Onboarding flow, exact, as decided

This is the most detailed operational flow in V1, because a wrong onboarding creates fraud, expired licences, and uninsured riders.

**Step 1 — Staff initiates:**
- Staff creates a driver record in the Admin App: name, phone, city, source, Zomato/Swiggy/Instamart or other.
- Staff sends a one-time onboarding link by SMS and WhatsApp to the driver's phone.
- The link is single-use, expires in 24 to 48 hours. The founder said 24:48 hours, this plan uses 48 hours as the expiry, with a reminder at 24 hours. After expiry, the link is dead. Staff must send a fresh link. The old link must not work after submission, after expiry, or after a second link is sent.

**Step 2 — Driver fills and uploads:**
- Driver opens the link, no app install required for onboarding, web form only.
- Driver fills: full name, date of birth, phone, address, emergency contact, bank account number, IFSC, account holder name, vehicle number, vehicle type, bike model.
- Driver uploads, clear photos, not photocopies of photocopies:
  - Driving Licence, front and back.
  - Vehicle RC, front and back.
  - Aadhaar, front and back, or Aadhaar OTP verification.
  - Bank passbook first page or cancelled cheque, to match account holder name.
  - Selfie, live, for face match with DL and Aadhaar.
  - Photo of bike, with number plate visible.

**Step 3 — System checks, automatic:**
- DL number format, DL expiry date, must be valid for at least 30 days from submission. If expired, or expiring in less than 30 days, block and ask for renewal.
- RC validity, vehicle number matches the bike photo, RC not expired.
- Aadhaar format, 12 digits, OTP if used.
- Bank IFSC format, account number match with name.
- Phone is not already onboarded, Aadhaar is not already onboarded, DL is not already onboarded. Duplicate check is blocking.
- Age, must be 18 or above, per DL date of birth.

**Step 4 — Support verifies, human:**
- Support sees a queue, with documents side by side, expiry dates highlighted, duplicate flags, and a checklist.
- Support can: Approve, Reject with reason, Ask for re-upload of a specific document.
- Support must check: Is the selfie the same person as the DL photo? Is the bike in the photo the bike on the RC? Is the bank name the same as the driver name? Is the address plausible for the city?
- No auto-approval in V1. Every driver is human-approved. Auto-approval is a future risk, not a launch shortcut.

**Step 5 — Activation:**
- After approval, the driver account becomes Active, the driver can download the Driver App, log in, and go online.
- Before approval, the driver cannot log in to the Driver App, cannot see jobs, cannot go online. The account is not immediately active, by design.
- Driver is told, by SMS and WhatsApp: "Approved, download the app, go online when you are ready."

**Step 6 — Ongoing compliance:**
- Expiry alerts: 30 days, 15 days, 7 days before DL or RC expiry, driver is warned in the app and by SMS. On expiry day, the driver is auto-paused, cannot accept jobs, until a renewed document is uploaded and approved.
- Re-verification: If a document is found to be fake, or the driver changes vehicle or bank, re-verification is required before the next job.
- Suspension: Support or Super Admin can suspend for fraud, repeated no-shows, customer complaints, or unsafe riding. Suspension is immediate, earnings are frozen pending review, and the driver is notified with a reason and an appeal path.

**What staff must never do:**
- Never onboard a driver by WhatsApp photos alone, without the link and the system checks.
- Never approve a driver with an expired DL, even if "he will renew tomorrow".
- Never share the onboarding link publicly. It is per driver, per phone, single-use.

### Driver lifecycle, beyond onboarding

- **Online:** Rider toggles online, location is shared, they are eligible for assignment.
- **Offline:** Rider toggles offline, no offers, no penalty.
- **Busy:** Rider has a live order, no new offers.
- **Paused:** System pauses for expired documents, or support pauses for investigation.
- **Inactive:** Rider has not completed a delivery in 30 days, account is dormant, needs a check-in before going online again.
- **Blocked:** Fraud, theft, or serious complaint, account blocked, payout held pending legal review.

### Incentives, to be decided by Super Admin, not built as a promise

Do not promise incentives in the app until Super Admin sets them. The system should support, conceptually: per-delivery bonus after X deliveries in a day, peak-hour bonus, referral bonus after 10 deliveries, and a joining bonus after first 5 deliveries. All must be configurable, with start and end dates, and visible to the rider before they work for them. Never show an incentive that is not funded.

---

## 9. PARCEL RULES — WHAT FITS ON A BIKE, AND WHO PACKS IT

### CTO — The bike is the constraint, respect it

**CTO:** A bike is not a van. If a parcel does not fit safely on a bike, it does not go. That is a safety rule, not a customer service rule. A rider with an oversized box, blocking their view, is a danger to themselves and to others.

The founder said: maximum parcel as per the size of the bike, search the internet for that. The research found: Indian bike courier services cap bike parcels at up to 20 kg within size limit, and the WRI India paper on urban freight lists two-wheelers at 30 kg maximum allowable cargo weight. This plan sets the starting cap at 20 kg, because 20 kg is rideable, packable in a delivery box, and safe for a normal bike. 30 kg is a cargo bike, not a normal bike.

### Engineer — Parcel limits, V1

- **Weight:** Maximum 20 kg per order. The business must enter weight at creation. If weight is above 20 kg, the app and API must reject the order with "Exceeds bike limit, 20 kg maximum".
- **Size:** Must fit in a standard bike delivery box. Starting dimensions, to be confirmed with a physical box test before launch: length 45 cm, width 35 cm, height 35 cm, or total of length plus width plus height under 115 cm. If it does not fit, it does not go.
- **Packaging:** Business is responsible for packing. Parcel must be sealed, labelled with order ID, customer name, and phone, and handed over sealed. Rider must not open, repack, or check contents. Rider confirms pickup by checking the seal and the label, not the contents.
- **Value:** Business must enter parcel value at creation, for the liability cap. If value is above ₹5,000, the business is warned that platform liability is capped at ₹5,000, and the business should use its own insurance if it wants more cover.
- **Food:** Hot food must be in a sealed, leak-proof container, in a food bag if the rider has one. The business must pack it so it does not spill. Rider is not responsible for food quality, temperature, or spillage if packed incorrectly.
- **Fragile:** Business must mark Fragile and pack with protection. Rider must be told it is fragile in the job card. Even then, the platform liability cap applies.

### Prohibited items — the nuance

The founder said: no separate banned-items list, because business verification covers it. That is correct as a product decision, but it does not remove the law.

**Illegal items are always prohibited,** regardless of verification: drugs, narcotics, weapons, explosives, stolen goods, counterfeit goods, cash above a limit, jewellery above the cap without declaration, and any item prohibited by Indian law.

**The business verification control works like this:**
- A verified restaurant will not ship a TV. A verified clothing shop will not ship medicines it is not licensed for. If it does, that is a breach of its business verification, and it can be suspended.
- Support must have a "Report suspicious parcel" button in the Driver App, for a rider who is asked to carry something that looks illegal or dangerous. The rider can refuse pickup, mark "Suspicious, refused", and support investigates. The rider is not penalised for a genuine refusal.
- The terms must state: the business declares the parcel contents are legal, correctly described, and safely packed. A false declaration is grounds for suspension and for the business to bear the loss.

**CTO note:** Do not build a long banned list in V1 and ask businesses to read it. Build the declaration, the verification, and the rider refusal path. That is more effective than a list no one reads.

### Loss and damage — the ₹5,000 cap, explained

**Founder decision:** Platform is not liable if a parcel is lost or damaged, business must pack it and hand it over sealed.

**CTO interpretation, to be confirmed by legal:** The platform's liability is capped at ₹5,000 per parcel, lower of order value or ₹5,000, mirroring Shiprocket's lost-shipment SOP, where Shiprocket initiates order value or ₹5,000, whichever is less, for an unsecured lost shipment. This cap is not a promise to pay ₹5,000 for every loss. It is a maximum, if the platform is found liable, and only after an investigation.

**Engineer — What must be logged to decide a loss claim:**
- Pickup confirmation, rider, time, GPS, photo of sealed parcel if taken.
- GPS trail from pickup to drop or return.
- OTP attempts, call logs, wait timer.
- Return confirmation, business signature or OTP, time, GPS.
- If any of those are missing, the claim cannot be decided, and support must say so honestly.

**What the business must do to claim:**
- Raise a ticket within 24 hours of the expected delivery, with order ID, parcel value proof, invoice, and packing photo if available.
- Support investigates within 2 business days, and the decision is communicated with reasons.
- If the rider is found to have taken the parcel, the rider is blocked, payout held, and legal action is considered. The business is not left without an answer.

---

## 10. TECHNICAL ARCHITECTURE — HIGH LEVEL, NO CODE

### CTO — Choose boring, proven technology

**CTO:** This is not a research project. It is a logistics system that must work at 7 pm on a rainy day, on a cheap Android phone, with a rider who has 10% battery. Choose technology that is proven, hireable, and operable in India, not technology that is fashionable.

The stack below is a recommendation, with pros and cons. The final stack is a CTO decision at build time, but the principles are locked: one backend, one database of record, realtime for assignment and tracking, and a mobile app that works offline-first for the rider.

### Engineer — System in one picture, in words

- **Clients:** Driver App, Android first, iOS later if needed, Business App, Android and iOS, Admin Web, Customer tracking web.
- **API Gateway:** One entry point, authentication, rate limiting, logging. All clients go through it. No client talks directly to the database.
- **Backend services, conceptually:**
  - Identity and verification, businesses, riders, staff, OTP, KYC.
  - Order service, the state machine, the source of truth for an order.
  - Assignment service, nearest rider, offer, accept, timeout, reassign.
  - Tracking service, GPS ingestion, live location, ETA, no promise, just live position.
  - Wallet and billing service, ledger, holds, deductions, payouts, passbook.
  - Notification service, SMS, WhatsApp, push, email, with templates and logs.
  - Support service, tickets, audit log, admin actions.
- **Data:** One primary database for orders, wallets, and users. A cache for rider location and availability. A queue for notifications, webhooks, and payouts, so a slow SMS does not block an assignment.
- **Maps:** A maps provider for geocoding, distance, routing, and live tracking. The provider must work well in the launch city, with accurate addresses and pincodes. Google Maps is the default in India, MapMyIndia is an alternative to evaluate for cost and accuracy.
- **Storage:** Document storage for DL, RC, Aadhaar, photos, with access control. Documents are never public URLs. They are private, with signed, expiring access, and only support and the owner can view them.

### Stack recommendations, with pros and cons

**Mobile — Flutter, recommended for V1:**
- Pros: One codebase for Android and iOS, faster to build Driver and Business Apps, good performance, large hiring pool in India.
- Cons: Larger app size, some native features need plugins, iOS release process still needed.
- Alternative, Native Android Kotlin plus iOS Swift: Pros, best performance, best access to GPS and background location. Cons, two codebases, twice the cost, slower to launch.
- CTO recommendation: Flutter, Android first. If the Driver App proves to need deep background location work that Flutter cannot do reliably, revisit native for Driver only, keep Business App on Flutter.

**Backend — Node.js with NestJS, or Python with FastAPI, recommended: Node.js / NestJS:**
- Pros: Same language as many Indian teams, good for realtime, WebSockets, and APIs, strong ecosystem for payments and SMS, easy to hire.
- Cons: Needs discipline to avoid callback and scaling mistakes, TypeScript is required, not optional.
- Alternative, Python FastAPI: Pros, fast to write, good for data and AI later. Cons, smaller realtime ecosystem, harder to hire for logistics realtime in some markets.
- CTO recommendation: Node.js with TypeScript and NestJS, because the system is API and realtime heavy, and the team will be Node-heavy in India.

**Database — PostgreSQL, recommended:**
- Pros: Reliable, ACID for wallet, good for geospatial with PostGIS, proven for orders and ledgers.
- Cons: Needs careful indexing for location queries, needs a cache for realtime rider location, not a cache itself.
- Alternative, MongoDB: Pros, flexible documents, fast to start. Cons, wallet ledger needs transactions and strict schema, which is harder to guarantee, and geospatial is less mature.
- CTO recommendation: PostgreSQL as the system of record, Redis as the cache and queue, for rider location, assignment offers, and rate limiting.

**Realtime — WebSockets plus push:**
- Pros: Live assignment, live tracking, instant status.
- Cons: Needs reconnection handling, battery management, and fallback to polling when WebSockets drop.
- Engineer note: The Driver App must work if WebSockets drop. It must poll, queue actions offline, and sync when back online. A rider in a basement or a low-network area must not lose a delivery because the socket dropped.

**Hosting — Cloud, India region:**
- Pros: Managed database, managed queues, auto-scaling, backups.
- Cons: Cost, needs cost monitoring from day one.
- CTO recommendation: AWS Mumbai or GCP Mumbai, India region for data residency and latency. Use managed PostgreSQL, managed Redis, object storage for documents, and a CDN for the tracking web page.

**Payments — Razorpay or Cashfree, recommended:**
- Pros: UPI, cards, net banking, wallet recharge, payouts to bank, good Indian support.
- Cons: Gateway fees, payout timing, KYC for the platform itself.
- Engineer note: Wallet recharge and driver payout must be separate flows, with separate ledgers. Never mix business wallet money with driver payout money in the same account, conceptually or in the ledger.

### Scalability, in plain words

- **V1, pilot city:** One city, 100 businesses, 50 riders, 500 orders a day. A single backend, a single database, with Redis, is enough. Do not over-engineer for 10 cities.
- **Scale trigger:** When orders exceed 2,000 a day in one city, or when a second city is added, split the assignment service and the tracking service, add read replicas, and shard by city.
- **What must scale first:** Assignment, GPS ingestion, and notifications. Those are the realtime parts. The admin app and passbook can be slower.
- **What must never scale by losing correctness:** Wallet. Wallet transactions must be atomic, idempotent, and auditable, even if that means they are slower than a status update.

### Reliability and offline

- Driver App must queue pickup, delivery, and undelivered actions offline, and sync when network returns, with a timestamp of when the action happened, not when it synced.
- Business App must show the last known status if offline, with "Last updated at" time, not a stale status presented as live.
- Tracking web must work on 2G, with minimal images, and a text fallback.
- The system must have a status page for staff, showing if assignment, SMS, maps, or payments are down. If SMS is down, OTP delivery must have a WhatsApp fallback, and if both are down, support must be able to read the OTP to the customer by phone, with logging, as an emergency path only.

---

## 11. CONCEPTUAL DATA MODEL

No code, no SQL. This is what exists, what fields it has in words, and how it relates.

### Core entities

**City:** Name, 40-45 km circle centre latitude and longitude, radius, operating hours, delivery fee, return fee, status, Active or Paused. One city is the pilot. Every order, business, and rider belongs to a city.

**Business:** Business ID, name, type, owner name, phone, email, pickup addresses, one or more, with latitude and longitude, verification status, Pending, Approved, Rejected, Suspended, documents, wallet balance, API key reference, rate limit, created date, verified date, verified by staff ID.

**Business User:** Staff of the business who can log in, name, phone, role, Owner or Staff, permissions, create order, view wallet, manage branches.

**Driver:** Driver ID, name, phone, date of birth, address, emergency contact, DL number and expiry, RC number and expiry, vehicle number and type, Aadhaar reference, masked, bank account, IFSC, account holder name, onboarding link ID and expiry, verification status, Pending, Approved, Rejected, Suspended, Blocked, online status, current order ID or none, rating, total deliveries, total returns, joined date.

**Order:** Order ID, business ID, business reference ID, customer name, phone, address, landmark, latitude and longitude, parcel description, weight, size, value, special instructions, pickup address ID, status, state machine in Section 6, fee, ₹35, return fee, ₹25, total, wallet transaction IDs, rider ID, OTP reference, not the OTP value, OTP attempts, created time, ready time, assigned time, pickup time, delivered time, returned time, cancelled time and reason, tracking link token.

**Order Timeline:** Order ID, state, actor, business, rider, system, support, timestamp, GPS, reason, note. Every state change is a timeline entry. No state change without a timeline entry.

**Wallet Ledger:** Business ID, transaction ID, order ID or recharge ID, type, Recharge, Forward Charge, Return Charge, Credit, Refund, Hold, Release, amount, balance after, reason, created by, system or support.

**Driver Payout:** Driver ID, week, order IDs, delivery count, return count, gross pay, deductions if any, net pay, bank account, status, Pending, Paid, Failed, payout date.

**Tracking Link:** Order ID, token, expires when order closes, customer phone, OTP reference.

**Support Ticket:** Ticket ID, order ID or business ID or driver ID, type, Where is my parcel, Wallet dispute, Rider issue, Business issue, status, Open, In Progress, Resolved, priority, assigned staff, messages, resolution, created and resolved time.

**Pricing Config:** City ID, delivery fee, return fee, effective from, effective to, set by Super Admin ID, history. Price changes never affect orders already created.

**API Key:** Business ID, key ID, masked key, test or live, rate limit, webhook URL, status, Active or Revoked, created and last used date.

**Audit Log:** Actor, action, entity, entity ID, old value, new value, reason, timestamp, IP. Every admin action is an audit entry.

### Relationships, in one sentence each

- A Business has one wallet, many pickup addresses, many orders, many users.
- A Driver has one live order at most, many completed orders, one bank account, many documents.
- An Order has one business, one customer, one rider at a time, one tracking link, many timeline entries, many wallet entries.
- A City has many businesses, many drivers, many orders, one pricing config at a time.

### State machines, summary

- Order: Created to Ready to Assigning to Assigned to Picked Up to Out for Delivery to Arrived to Delivered, or to Undelivered to Returning to Returned, or to No Rider, or to Cancelled.
- Business verification: Pending to Approved, or Rejected, or Suspended.
- Driver verification: Pending to Approved, or Rejected, or Suspended, or Blocked.
- Wallet transaction: Hold to Confirmed, or Released, or Refunded.

---

## 12. API DESIGN — WHITELISTED, SIGNED, IDEMPOTENT

### CTO — The API is a promise

**CTO:** If a business integrates, it will build its checkout, its order screen, and its customer messages around our API. If we change the API without warning, we break their business. Version the API from day one, document it, and never break V1 without a migration path.

### Engineer — API contract, in words

**Authentication:**
- Every request carries an API key in a header, and a signature if the business enables it. Keys are per business, per environment, test and live separate.
- Keys are whitelisted by Super Admin. A key that is not whitelisted gets no data, even if the key format is correct.
- Keys can be revoked in one click, and revocation is immediate.

**Create order:**
- Input, in words: business reference ID, customer name, phone, address, landmark, pincode, parcel description, weight, size, value, pickup address ID, special instructions.
- Validation: Phone must be 10 digits, address must be inside the city circle, weight must be under 20 kg, wallet balance must be at least ₹35, business must be Approved.
- Output: Order ID, fee, tracking link, status, Created or Ready, and a quote.
- Idempotency: If the same business reference ID is sent twice, the second call returns the first order, no second deduction.
- Errors: Clear, machine-readable errors, Insufficient wallet, Outside service area, Overweight, Business not verified, Invalid phone. No generic "Something went wrong" for a validation error.

**Get order status:**
- Input: Order ID.
- Output: Status, timeline, rider first name and masked phone, live location if applicable, OTP status, Sent or Not sent, not the OTP, fees, wallet balance.

**Webhooks:**
- Events: Order Created, Ready, Assigned, Picked Up, Out for Delivery, Arrived, Delivered, Undelivered, Returning, Returned, Cancelled, No Rider.
- Each webhook is signed, with a timestamp, and the business can verify the signature.
- Webhooks retry, 3 times, with backoff, if the business server does not respond. After 3 failures, the event is queued for manual retry in the Admin App.
- Webhook URL must be HTTPS. HTTP is rejected.

**Rate limits:**
- Default: 100 requests per minute per business, 10,000 per day, to be set by Super Admin. If a business exceeds it, it gets a clear rate limit error, not a silent failure.
- Test environment: Separate rate limit, separate keys, no real riders, no real wallet deduction.

**Versioning and docs:**
- API version in the URL, V1 at launch. V1 is frozen once live, changes go to V2.
- Documentation must have: authentication, create order example in words, status list, webhook example, error list, and a test sandbox.
- A business must be able to test the full flow in sandbox, from create to delivered, with a test rider, before going live.

---


## 13. USER INTERFACE AND EXPERIENCE PRINCIPLES

### CTO — Design for the person who is busy, not for the demo

**Business App:** A shop owner is packing a parcel with one hand and creating an order with the other. The form must be 6 fields, not 16. Customer phone, address, parcel description, weight, value, pickup. Everything else is optional or pre-filled. The fee must be visible before the button. The status must be readable in 3 seconds.

**Driver App:** A rider is on a bike, in sun, in rain. Big buttons, high contrast, no small text, no multi-step menus during a live order. Accept, Navigate, Call, Pickup, Enter OTP, Delivered. Those six actions are the whole app during a job. Everything else is in a menu the rider opens when offline.

**Admin Web:** Support is handling 5 tickets at once. Search must work by phone, order ID, business name, rider name, with one search box, not five filters. The order timeline must be on one screen, with wallet, GPS, calls, and OTP attempts together. If support has to open three tabs to answer "why ₹60", the design has failed.

**Tracking Web:** The customer has never seen us before. Show: business name, status in plain words, rider first name, live map, OTP in large digits, and "Share OTP only after you have the parcel". Nothing else above the fold.

### Engineer — UX rules that are also system rules

- **No dead ends:** Every error must tell the user what to do next. "Insufficient wallet" must have a Recharge button next to it. "No rider available" must have a Retry button and a time to retry.
- **No silent failures:** If an assignment fails, if a webhook fails, if an OTP fails to send, the user who needs to know must be told, in the app, not in a log.
- **Offline first for the driver:** Actions queue offline, sync later, with the original timestamp. The rider must see "Queued, will sync" not a spinner that never ends.
- **Language:** Hindi and English from day one in the Driver App and tracking page. Business App in English and Hindi. Admin in English.
- **Accessibility:** Large text option, high contrast, voice input for address if possible in Phase 2, not V1.
- **Trust signals:** Show the fee before, the receipt after, the passbook always. Show the rider's first name and photo after assignment, so the business and customer know who has the parcel. Show the business name to the rider, so the rider knows where to go.

---

## 14. SECURITY, PRIVACY, FRAUD, AND COMPLIANCE

### CTO — Trust is the product, security is how you keep it

**Identity:** Businesses and drivers are verified humans, not anonymous accounts. That is the first security control. Everything else builds on it.

**Engineer — Controls, by area:**

**Accounts and access:**
- Passwords hashed, never stored in plain text. OTP for login, with rate limiting, 5 attempts then lockout.
- Staff and Super Admin have roles. Support can view and resolve, but cannot change pricing. Super Admin can change pricing, but every change is logged. No shared admin accounts.
- API keys are secret, revocable, and never shown in full after creation, except once at creation.
- Driver onboarding links are single-use, expiring, and tied to a phone. A leaked link must not onboard a different person.

**Data:**
- Aadhaar, PAN, DL, RC, bank details are sensitive personal data under India's DPDP Act. Store only what is needed, mask Aadhaar and bank account in the UI, encrypt at rest, restrict access to support only, and log every view of a document.
- Customer phone and address are shared only with the assigned rider and the business, and only while the order is live. After delivery, the rider must not retain customer details in the app.
- OTPs are never stored in plain text, never logged in full, never shown to the business or admin.
- GPS location is collected only when the rider is online and on a job, not 24 hours a day. The rider must know when location is being shared.

**Money:**
- Wallet ledger is append-only. No entry is deleted or edited. Corrections are new entries, with a reason.
- Driver payouts are to the verified bank account only. No payout to a different account without re-verification.
- Payment gateway webhooks are verified by signature. A fake webhook must not credit a wallet.

**Fraud:**
- Fake business: Verification, duplicate checks, shop photo, public presence.
- Fake driver: Document checks, selfie match, duplicate Aadhaar / DL / phone.
- Fake delivery: OTP, GPS, timestamp, photo. A delivery without OTP, without GPS at the drop, and without a wait timer is flagged.
- Fake order to waste rider time: Business with high undelivered rate is flagged, warned, and can be suspended. Wallet deduction makes fake orders expensive for the business, which is itself a control.
- Rider theft: One order at a time, GPS trail, OTP proof, payout hold, block, and legal path. No system can prevent theft entirely, but it can make it visible in minutes.

**Compliance, to be confirmed by legal before launch:**
- DPDP Act, consent, data retention, deletion on request.
- Gig worker status, contract, insurance, and accident cover, legal advice required, not assumed in this plan.
- GST on platform fees, invoices, and wallet.
- Terms for business, driver, and customer, including the ₹5,000 liability cap, the OTP rule, and the no-promise rule. Terms must be shown at signup and accepted, not hidden.

---

## 15. OPERATIONS, SUPPORT, AND THE NO-PROMISE PROMISE

### CTO — Support is not a cost, it is retention

**Staffing, pilot:**
- 1 support person per 50 live businesses, in pilot, with a phone and the Admin App.
- Support hours: business operating hours, e.g. 9 am to 9 pm, with an emergency line for live orders outside those hours.
- Super Admin is not support. Super Admin sets price, city, and policy. Support resolves orders.

**Support playbook, V1:**
- "Where is my parcel": Check timeline, GPS, rider phone, call rider, update business and customer.
- "Why ₹60": Show passbook, forward ₹35, return ₹25, wait timer, call log, OTP attempts. If the evidence is missing, escalate, do not guess.
- "No rider available": Apologise honestly, explain supply, offer retry in 10 minutes, log the failure for supply planning.
- "Parcel damaged": Ask for packing photo, pickup photo, return photo, raise a loss claim, investigate in 2 business days.
- "Rider is rude / unsafe": Pause rider, investigate, talk to rider, decide.

**No-promise communication:**
- Never say "will arrive in 30 minutes" in the app, in SMS, or on the phone.
- Say: "Rider assigned, on the way to pickup", "Picked up, on the way to you", "Rider is 2 km away", "Rider has arrived".
- If a customer asks "when", support says: "Inside the city it is usually 30 to 70 minutes from Ready, depending on distance and traffic, but we do not promise a time."

**Operating hours and city pause:**
- Super Admin can pause a city for rain, festival, or no riders, with a message: "Deliveries paused in your city, will resume at X". Orders already picked up continue to delivery or return, new orders are blocked.

---

## 16. POTENTIAL CHALLENGES AND SOLUTIONS

| Challenge | Why it happens | Solution in this plan |
|---|---|---|
| No riders at peak | Riders are on Zomato/Swiggy shifts at lunch and dinner | Recruit for gaps, not shifts. Peak bonus, configurable. Honest no-rider message. Supply dashboard by hour. |
| High undelivered rate | Wrong phone, wrong address, customer not home, OTP not shared | OTP at order creation, phone validation, address inside city check, wait and call rules, return charge makes the business verify the phone before creating the order. |
| Wallet disputes | Business does not understand ₹60 | Passbook with reasons, fee shown before creation, timeline with GPS and calls, support can show evidence in 30 seconds. |
| Fake businesses | Anyone can submit a form | Verification gate, duplicate checks, shop photo, public presence, manual review, suspension. |
| Driver churn | Pay is low, work is irregular | 80% share, weekly payout, one order at a time, no COD, no customer payment handling, referral bonus. Do not cut pay to fix costs. |
| Maps and addresses wrong | Indian addresses are landmarks, not house numbers | Landmark field mandatory, GPS pin, rider can call customer, business can add delivery instructions. |
| OTP not received | SMS delay, DND, wrong number | SMS plus WhatsApp, resend once, support can verify by call as emergency, log every send. |
| Parcel too big for bike | Business under-declares weight/size | Weight and size at creation, rider can refuse pickup if parcel does not fit or is over 20 kg, support investigates, business warned. |
| Rain, traffic, festival | City reality | No time promise, city pause, rider can mark delayed with reason, support updates business. |
| Legal, gig worker status | Employment law is changing | Legal advice before launch, clear partner agreement, insurance, no promise of employment in the app. |
| Scaling too fast | Second city before first works | Gate: second city only after pilot metrics in Section 2 are met for 4 weeks. |

---

## 17. DEVELOPMENT PHASES AND MILESTONES

### Phase 0 — Decide, 1 week, no build
- Confirm the **[TO CONFIRM]** items: driver 80%, ₹5,000 cap, wallet hold timing, payout cycle, minimum recharge, city selection criteria.
- Legal: driver agreement, business terms, customer terms, DPDP, GST.
- Choose stack, maps provider, SMS/WhatsApp provider, payment gateway.
- **Exit:** A signed decisions sheet. No code before this.

### Phase 1 — MVP, 8 to 10 weeks, one city, manual where it helps
- Business signup and verification, manual review, wallet recharge, Business App order creation, mark Ready.
- Driver onboarding link, 24-48h, document upload, support approval, Driver App, accept, pickup, OTP delivery, undelivered and return.
- Assignment, nearest rider, manual accept, no rider message.
- Admin Web, dashboard, business and driver queues, order timeline, wallet passbook, pricing config.
- Customer tracking web, link, OTP, live location.
- API V1, whitelisted, create order, get status, webhooks.
- **Exit:** 10 businesses, 10 riders, 100 test orders, end to end, with real money in a test wallet, real OTP, real GPS, in the pilot city.

### Phase 2 — Pilot, 4 weeks, live with real businesses
- 30 businesses, 20 riders, live orders, daily supply review.
- Support playbook live, ticket system, audit log.
- Fix the top 10 bugs and the top 5 support reasons. Do not add features.
- **Exit:** Assignment success above 85% peak, delivered above 92%, disputes below 1%.

### Phase 3 — Harden, 4 to 6 weeks
- Bulk order via API, rate limits, webhook retries, sandbox.
- Driver incentives, configurable, referral, peak bonus.
- Expiry alerts, re-verification, suspension workflows.
- Reports, business monthly statement, driver weekly statement.
- **Exit:** 100 businesses, 50 riders, 500 orders a day, stable for 2 weeks.

### Phase 4 — Scale, after Phase 3 gates pass
- Second city, city config, pricing per city.
- iOS Driver App if needed, Hindi full localisation.
- Insurance, loss claims automation, business dashboard analytics.
- **Exit:** Second city pilot, same metrics as Phase 2.

### What is deliberately not in MVP
- COD, batching, multi-order, auto/taxi, intercity, warehousing, customer app, catalogue, inventory, chat, surge pricing, distance pricing, weight pricing. All are Phase 4 or later, or never.

---

## 18. METRICS, DASHBOARDS, AND UNIT ECONOMICS

**Daily, for Super Admin and support:**
- Orders created, Ready, Assigned, Delivered, Undelivered, Returned, No Rider, Cancelled.
- Assignment success rate, time from Ready to Accepted, median and p90.
- Time from Ready to Delivered, median, no promise shown.
- Undelivered rate, by business, by reason, by area.
- Wallet balance, low balance businesses, recharge volume.
- Riders online by hour, riders active, new riders approved, riders paused for expiry.
- Tickets open, resolved, by type, time to resolve.

**Weekly, for CTO:**
- Businesses active, new, churned, orders per business.
- Drivers active, new, churned, deliveries per driver, earnings per driver.
- Platform gross, driver pay, SMS/maps/gateway cost per order.
- Top 5 support reasons, top 5 failure reasons.

**Monthly, for founder:**
- City P&L, revenue, driver pay, costs, gross margin.
- Pilot targets from Section 2, met or not, and why.
- Decision: continue, fix supply, raise price, or pause.

---

## 19. FUTURE EXPANSION POSSIBILITIES

Only after the pilot city works. Expansion is not a rescue for a pilot that does not work.

1. **Vehicle expansion:** Auto for 20 to 50 kg, Tata Ace for bulk, after bike density is proven. Parcel limits change per vehicle, pricing changes per vehicle, assignment changes per vehicle. Do not add a vehicle by changing a dropdown, it is a new fleet.
2. **Distance and weight pricing:** Super Admin slabs, e.g. up to 5 km, 5 to 15 km, 15 to 45 km, and weight slabs, up to 5 kg, 5 to 10 kg, 10 to 20 kg. Build the config now, launch the slabs later, with 30 days notice.
3. **Batching:** Two orders per rider, same direction, same area, only when density is high enough that batching does not delay the first order. This needs a new assignment model, not a flag.
4. **Scheduled delivery:** Business books a rider for a time slot, e.g. 6 pm pickup. Useful for cakes, gifts, and pharmacies. Needs slot capacity, not just live assignment.
5. **COD, later, if ever:** If COD is added, it needs COD KYC, bank penny-drop, COD remittance, COD risk scoring, and a separate RTO rate, because COD orders have 25 to 30% RTO in Shiprocket data, versus about 2% for prepaid. The founder said no COD at launch, and this plan keeps it out of V1 for that reason.
6. **Intercity, later:** Hub to hub, overnight, with a different vehicle and a different promise. That is a different business, not an extension of intracity bike delivery.
7. **Warehousing and dark stores:** For a business that wants us to hold stock and dispatch. That is inventory, not delivery, and it needs a warehouse system.
8. **Business analytics:** Best time to order, best area, undelivered by customer, repeat customers, for the business, not for us to sell.
9. **Insurance:** Optional parcel insurance above ₹5,000, paid by the business per order, with a third-party insurer. This solves the cap problem without raising platform liability.
10. **White-label tracking:** Business can put its own logo on the tracking page, and its own SMS sender name, for a fee, after V1.

---

## 20. CTO + ENGINEER — CLOSING DIALOGUE

**CTO:** Abhishek, this is a simple business, and that is its strength. You do not need a marketplace, you do not need COD, you do not need a time promise. You need verified businesses, verified riders, a wallet that is never wrong, an OTP that is never skipped, and an honest message when no rider is available. If you get those five right in one city, you have a business. If you add features before those five work, you have a demo.

**Engineer:** And from the build side, the order state machine, the wallet ledger, and the assignment offer are the three things that must be correct on day one. Screens can be ugly in week one and fixed in week two. A wallet that deducts twice, or a delivery that closes without OTP, cannot be fixed by a redesign. Test those three with real money, real phones, and real bikes, before you invite 100 businesses.

**CTO:** Launch in one city, with 30 businesses and 20 riders, and watch the assignment rate every hour. If riders are not accepting, go and talk to them, do not add a feature. If businesses are not creating orders, go and watch them create one, do not add a dashboard. The product is the delivery, not the app.

**Engineer:** One last note. Keep the masterplan as the source of truth. When someone proposes a new feature, ask: does it fit the five rules in Part A? If it does not, write it in the Future section, not in the MVP. That discipline is what will get this launched.

---

## APPENDIX A — STATUS TAXONOMY, FOR THE API AND APPS

Use these exact status words everywhere, app, API, webhook, tracking, support. No synonyms.

Created, Ready, Assigning, No Rider, Assigned, Picked Up, Out for Delivery, Arrived, Delivered, Undelivered, Returning, Returned, Cancelled.

Undelivered reasons: Customer not reachable, Customer refused, Wrong address, OTP not provided, Customer asked to return, Rider could not find location.

Cancellation reasons: Business cancelled before assignment, No rider available, Duplicate order, Wrong details, Support cancelled.

---

## APPENDIX B — NOTIFICATIONS, CONCEPTUAL TEMPLATES

No exact SMS copy is locked here, because sender name and language need approval, but the moments are locked:

- Business, order Ready: "Order is Ready, looking for a rider."
- Business, rider assigned: "Rider [first name] assigned, pickup in progress."
- Business, delivered: "Delivered, OTP confirmed, ₹35 deducted."
- Business, undelivered: "Customer not reachable, returning parcel, ₹25 return deducted, total ₹60."
- Business, no rider: "No rider available at this moment, please retry."
- Customer, tracking: "Your parcel from [business] is on the way. Track here: [link]. OTP: [XXXX]. Share OTP only after you have the parcel."
- Rider, new job: "New job, pickup [business], drop [area], fee ₹28, Accept in 30 seconds."
- Rider, approved: "Your documents are approved, download the app and go online."
- Support, ticket: "Ticket created, we will update you in [time]."

Every notification must be logged, with time, channel, SMS or WhatsApp or push, and delivery status.

---

## APPENDIX C — LAUNCH CHECKLIST, ONE CITY

**Business readiness:**
- [ ] 30 businesses verified, with wallet recharged.
- [ ] API docs and sandbox tested by 2 businesses.
- [ ] Pricing set in Super Admin, ₹35 / ₹25, effective date set.

**Driver readiness:**
- [ ] 20 drivers approved, with DL and RC valid for at least 30 days.
- [ ] Driver App tested on low-end Android, in sunlight, on 2G.
- [ ] Payout bank accounts verified.

**System readiness:**
- [ ] Wallet deduction tested, forward, return, cancel, no rider, double-click, retry.
- [ ] OTP tested, correct, wrong 3 times, expired, no OTP no delivery.
- [ ] Assignment tested, accept, decline, timeout, next rider, no rider.
- [ ] Tracking link tested on 2G, no login.
- [ ] Support can see timeline, wallet, GPS, calls in one screen.

**Legal readiness:**
- [ ] Business terms, driver agreement, liability cap, OTP rule, no-promise rule, signed.
- [ ] DPDP consent, data retention, deletion path.
- [ ] GST invoice format confirmed.

**Go / No-go:**
- If any checklist item is red, do not launch. A delayed launch is better than a launch where money is wrong.

---

## APPENDIX D — SOURCES AND REFERENCES USED

This plan used public sources to ground the Shiprocket model and bike limits, not to copy prices. Prices in this plan are the founder's, ₹35 / ₹25, not Shiprocket's.

- Shiprocket signup and KYC: signup, OTP, 6-step onboarding, selfie, Express KYC by Aadhaar OTP or GSTIN OTP in about 30 minutes, manual KYC in 2 to 3 business days, company PAN mandatory. Support pages at shiprocket.in and support.shiprocket.in.
- Shiprocket prepaid wallet: recharge wallet, amount deducted when an order is processed, passbook shows freight, RTO freight, reversals, and credits. Shiprocket blog on prepaid model and passbook charges.
- Shiprocket RTO: courier re-attempts delivery up to 3 times, SMS and IVR for buyer response, then RTO, RTO charge borne by seller, based on weight and zone. Shiprocket RTO guide and SOP.
- Shiprocket lost shipment: unsecured lost shipment, order value or ₹5,000, whichever is less, with freight refund, on the 4th working day after lost date, per Shiprocket SOP.
- Bike parcel limits: Indian bike courier services cap bike parcels at up to 20 kg within size limit. WRI India urban freight paper lists two-wheelers at 30 kg maximum allowable cargo weight.
- OTP delivery: OTP-based delivery is standard in India for high-value and LPG deliveries, no OTP, no delivery, OTP sent to registered mobile only, shared only at the door after receiving the parcel.

All external facts above were checked on 5 November 2026. Prices, policies, and limits on vendor sites change, re-check before launch.

---

## APPENDIX E — GLOSSARY

- **RTO, Return to Origin:** A parcel that could not be delivered and is returned to the business.
- **NDR, Non-Delivery Report:** In Shiprocket, a report when delivery fails, with a re-attempt or RTO action. In this system, the equivalent is Undelivered, with a return.
- **OTP:** One-time password, 4 digits, for delivery confirmation.
- **Wallet:** Prepaid balance per business, used to pay delivery fees.
- **Whitelisted API:** API access granted only to verified businesses, by Super Admin, with a key.
- **Super Admin:** The platform owner role, who can set price, city, and policy.
- **Ready:** Business has packed and sealed the parcel and is ready for pickup.

---

*End of masterplan. No code was generated in this file, per the interview rule. Next step for the founder: confirm the [TO CONFIRM] items in Section 1, choose the pilot city, and approve Phase 0.*
