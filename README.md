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

The development environment uses the `demo-staymanager-local` Firebase project ID and connects Auth, Firestore, Functions, and Storage to local emulators. It does not connect to the configured production project.

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
