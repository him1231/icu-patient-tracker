# ICU Patient Tracker

A lightweight ICU rehabilitation / mobility tracker built with **React + Vite + Firebase Firestore**.

It is designed for quick ward-level use:
- see all beds at a glance
- admit patients into beds
- record daily mobility / rehab progress
- transfer beds
- mark patients as off-program or discharged
- export Excel reports for patient outcomes and monthly stats

> [!WARNING]
> This project currently connects **directly from the browser to Firestore** and the included `firestore.rules` are **fully open** (`allow read, write: if true;`).
> 
> That is fine for internal prototyping / demos, but **not safe for real production clinical deployment**.
> If you plan to use this with real patient data, you should add:
> - Firebase Authentication
> - proper Firestore access rules
> - audit logging
> - environment / data governance suitable for your organisation

---

## Features

- **32-bed dashboard** with occupied / empty / off-program / intubated visual states
- **Patient admission modal** with:
  - HN number
  - gender
  - specialty
  - diagnosis
  - Clinical Frailty Scale (CFS)
  - admission date
- **Daily rehab record entry** with:
  - Level 1-4
  - IMS (ICU Mobility Scale)
  - MRCSS / MRC sum score inputs
  - exercise selection
  - intubation status
- **Backfill support** for previous dates
  - if a record does not exist for that date, the UI prefills from the latest previous record
- **Bed transfer flow** between occupied and empty beds
- **Patient status management**
  - on program
  - off program
  - discharged
  - undo discharge from admin page
- **Admin page** for maintaining dropdown options
  - exercise options
  - specialty options
  - diagnosis options
- **Excel exports**
  - patient outcome report
  - monthly level / exercise statistics
- **Lightweight multi-user refresh**
  - clients poll Firestore every 30 seconds and reload when `meta/lastEdit` changes

---

## Tech Stack

- **Frontend:** React 19 + Vite
- **Routing:** React Router
- **Database:** Firebase Firestore
- **Export:** SheetJS / `xlsx`
- **Deployment:** GitHub Pages via GitHub Actions

---

## Project Structure

```text
src/
  components/
    AdminPage.jsx
    AdmitModal.jsx
    BedCard.jsx
    Dashboard.jsx
    ExportButton.jsx
    PatientModal.jsx
  firebase.js
  main.jsx
```

Key files:

- `src/firebase.js` — Firebase app + Firestore initialization from Vite env vars
- `src/components/Dashboard.jsx` — main bed dashboard and refresh logic
- `src/components/PatientModal.jsx` — daily record entry / discharge / off-program / resume
- `src/components/AdminPage.jsx` — patient admin + configurable option lists
- `src/components/ExportButton.jsx` — Excel export logic
- `.github/workflows/deploy.yml` — GitHub Pages deployment workflow
- `vite.config.js` — Vite config including GitHub Pages base path

---

## Firestore Data Model

This app reads / writes these collections:

### `patients`
One document per admission instance.

Typical fields:

```json
{
  "hn": "123456",
  "gender": "M",
  "specialty": "Respiratory",
  "diagnosis": "Pneumonia",
  "cfs": 4,
  "admissionDate": "2026-04-15",
  "dischargeDate": null,
  "offProgram": false,
  "offProgramDate": null,
  "bedNumber": 8,
  "active": true
}
```

### `dailyRecords`
One document per patient per date, using an id like:

```text
<patientId>_<YYYY-MM-DD>
```

Typical fields:

```json
{
  "patientId": "123456_1713170000000",
  "date": "2026-04-15",
  "level": 3,
  "ims": 5,
  "mmrc": [5,5,4,4,3,3,5,5,4,4,3,3],
  "exercise": "Chair sitting",
  "intubated": false,
  "savedAt": "2026-04-15T08:15:00.000Z"
}
```

### `config`
Stores editable dropdown options.

Documents used by the app:
- `exerciseOptions`
- `specialtyOptions`
- `diagnosisOptions`
- `mmrcItems` (seeded by dashboard init)

### `meta`
Used for lightweight refresh signalling.

Document used by the app:
- `lastEdit`

---

## Local Development

### Requirements

- Node.js **20+** recommended
- npm
- a Firebase project with **Firestore** enabled

### 1) Install dependencies

```bash
npm install
```

### 2) Create local env file

Copy the example file:

```bash
cp .env.example .env
```

Then fill in your Firebase web app config values.

### 3) Start dev server

```bash
npm run dev
```

### 4) Build for production

```bash
npm run build
```

### 5) Lint

```bash
npm run lint
```

---

## Required Environment Variables

The app reads Firebase config from Vite env vars in `src/firebase.js`.

Create a `.env` (or `.env.local`) file locally with these keys:

| Variable | Required | Description |
|---|---:|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Web App API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | e.g. `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | e.g. `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase Web App app ID |

Example:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

> These are **build-time variables** for Vite. They must exist both:
> - locally when you run `npm run dev` / `npm run build`
> - in GitHub Actions secrets when you deploy via GitHub Pages

---

## Firebase Setup

1. Create a Firebase project
2. Add a **Web App** in Firebase console
3. Enable **Cloud Firestore**
4. Copy the Firebase web config into your `.env`
5. (Optional but recommended) deploy your own Firestore rules

The app seeds some default config docs automatically on first load if they do not exist.

---

## Deployment

### GitHub Pages (current setup)

This repo already includes a GitHub Actions workflow at:

```text
.github/workflows/deploy.yml
```

It deploys the built `dist/` folder to GitHub Pages on push to the `master` branch.

### Before deploying a fork

If you fork this repo and deploy it under a different GitHub repository name, update:

```js
// vite.config.js
base: '/your-repo-name/'
```

The router basename is derived from the Vite base URL, so you do **not** need to edit a second path in `src/main.jsx`.

If you deploy to the root of a domain instead of GitHub Pages project path, use:

```js
base: '/'
```

### GitHub Actions secrets required

Add these repository secrets in:

**Settings → Secrets and variables → Actions**

Use the exact names below:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### GitHub Pages setup

In GitHub:

1. Go to **Settings → Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `master`
4. GitHub Actions will build and publish the app

---

## Notes for Forks / Customisation

### Bed count
The dashboard is currently fixed to **32 beds** in `Dashboard.jsx`.

If you need a different bed count, update this line:

```js
Array.from({ length: 32 }, (_, i) => i + 1)
```

### Polling interval
The dashboard checks Firestore for remote edits every **30 seconds**.

This is controlled by:

```js
const POLL_INTERVAL = 30000
```

### Current architecture limitation
This app is a **frontend-only Firestore client**.
There is no backend API and no authentication layer yet.

That makes it simple to deploy, but you should treat it as a lightweight internal tool / starter project rather than a hardened medical production system.

---

## Available Scripts

```bash
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview built app locally
npm run lint     # lint source files
```

---

## Security Reminder

If you make this project public on GitHub, **do not commit your real `.env` file**.

This repo already ignores `.env`, and you should keep it that way.
Use:
- `.env.example` for placeholders
- GitHub Actions secrets for deployment
- your own Firebase project for forks / clones
