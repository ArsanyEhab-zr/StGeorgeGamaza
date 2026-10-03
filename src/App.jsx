import React, { useState, useEffect, Suspense, lazy } from 'react';
import useNetworkStatus from './hooks/useNetworkStatus';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChildProfile = lazy(() => import('./pages/ChildProfile'));
const ChildInfo = lazy(() => import('./pages/ChildInfo'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Visitation = lazy(() => import('./pages/Visitation'));
const ExamsManager = lazy(() => import('./pages/ExamsManager'));
const InfoDirectory = lazy(() => import('./pages/InfoDirectory'));
const ChurchHierarchy = lazy(() => import('./pages/ChurchHierarchy'));
const Login = lazy(() => import('./pages/Login'));
const ParentLogin = lazy(() => import('./pages/ParentLogin'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const SignUp = lazy(() => import('./pages/SignUp'));
const SystemAdmin = lazy(() => import('./pages/SystemAdmin'));
const PdfViewer = lazy(() => import('./pages/PdfViewer'));
const QrScannerPoC = lazy(() => import('./pages/QrScannerPoC'));
const QrAttendance = lazy(() => import('./pages/QrAttendance'));
const QrCardGenerator = lazy(() => import('./pages/QrCardGenerator'));
const MasterDashboard = lazy(() => import('./pages/MasterDashboard'));
const TrackingDashboards = lazy(() => import('./pages/TrackingDashboards'));
const ServantsFollowUp = lazy(() => import('./pages/ServantsFollowUp'));
const ServantsMonthlyReport = lazy(() => import('./pages/ServantsMonthlyReport'));
const ServantSelfCheckIn = lazy(() => import('./pages/ServantSelfCheckIn'));


import BottomNav from './components/BottomNav';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';

// 🌟🌟🌟 استدعاءات نظام التحديث والإشعارات 🌟🌟🌟
import BackButtonHandler from './components/BackButtonHandler';
import NotificationManager from './components/NotificationManager';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { firestore } from './db/firebase';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Download, AlertTriangle, Rocket } from 'lucide-react';

const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const AddEventPage = lazy(() => import('./pages/AddEventPage'));
const EventDetailsPage = lazy(() => import('./pages/EventDetailsPage'));

// 🚨🚨🚨 رقم النسخة الحالية 🚨🚨🚨
const CURRENT_APP_VERSION = "1.4";

// 🌟🌟🌟 نظام الحماية والإجبار على التحديث 🌟🌟🌟
function UpdateChecker({ children }) {
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [downloadLink, setDownloadLink] = useState("");

  useEffect(() => {
    const checkVersionAndNotify = async () => {
      try {
        // 1. طلب تصريح الإشعارات
        if (Capacitor.isNativePlatform()) {
          await LocalNotifications.requestPermissions();
        }

        // 2. إشعار الترحيب وإشعار نجاح التحديث
        const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
        const lastSavedVersion = localStorage.getItem('lastSavedVersion');

        if (!hasSeenWelcome) {
          if (Capacitor.isNativePlatform()) {
            await LocalNotifications.schedule({
              notifications: [{
                title: "أهلاً بيك في الخدمة! ⛪",
                body: "نورت الأبلكيشن يا مخدوم، ربنا يبارك تعب محبتك.",
                id: 1,
                schedule: { at: new Date(Date.now() + 3000) },
                smallIcon: "ic_launcher"
              }]
            });
          }
          localStorage.setItem('hasSeenWelcome', 'true');
        } else if (lastSavedVersion && lastSavedVersion !== CURRENT_APP_VERSION) {
          if (Capacitor.isNativePlatform()) {
            await LocalNotifications.schedule({
              notifications: [{
                title: "تم التحديث بنجاح! 🎉",
                body: `مبروك! إنت دلوقتي شغال بأحدث نسخة من الأبلكيشن (${CURRENT_APP_VERSION}).`,
                id: 2,
                schedule: { at: new Date(Date.now() + 2000) },
                smallIcon: "ic_launcher"
              }]
            });
          }
        }
        
        // حفظ رقم النسخة الحالية عشان المقارنة المرة الجاية
        localStorage.setItem('lastSavedVersion', CURRENT_APP_VERSION);

        // 3. مقارنة ذكية للأرقام (SemVer)
        const isNewVersionAvailable = (currentV, latestV) => {
          if (!latestV) return false;
          const currParts = currentV.split('.').map(Number);
          const latestParts = latestV.split('.').map(Number);
          
          for (let i = 0; i < Math.max(currParts.length, latestParts.length); i++) {
            const curr = currParts[i] || 0;
            const latest = latestParts[i] || 0;
            if (latest > curr) return true;
            if (latest < curr) return false;
          }
          return false;
        };

        // 4. فحص الفايربيز بدون كاش (Live Check)
        const docRef = doc(firestore, "System", "AppConfig");
        let docSnap;
        try {
            // محاولة جلب النسخة الحقيقية من السيرفر لتخطي النسخ المخبأة (Cache)
            docSnap = await getDocFromServer(docRef);
        } catch {
            // لو مبقاش فيه نت قاطع هيستخدم الكاش القديم
            docSnap = await getDoc(docRef);
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          // مقارنة دقيقة بدلاً من != العادية
          if (isNewVersionAvailable(CURRENT_APP_VERSION, data.latestVersion)) {
            setDownloadLink(data.updateLink || "");
            setNeedsUpdate(true); // اقفل الشاشة

            // ابعتله إشعار إن فيه تحديث
            if (Capacitor.isNativePlatform()) {
              await LocalNotifications.schedule({
                notifications: [{
                  title: "تحديث جديد متاح! 🚀",
                  body: "نزلنا نسخة جديدة مهمة جداً، لازم تحدث الأبلكيشن عشان تكمل خدمة.",
                  id: 3,
                  schedule: { at: new Date(Date.now() + 1000) },
                  smallIcon: "ic_launcher"
                }]
              });
            }
          }
        }
      } catch (error) {
        console.log("Offline or error checking updates:", error);
      }
    };

    checkVersionAndNotify();
  }, []);

  // 🚫 لو محتاج تحديث، الشاشة دي هتقفل عليه الأبلكيشن تماماً
  if (needsUpdate) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-900 flex items-center justify-center p-4 font-sans text-center" dir="rtl">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-500 relative z-[100000]">
          <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-20"></div>
            <AlertTriangle size={48} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-3 flex justify-center items-center gap-2">
            تحديث هام جداً! <Rocket className="text-indigo-500" size={24} />
          </h2>
          <p className="text-sm font-bold text-slate-500 mb-8 leading-relaxed">
            عشان نضمن سرعة الأبلكيشن وأمان بيانات المخدومين، نزلنا تحديث جديد. اضغط تحت للتحميل والتثبيت (التحديث مش هيمسح بياناتك).
          </p>
          <a
            href={downloadLink}
            target="_blank"
            rel="noreferrer"
            className="w-full bg-linear-to-r from-indigo-600 to-blue-600 text-white py-4 rounded-xl font-black shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 flex justify-center items-center gap-2 transition-all"
          >
            <Download size={20} /> تحميل التحديث الآن
          </a>
        </div>
      </div>
    );
  }

  // ✅ لو النسخة حديثة، افتحله الأبلكيشن عادي
  return children;
}


// 🌟 Servant Protected Route Guard
function ServantProtectedRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('currentSyncKey');
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// 🌟 Parent Protected Route Guard
function ParentProtectedRoute({ children }) {
  const isParentAuthenticated = !!localStorage.getItem('parentChildId');
  return isParentAuthenticated ? children : <Navigate to="/parent-login" replace />;
}


function App() {
  const location = useLocation();

  // 🌐 Global network listener — auto-syncs when coming back online
  useNetworkStatus();

  // السطر ده بيقرا هل الخادم مسجل دخول ولا لأ
  const isAuthenticated = !!localStorage.getItem('currentSyncKey');

  // 🌟 1. الشروط بتاعة الشريط السفلي (BottomNav)
  // الصفحات اللي مش عايزين الشريط يظهر فيها (زي اللوجين وصفحات المهام الكبيرة)
  const hideBottomNavPages = [
    '/dashboard', '/login', '/signup', '/admin', '/pdf-viewer', '/master-dashboard', '/info-directory',
    '/calendar', '/add-event', '/parent-login', '/parent-dashboard', '/qr-scan', '/qr-attendance', '/generate-cards'
  ];
  // بنعمل فحص إضافي عشان مسار الـ event اللي بياخد ID متغير (/event/123)
  const isEventDetailsPage = location.pathname.startsWith('/event/');

  const showBottomNav = isAuthenticated && !hideBottomNavPages.includes(location.pathname) && !isEventDetailsPage;

  // 🌟 2. الشروط بتاعة الفوتر (Footer)
  // إنت قولت إنك مش عايز الفوتر يبان في أي حتة غير في الهوم بس (المسار '/')
  const showFooter = isAuthenticated && location.pathname === '/';

  const isSuperAdminImpersonating = localStorage.getItem('isSuperAdminImpersonating') === 'true';
  const assignedOsra = localStorage.getItem('assignedOsra') || 'الأسرة المحددة';

  const handleExitImpersonation = () => {
    const masterKey = localStorage.getItem('masterSyncKey');
    if (masterKey) {
        localStorage.setItem('currentSyncKey', masterKey);
        localStorage.removeItem('isSuperAdminImpersonating');
        localStorage.removeItem('masterSyncKey');
        localStorage.removeItem('assignedOsra');
        window.location.href = '/';
    }
  };

  return (
    <UpdateChecker>
      <BackButtonHandler />
      <NotificationManager />
      <ScrollToTop />
      
      {/* 🌟 Escape Hatch Banner for Super Admin */}
      {isSuperAdminImpersonating && (
        <div className="bg-gradient-to-r from-red-600 to-red-800 text-white p-3 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 z-[9999] relative">
            <div className="flex items-center gap-2 font-black text-sm text-center sm:text-right">
                <AlertTriangle size={18} className="text-amber-400" />
                أنت الآن تتصفح بيانات ({assignedOsra}) بصلاحية خادم
            </div>
            <button onClick={handleExitImpersonation} className="bg-white text-red-700 px-4 py-1.5 rounded-full text-xs font-black shadow-md hover:bg-red-50 transition-colors shrink-0">
                🔙 إنهاء التصفح والعودة للوحة الكاهن
            </button>
        </div>
      )}

      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
        <Routes>
          {/* 🌟 مسارات الدخول العامة */}
          <Route path="/login" element={<Login />} />
          <Route path="/parent-login" element={<ParentLogin />} />
          <Route path="/signup" element={<SignUp />} />

          {/* 🌟 مسارات الخدام المحمية */}
          <Route path="/" element={<ServantProtectedRoute><Home /></ServantProtectedRoute>} />
          <Route path="/attendance" element={<ServantProtectedRoute><Attendance /></ServantProtectedRoute>} />
          <Route path="/tracking-dashboards" element={<ServantProtectedRoute><TrackingDashboards /></ServantProtectedRoute>} />
          <Route path="/visitation" element={<ServantProtectedRoute><Visitation /></ServantProtectedRoute>} />
          <Route path="/exams" element={<ServantProtectedRoute><ExamsManager /></ServantProtectedRoute>} />
          <Route path="/info-directory" element={<ServantProtectedRoute><InfoDirectory /></ServantProtectedRoute>} />

          <Route path="/dashboard" element={<ServantProtectedRoute><Dashboard /></ServantProtectedRoute>} />
          <Route path="/servant-checkin" element={<ServantProtectedRoute><ServantSelfCheckIn /></ServantProtectedRoute>} />
          <Route path="/profile/:id" element={<ServantProtectedRoute><ChildProfile /></ServantProtectedRoute>} />
          <Route path="/info/:id" element={<ServantProtectedRoute><ChildInfo /></ServantProtectedRoute>} />

          <Route path="/hierarchy" element={<ServantProtectedRoute><ChurchHierarchy /></ServantProtectedRoute>} />
          <Route path="/admin" element={<ServantProtectedRoute><SystemAdmin /></ServantProtectedRoute>} />
          <Route path="/admin/servants-followup" element={<ServantProtectedRoute><ServantsFollowUp /></ServantProtectedRoute>} />
          <Route path="/admin/servants-report" element={<ServantProtectedRoute><ServantsMonthlyReport /></ServantProtectedRoute>} />

          {/* 🌟 مسارات المهام والأجندة */}
          <Route path="/calendar" element={<ServantProtectedRoute><CalendarPage /></ServantProtectedRoute>} />
          <Route path="/add-event" element={<ServantProtectedRoute><AddEventPage /></ServantProtectedRoute>} />
          <Route path="/event/:id" element={<ServantProtectedRoute><EventDetailsPage /></ServantProtectedRoute>} />

          {/* 📱 QR Scanner PoC (Phase 1) */}
          <Route path="/qr-scan" element={<ServantProtectedRoute><QrScannerPoC /></ServantProtectedRoute>} />

          {/* 📱 QR Attendance — Production (Phase 2) */}
          <Route path="/qr-attendance" element={<ServantProtectedRoute><QrAttendance /></ServantProtectedRoute>} />

          {/* 🏴 QR Card Generator (Phase 5) */}
          <Route path="/generate-cards" element={<ServantProtectedRoute><QrCardGenerator /></ServantProtectedRoute>} />

          {/* 🌟 مسارات أولياء الأمور المحمية */}
          <Route path="/parent-dashboard" element={<ParentProtectedRoute><ParentDashboard /></ParentProtectedRoute>} />

          {/* صفحات عامة */}
          <Route path="/pdf-viewer" element={<PdfViewer />} />
          <Route path="/master-dashboard" element={<ServantProtectedRoute><MasterDashboard /></ServantProtectedRoute>} />
        </Routes>
      </Suspense>

      {/* 🌟 إظهار الفوتر والشريط السفلي بناءً على الشروط اللي فوق */}
      {showFooter && <Footer />}
      {showBottomNav && <BottomNav />}
    </UpdateChecker>
  );
}

export default App;