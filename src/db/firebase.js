// src/db/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";
// 🌟 1. استدعاء مكتبات الـ App Check للحماية القصوى
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// 🌟 بيانات سيرفرك إنت يا هندسة (Khedmety App)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 1. تشغيل فايربيز
const app = initializeApp(firebaseConfig);

// 🌟 2. تفعيل الحماية (App Check) - تم إيقافها مؤقتاً لتسهيل التطوير
if (typeof window !== 'undefined') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// try {
//   initializeAppCheck(app, {
//     provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_RECAPTCHA_KEY),
//     isTokenAutoRefreshEnabled: true // مهم جداً عشان التوكن يتجدد لوحده وميفصلش على الخدام
//   });
// } catch (error) {
//   console.error("AppCheck failed to initialize:", error);
// }

// 3. تشغيل الإحصائيات
export const analytics = getAnalytics(app);

// 4. 🌟 تشغيل وتصدير قاعدة البيانات بالاسمين عشان نرضي كل ملفات المشروع!
// 🌟 تفعيل قاعدة البيانات الأوفلاين (Offline Persistence) كشرط أساسي للأداء باستخدام API الجديد
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export const firestore = db; // السطر ده هيخلي ملف sync.js يشتغل فوراً

// 5. المخزن (عشان الـ PDF بعدين)
export const storage = getStorage(app);