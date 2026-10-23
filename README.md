# StayManager

StayManager is a multi-workspace booking and operations platform built with Angular and Firebase.
It helps business owners manage resources, reservations, availability, members, public booking pages, and finance in one place.

## Product Scope

### Public Experience
- Public landing page
- Public workspace directory (for workspaces with public access enabled)
- Public booking flow with availability-aware request submission
- Arabic and English language support

### Owner / Team Experience
- Workspace onboarding and configuration
- Dashboard with operational KPIs
- Calendar views for reservations and availability
- Reservation management (create, confirm, complete, cancel, soft delete)
- Resource management (types, status, pricing setup)
- Members and roles management
- Finance overview with income, unpaid amounts, and workspace expenses
- Profile and theme preferences

## Tech Stack

- Angular 21 (standalone components + signals)
- Angular Material
- Firebase
  - Authentication
  - Firestore
  - Storage
- ngx-translate (English/Arabic localization)

## Project Structure

- `src/app/features/` : feature modules (dashboard, calendar, reservations, resources, finance, settings, public-home, public-booking)
- `src/app/core/` : models, DTOs, repositories, shared services
- `src/app/shell/` : main authenticated layout (sidebar/topnav)
- `public/i18n/` : localization files
- `firestore.rules` and `firestore.indexes.json` : Firestore security and indexes

## Getting Started

### Prerequisites
- Node.js LTS
- npm
- Angular CLI (optional globally)

### Install

```bash
npm install
```

### Run locally

```bash
npm run emulators
```

In a second terminal, serve the Angular app:

```bash
npm start
```

Default local URL:
- `http://localhost:4300`

The development environment uses the `demo-staymanager-local` Firebase project ID and connects Auth, Firestore, and Functions to local emulators. It does not connect to the configured production project. Firebase Storage is omitted from default deployment and emulator startup for now; Storage-dependent uploads are unavailable. Existing Storage rule tests remain available separately.

### Build

```bash
npm run build
npm run build:functions
```

### Tests

```bash
npm test
npm run test:functions
npm run test:rules
```

`npm run test:functions` starts local Auth, Firestore, and Functions emulators, runs callable integration tests, and shuts them down. FCM delivery is intentionally skipped in the emulator.

### Registration and Customer Search

MVP registration creates an email/password account in one step. An international phone number (for example, `+96171123456`) is required as customer contact information only, not as a login credential or proof of ownership. Firebase Auth enforces unique emails; a server-only `accountPhones` index enforces unique contact phones atomically, including simultaneous registrations. Existing Auth phone numbers are also checked for backwards compatibility. Phone ownership is not established, so numbers can be mistyped or claimed by someone else; support must resolve disputed contact details.

Email verification is disabled for the MVP: no automatic verification message is sent, and users can register, sign in, manage workspaces and book without confirming their email. Password reset remains available with a non-enumerating confirmation. Unchecked "Remember me" uses browser-session persistence. Login remains email/password only.

Future email verification support is retained, but gated off in three places. Enable all of them together and redeploy:

- `src/app/core/auth-policy.ts`: set `REQUIRE_EMAIL_VERIFICATION` to `true` for signup messages, prompts and protected routes.
- `functions/src/auth-policy.ts`: set the same switch to `true` for booking mutations and account lookups.
- `firestore.rules`: set `requireEmailVerification` to `true` inside `isVerified()`.

Google sign-in is available from the login and registration tabs using Firebase's account-selection popup. Existing complete profiles retain their UID, role, phone and consent. New Google identities must complete their name, required contact phone, account type and discovery choice through the `completeGoogleAccount` callable before entering protected routes. Profile completion is resumable after a reload; it does not send verification messages or set a password. Canceling the popup does not sign out the current session. Provider conflicts show an error rather than merging profiles by email in application code.

To enable Google in production, open Firebase Console > Authentication > Sign-in method > Google, enable the provider, choose the project support email, and save. Add the deployed host and any development host to Authentication > Settings > Authorized domains. Deploy `completeGoogleAccount` with the other Functions before releasing the frontend. Google does not supply the required contact phone in this flow, so it is collected explicitly. Actual Google OAuth needs a real enabled provider; local emulators use Google's simulated provider screen and do not contact Google.

The verified-email requirement for claiming historical reservations by matching an email address remains enforced even during MVP. Customers can still read their own bookings by requester UID; entering an unverified email must not grant access to another person's reservations.

Direct listing of `/users` is denied, including one-record queries. Owners use `lookupMemberByEmail` for exact-email member lookup; no phone is returned. Active owners/staff use `searchRegisteredCustomers` for a case-insensitive name prefix (at least two characters), exact email, or exact international phone. Results require explicit `customerSearchConsent`, are capped at ten, and are rate-limited per caller to 30/minute. Contact details are user-entered and unverified. Saved workspace guests remain workspace-scoped. Profile settings allow consent withdrawal. Consent defaults to off and must never be bulk-enabled during migration.

Before deploying:

- Enable Email/Password in Firebase Authentication. Phone sign-in is not used and may be disabled in Firebase Console.
- Configure authorized domains for the production site, password-reset email templates, quotas, and billing alerts.
- Enable Email Enumeration Protection. Review email action URLs and test delivery on the real domain.
- If an earlier version deployed `verifyAccountPhone`, delete that obsolete function as part of rollout. It is no longer exported or used. No phone-verification SDK, controls or code endpoints remain in this version.

For existing profiles, run this idempotent name-only backfill against the local emulator:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/scripts/backfill-user-search.mjs --project=demo-staymanager-local
```

For production, deploy the endpoints and identity-write rules before releasing the frontend:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
node functions/scripts/backfill-user-search.mjs --project=YOUR_PROJECT_ID --production
```

The production backfill requires Application Default Credentials. It only populates searchable names; it does not grant consent, verify contacts, or assign phone numbers. Wait for the `customerSearchConsent + nameLower` index to finish building before testing directory search. Firebase Storage is not part of the default deployment, so Storage Console initialization is not required for this release.

## Environment Configuration

Environment files are in `src/environments/`.

- `environment.ts` : local/dev environment
- `environment.production.ts` : production environment
- `environment.example.ts` : template

Set Firebase project config values before running or deploying.

## Firestore and Security

- Firestore rules are defined in `firestore.rules`.
- Indexes are defined in `firestore.indexes.json`.
- Deploy with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Hosting Deployment

Build and deploy:

```bash
npm run build
firebase deploy --only hosting
```

## Localization

- Main dictionaries:
  - `public/i18n/en.json`
  - `public/i18n/ar.json`
- Public-home specific keys are under `PUBLIC_HOME`.
- Keep keys synchronized between both languages when adding new UI labels.

## Notes for Contributors

- Preserve workspace scoping in all Firestore reads/writes.
- Keep role-based access checks consistent with rules.
- Prefer repositories in `src/app/core/services/` for data access.
- Add both English and Arabic translations for all new user-facing text.
- Validate changes with `npm run build` before committing.

## Current Status

This repository is actively evolving toward a full business-owner operations suite.
Core booking and workspace management are implemented; advanced finance automation, communications, and deeper analytics are planned next.
