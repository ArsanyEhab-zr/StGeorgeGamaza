# Premium Coptic Orthodox Deacons Service Application ⛪
> A state-of-the-art, offline-first deacons service management system with end-to-end client-side encryption and multi-tenant data isolation.

---

## 🚀 Overview

This application is designed specifically for Coptic Orthodox Deacon congregations (Osras) to manage deacon directories, attendance, visitations, exams/grading, and curriculum files. 

For full, comprehensive details about the architecture, security isolation, screen breakdowns, and database synchronizations, please refer to the main documentation:

👉 **[DOCUMENTATION.md](file:///d:/5dmaty/kids-service-app/DOCUMENTATION.md)**

---

## 🛠️ Quick Start

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Configuration
Create a `.env` file in the root directory:
```env
VITE_ENCRYPTION_SECRET=your_secure_encryption_key
```

### 3. Installation & Local Development
Install dependencies and run the Vite development server:
```bash
npm install
npm run dev
```

### 4. Build for Production
To compile the web build:
```bash
npm run build
```

To sync changes to the native Android app container via Capacitor:
```bash
npx cap sync
npx cap open android
```

---

## 🔒 Key Features Detailed in Documentation
*   **Zero-Knowledge Architecture:** AES-256 client-side encryption of deacon details before sync to Firebase Firestore.
*   **Offline-First:** Local storage in IndexedDB (via Dexie.js) synced bi-directionally with Firestore when internet is available.
*   **Multi-Tenancy:** Separation of services and deacon classes (Osras) using secure `syncKey` identifiers.
*   **Integrated Media:** Cloudinary uploads for deacon photos, booklets, and audio hymns library.
*   **Role-Based Security:** Guards protecting Servant vs. Parent routes.
