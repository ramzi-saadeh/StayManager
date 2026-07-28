# Kafar Banin Municipality Website

Welcome to the official repository for the Kafar Banin Municipality website. This is a modern, responsive web application built with Angular 21, designed to serve the community and showcase our village.

## 🚀 Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- Angular CLI (`npm install -g @angular/cli`)

### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm start` to launch the development server.
4. Open `http://localhost:4200` in your browser.

---

## 🛠 Content Management (How to update the website)

To ensure easy maintenance without redeploying code, several key areas of the website are powered by JSON files located in the `public/data/` directory.

### 1. Hero Slider & Community Gallery
Manage the images that appear in the top hero section and the scrolling gallery.
- **File**: `public/data/hero-slider.json`
- **Fields**:
  - `heroSlides`: Background images for the hero section (carousel).
  - `sliderThumbnails`: Small images shown in the infinite scroll gallery.
  - `sliderFullImages`: The full-size images that open when a thumbnail is clicked.

### 2. Home Page Highlights & Contact Info
Update the village highlights (cards) and the general municipality contact details at the bottom of the page.
- **File**: `public/data/home-content.json`
- **Fields**:
  - `highlights`: Array of objects with `image`, `title`, and `description`.
  - `contactInfo`: Address, phone, email, and office hours for the footer section.

### 3. Language & Translations
The website supports English and Arabic. Every text piece can be updated here.
- **English**: `public/i18n/en.json`
- **Arabic**: `public/i18n/ar.json`
- **Tip**: To update a label (e.g., "President's Number"), find the key in both files and change the value.

### 4. Direct CTA Contact Details
The direct contact numbers for the President's Office and Developer are currently hardcoded in the HTML for immediate visibility.
- **File**: `src/app/components/home/home.component.html`
- **Search for**: `cta-contact-grid`

---

## ⚙️ Development

### Scripts
- `npm start`: Runs the dev server (`ng serve`).
- `npm run build`: Generates production build in `dist/`.
- `npm test`: Runs unit tests with Vitest.

### Tech Stack
- **Framework**: Angular 21 (Signals, Standalone Components).
- **Styling**: Vanilla CSS (Custom properties for theming).
- **Backend**: Firebase Firestore (for dynamic news, tickers, and community members).
- **Translations**: ngx-translate.

### Firebase Configuration
The project is linked to the `kafar-banin-2025` project. Config is located in `src/app/app.config.ts`.

---

## 📅 Maintenance History
This README was enhanced in February 2026 to include detailed management instructions.
