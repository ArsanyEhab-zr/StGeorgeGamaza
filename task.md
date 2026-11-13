# خطة الإنقاذ المعماري الشامل (6-Phase Master Recovery Plan)

## المرحلة 1: إصلاح `src/utils/syncDeadline.js` و `src/db/childSync.js` و `src/db/sync.js` (إلغاء المهلات القصيرة، منع التعارض، والمزامنة التدريجية)
- [x] رفع مهلة الأمان الفردية إلى `30000ms` (30 ثانية) وإلغاء رمي أخطاء `انتهت مهلة المزامنة الشاملة` / `انتهت مهلة مزامنة الفصول` / `انتهت مهلة تحميل الهيكل` التي توقف بقية الفصول
- [x] فصل `pullStructureFromCloud()` لقراءة `System/mainConfig` مباشرة بدون انتظار أقفال مزامنة الفصول، وتصدير `syncWithCloud(syncKey)` للمزامنة الفورية لفصل واحد
- [x] جعل `syncScopedClassesFromCloud` تدريجية على دفعات من **3 فصول** (`batchSize = 3`) بحيث تتحدث الأرقام في الواجهة فوراً بعد كل دفعة، مع تخطي أي فصل بطيء عبر `console.warn` واستكمال باقي الفصول

## المرحلة 2: إيقاف إغراق Firestore بمستمعات `onSnapshot` المتعددة (`src/hooks/useChildrenRealtimeSync.js` و `src/hooks/useScopedNotifications.js`)
- [x] منع فتح مستمعات `onSnapshot` لجميع الفصول الـ 19 في وقت واحد (57 مستمع متزامن يخنق WebChannel)
- [x] تفعيل `onSnapshot` الفوري فقط عندما يكون النطاق فصلاً واحداً نشطاً (`keys.length === 1` — خادم فصل أو وضع الدخول كخادم للأسرة)
- [x] في وضع الكاهن / أمين الخدمة / أمين المرحلة (`keys.length > 1`)، الاعتماد على المزامنة التدريجية (دفعات من 3 فصول) مع مستمع خفيف واحد على `System/mainConfig`

## المرحلة 3: إصلاح وضع `الدخول كخادم للأسرة` (Servant Impersonation Mode) بالكامل
- [x] إضافة دوال إدارة التصفح كخادم (`getImpersonatedOsra`, `startOsraImpersonation`, `exitOsraImpersonation`) في `src/utils/notificationScopeEngine.js` ودعم `impersonated_osra` و `isSuperAdminImpersonating`
- [x] تحديث `resolveServantNotificationScope` و `Home.jsx` بحيث يتحول العرض فوراً إلى **شاشة خادم الفصل الواحد** (`isMaster = false`) عند تفعيل `الدخول كخادم للأسرة` مع عرض اسم الفصل وإحصائياته وبطاقات الخادم (تسجيل الغياب، تسجيل الحضور بالـ QR، خريطة الافتقاد، دليل المخدومين، لوحة التحكم)
- [x] تشغيل مزامنة فورية للفصل المختار `syncWithCloud(impersonatedOsra.syncKey)` عند الدخول كخادم للأسرة
- [x] ربط صفحات `Attendance.jsx` و `QrAttendance.jsx` و `Visitation.jsx` و `InfoDirectory.jsx` و `Dashboard.jsx` تلقائياً بـ `impersonatedOsra.syncKey`، وتحديث زر `إنهاء التصفح والعودة للوحة الكاهن` في `App.jsx`

## المرحلة 4: ضمان توحيد قوائم المخدومين والتعديلات والحذف بين جميع الخدام (`src/db/childSync.js`, `src/db/sync.js`, `src/utils/churchDataEngine.js`)
- [x] التأكد من رفع تعديلات المخدومين وحذفهم (`isDeleted: true`) فوراً إلى `Osras/{syncKey}/children/{id}` في Firestore وتطبيقها محلياً في Dexie
- [x] ضمان اعتماد جميع الشاشات على `churchDataEngine.js` كمصدر وحيد للحقيقة (SSOT) مع استبعاد السجلات المحذوفة واليتيمة

## المرحلة 5: توحيد جميع الأرقام، إظهار شبكة الفصول دائماً، إصلاح اسم الشهر القبطي، وتحسين عرض الموبايل
- [x] توفير قائمة فصول افتراضية (`DEFAULT_CHURCH_OSRAS`) في `notificationScopeEngine.js` لضمان عدم اختفاء الفصول أبداً في `MasterDashboard.jsx` و `Home.jsx` حتى قبل اكتمال جلب الهيكل من السحابة
- [x] إصلاح `formatCopticDate` في `src/utils/serviceWeek.js` باستخدام مصفوفة الشهور القبطية العربية الصريحة (`توت`، `بابه`، `هاتور`، `كيهك`، `طوبة`، `أمشير`، `برمهات`، `برمودة`، `بشنس`، `بؤونة`، `أبيب`، `مسرى`، `نسئ`)
- [x] تحسين ترويسة وشارات `WeeklyClassActivitySummary.jsx` على شاشات الموبايل لمنع انضغاط النص عمودياً

## المرحلة 6: التحقق الشامل والاختبارات والبناء النهائي (`tests/*` و `npm run build`)
- [x] القضاء على وميض `0 / 0` و `0 مخدوم` عند فتح الصفحات عبر حفظ واسترجاع لقطة الأعداد الفورية (`church_counts_snapshot_v1`) في `useChurchDataEngine.js`
- [x] إزالة شارة `خطأ مزامنة (إعادة)` الكاذبة في `GlobalSyncBadge.jsx` و `syncDeadline.js` و `childSync.js` و `sync.js`
- [x] تحديث وتشغيل اختبارات الوحدة والتكامل (`npm run test:data-integrity`, `npm run test:sync-freeze`, `npm run test:sync-ui`)
- [x] تشغيل `npm run build` والتأكد من نجاح البناء بدون أي أخطاء (`0 errors`)
- [x] تحديث `task.md` وتقديم التقرير النهائي باللغة العربية
