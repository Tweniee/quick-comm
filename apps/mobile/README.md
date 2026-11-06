# Tweniee — Flutter apps

One Flutter project, two apps (entry points):

| App | Entry point | Who |
|---|---|---|
| Driver (rider) app | `lib/main_driver.dart` | Approved delivery partners |
| Business app | `lib/main_business.dart` | Verified businesses |

```bash
flutter pub get
# Android emulator talks to the host backend at 10.0.2.2
flutter run -t lib/main_driver.dart   --dart-define=API_URL=http://10.0.2.2:4000
flutter run -t lib/main_business.dart --dart-define=API_URL=http://10.0.2.2:4000
# Release APKs
flutter build apk -t lib/main_driver.dart   --dart-define=API_URL=https://api.yourdomain.in
flutter build apk -t lib/main_business.dart --dart-define=API_URL=https://api.yourdomain.in
```

Other build-time settings (`--dart-define`):

| Name | Used for |
|---|---|
| `WEB_URL` | Web portal (business signup, Razorpay checkout, API keys, branch management open there). Default `http://10.0.2.2:3000`. |
| `SUPPORT_PHONE` | "Call support" buttons in both apps. Leave unset and the button explains it isn't configured. |

Screens follow the Tweniee design (navy + teal, Space Grotesk headings, Inter body):

- Driver app D01–D16: login, offline / online / paused home, offer, step-by-step job (to pickup, confirm pickup, to drop, arrived with wait timer and call log, OTP keypad, delivered, undelivered reasons, return with code), earnings, documents with renewal photo upload (`image_picker`, camera), help.
- Business app B05–B18: login, under review, home with today's tiles, orders list with search, new order with the low-balance state, one order screen that changes with the status (B09–B14), wallet passbook, recharge, branches, support tickets. Signup (B01–B04) and the API page stay on the web portal and open from the app.

Both currently share one Android application id (`com.quickdelivery.quick_delivery`). Before publishing to the Play Store, add
two product flavors (e.g. `driver` → `com.quickdelivery.partner`, `business` → `com.quickdelivery.business`) so both can be installed side by side.
App names follow the Tweniee design: **Tweniee Partner** (driver app) and **Tweniee Business**. Icons and package names are still to be decided.

Driver app design rules from the masterplan: offline by default, one live order only, big high-contrast buttons, Hindi/English,
location only while online (every 30 s waiting, 15 s on a job), actions queued offline and synced with their original time.
