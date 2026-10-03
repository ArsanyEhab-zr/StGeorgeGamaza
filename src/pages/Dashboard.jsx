/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
// 🌟 السطرين دول اتضافوا عشان السيستم يكلم فايربيز ويتأكد من الطرد
import { collection, getDocs, onSnapshot, collectionGroup, setDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { encryptData, decryptData } from '../encryption';
import {
    BarChart3, Users, ArrowRight,
    ImagePlus, Loader2, Sparkles, BookOpen, UserPlus, Edit3, Trash2,
    Lock, Shirt, MapPin, DatabaseBackup, Save, FileSpreadsheet, ChevronRight, Phone, Search, Map, Calendar, Briefcase, StickyNote, Camera,
    LogOut, ShieldAlert, Download, AlertTriangle, RefreshCw, Music, CloudUpload, UserCheck, ClipboardList, Printer
} from 'lucide-react';
import ExcelImporter from '../components/ExcelImporter';
import useAutoSync from '../hooks/useAutoSync';
import { calculateExactAge } from '../utils/dateUtils';

const getSettings = () => {
    const defaults = {
        khedmaName: "خدمة ابتدائي",
        osraLogo: "",
        aiPrompt: "خادم بمدارس الأحد 10 سنوات. حضر درس بعنوان: '[اسم_الدرس]'. مقسم لـ: 1. قصة مشوقة 2. أسئلة تفاعلية 3. لعبة حركية. باللغة العربية.",
        secretPass: "1234",
        deletePass: "مسح",
        adminPass: "admin"
    };
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        try { return { ...defaults, ...JSON.parse(saved) }; }
        catch (e) { return defaults; }
    }
    return defaults;
};

export default function Dashboard() {
    const [currentView, setCurrentView] = useState('menu');
    const [appSettings, setAppSettings] = useState(getSettings());
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
    const children = useLiveQuery(() => {
        if (isMaster) return db.children.toArray();
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).toArray();
    }, [currentSyncKey, isMaster]);

    // 🌟 currentSyncKey and isMaster are already defined above with the children query

    // 🌟🌟🌟 زرعنا كود الطرد التلقائي هنا 🌟🌟🌟
    useEffect(() => {
        const verifyServantAccess = async () => {
            try {
                const servantData = localStorage.getItem('currentServant');
                if (!servantData) return;

                const currentServant = JSON.parse(servantData);
                // لو ده أدمن كبير ملوش أسرة متسجلة، مش هنطبق عليه الفحص ده
                if (!currentServant.osraName) return;

                const querySnapshot = await getDocs(collection(firestore, "System"));
                let isOsraStillExists = false;

                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.services) {
                        data.services.forEach(service => {
                            if (service.osras) {
                                service.osras.forEach(osra => {
                                    if (osra.name === currentServant.osraName) {
                                        isOsraStillExists = true;
                                    }
                                });
                            }
                        });
                    }
                });

                if (!isOsraStillExists) {
                    alert("⚠️ جالك قرار إزالة! تم إغلاق أسرتك أو إزالتك من النظام المركزي بواسطة الإدارة. جاري مسح بياناتك وتسجيل الخروج فوراً.");

                    // 🌟 الضربة القاضية: فرمتة الداتا بيز المحلية عشان منسيبش أثر
                    db.children.clear();
                    db.attendance.clear();

                    localStorage.removeItem('currentServant');
                    localStorage.removeItem('currentSyncKey');
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error("النت فاصل أو فيه مشكلة في فحص الصلاحيات:", error);
                // لو النت فاصل هنسيبه يكمل أوفلاين عادي ومش هنطرده
            }
        };

        verifyServantAccess();
    }, []);
    // 🌟🌟🌟 نهاية كود الطرد 🌟🌟🌟

    if (!children) return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-bold text-slate-400 gap-3">
            <Loader2 className="animate-spin text-indigo-500 w-10 h-10" /> جاري تحميل غرفة الإدارة...
        </div>
    );

    const handleLogout = async () => {
        if (window.confirm("متأكد إنك عايز تسجل خروج؟ (سيتم مسح البيانات المحلية من الجهاز للأمان)")) {

            // 🌟 تنظيف الموبايل بالكامل قبل ما يخرج
            await db.children.clear();
            await db.attendance.clear();

            localStorage.removeItem('currentSyncKey');
            localStorage.removeItem('currentServant');
            window.location.href = '/login';
        }
    };

    const currentServantObj = JSON.parse(localStorage.getItem('currentServant') || '{}');
    const dynamicTitle = currentServantObj.stageName || currentServantObj.serviceName || currentServantObj.osraName || currentServantObj.role || appSettings.khedmaName || 'الخدمة';

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="rtl">
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem]">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {currentView === 'menu' ? (
                            <Link to="/" aria-label="العودة للرئيسية" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                                <ArrowRight size={20} />
                            </Link>
                        ) : (
                            <button onClick={() => setCurrentView('menu')} aria-label="الرجوع للقائمة" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                                <ChevronRight size={24} />
                            </button>
                        )}
                        <div className="flex items-center gap-3">
                            {appSettings.osraLogo ? (
                                <img src={appSettings.osraLogo} width="40" height="40" loading="eager" fetchpriority="high" className="w-10 h-10 rounded-full object-cover border-2 border-slate-700" alt="لوجو الأسرة" />
                            ) : (
                                <DatabaseBackup className="text-indigo-400" size={24} />
                            )}
                            <div>
                                <h1 className="text-sm font-black text-indigo-300">
                                    {isMaster ? 'لوحة الإدارة المركزية' : dynamicTitle}
                                </h1>
                                <p className="text-xs font-bold text-slate-300">
                                    {isMaster ? 'لوحة تحكم الأدمن' : currentView === 'menu' ? 'غرفة الإدارة' :
                                        currentView === 'stats' ? 'الإحصائيات والداتا' :
                                            currentView === 'kids' ? 'مرايا المخدومين' : 'إخوة الرب'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-4xl mx-auto mt-4">
                {currentView === 'menu' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button onClick={() => setCurrentView('stats')} className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-indigo-50 hover:border-indigo-200 transition-all flex flex-col items-center text-center group">
                                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><BarChart3 size={32} /></div>
                                <h2 className="text-xl font-black text-slate-800">الإحصائيات والداتا</h2>
                                <p className="text-xs font-bold text-slate-500 mt-1">سحب شيت الإكسيل، وتصفير العدادات</p>
                            </button>

                            {/* 🌟 New Card for Servants Follow-up */}
                            {isMaster && (
                                <>
                                    <Link to="/admin/servants-followup" className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-emerald-50 hover:border-emerald-200 transition-all flex flex-col items-center text-center group">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><ClipboardList size={32} /></div>
                                        <h2 className="text-xl font-black text-slate-800">متابعة وتقييم الخدام</h2>
                                        <p className="text-xs font-bold text-slate-500 mt-1">حضور، تحضير، قداسات، وافتقاد</p>
                                    </Link>
                                    
                                    <Link to="/admin/servants-report" className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-amber-50 hover:border-amber-200 transition-all flex flex-col items-center text-center group">
                                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Printer size={32} /></div>
                                        <h2 className="text-xl font-black text-slate-800">التقرير الشهري للخدام</h2>
                                        <p className="text-xs font-bold text-slate-500 mt-1">تجميع وطباعة التقرير الشامل</p>
                                    </Link>
                                </>
                            )}

                            {/* 🌟 إخفاء مرايا المخدومين والذكاء الاصطناعي عن الأدمن/الكاهن */}
                            {!isMaster && (
                                <button onClick={() => setCurrentView('kids')} className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-blue-50 hover:border-blue-200 transition-all flex flex-col items-center text-center group">
                                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Users size={32} /></div>
                                    <h2 className="text-xl font-black text-slate-800">مرايا المخدومين</h2>
                                    <p className="text-xs font-bold text-slate-500 mt-1">إضافة مخدومين، وتعديل كل البيانات الشاملة</p>
                                </button>
                            )}


                        </div>

                        {/* 🌟 الزرار اللي بيودي لصفحة الأدمن المنفصلة */}
                        <div className="mt-10 text-center">
                            <Link to="/admin" className="text-[10px] text-slate-400 hover:text-slate-600 font-bold underline flex items-center justify-center gap-1 mx-auto">
                                <ShieldAlert size={12} /> الانتقال للوحة الإدارة المركزية (Super Admin)
                            </Link>
                        </div>

                        <button onClick={handleLogout} className="mt-6 w-full bg-slate-200 text-slate-600 py-3 rounded-xl font-black text-sm hover:bg-red-50 hover:text-red-600 transition-all flex justify-center items-center gap-2 shadow-sm">
                            <LogOut size={18} /> تسجيل الخروج من الحساب
                        </button>
                    </div>
                )}

                {currentView === 'stats' && <StatsView childrenData={children} appSettings={appSettings} />}
                {currentView === 'kids' && !isMaster && <KidsManagerView childrenData={children} />}


            </main>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════════════
// الإحصائيات والأبطال والذكاء الاصطناعي وإخوة الرب (زي ما هما بالظبط)
// ══════════════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════════════
// 1️⃣ الإحصائيات (Advanced Analytics Dashboard)
// ══════════════════════════════════════════════════════════════════════════════════════
function StatsView({ childrenData, appSettings }) {
    const { triggerAutoSync } = useAutoSync();
    const total = childrenData.length;
    const boys = childrenData.filter(c => c.gender !== 'بنت').length;
    const girls = childrenData.filter(c => c.gender === 'بنت').length;
    const today = new Date().toISOString().split('T')[0];

    const currentYear = new Date().getFullYear();
    const currentMonthPrefix = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    
    // 🌟 جلب داتا الغياب لشهر الحالي عشان نرسم بيها الإحصائيات (أسرع في الأداء السحابي والمحلي)
    const attendanceData = useLiveQuery(() => 
        db.attendance.filter(a => a.date && a.date.startsWith(currentYear.toString())).toArray()
    ) || [];

    // ─── 📊 1. حساب إحصائيات الحضور لجُمع الشهر الحالي ───
    const getFridaysOfCurrentMonth = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = d.getMonth();
        const fridays = [];
        const date = new Date(year, month, 1);
        while (date.getMonth() === month) {
            if (date.getDay() === 5) {
                // تظبيط الـ Timezone عشان التاريخ يفضل صح
                const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                fridays.push(localDate);
            }
            date.setDate(date.getDate() + 1);
        }
        return fridays;
    };

    const monthFridays = getFridaysOfCurrentMonth();

    const attendanceStats = monthFridays.map((friday, index) => {
        const serviceCount = attendanceData.filter(a => a.date === friday && a.type === 'service').length;
        const liturgyCount = attendanceData.filter(a => a.date === friday && a.type === 'liturgy').length;
        return {
            date: friday,
            label: `الجمعة ${index + 1}`,
            service: serviceCount,
            liturgy: liturgyCount
        };
    });

    // ─── 🏡 2. تجميع إحصائيات الافتقاد بالتواريخ ───
    const visitationsByDate = childrenData.reduce((acc, child) => {
        if (child.last_visited) {
            if (!acc[child.last_visited]) acc[child.last_visited] = [];
            acc[child.last_visited].push(child.name.split(' ')[0] + ' ' + (child.name.split(' ')[1] || ''));
        }
        return acc;
    }, {});

    const sortedVisitDates = Object.keys(visitationsByDate).sort((a, b) => new Date(b) - new Date(a));

    // ─── 📥 3. الشيت الإكسيل الذكي (الكل - ولاد - بنات) ───
    const handleExport = (filterType) => {
        const currentYear = new Date().getFullYear();

        // 🌟 فلترة الداتا وتحديد اسم الملف بناءً على الزرار اللي انداس
        let dataToExport = childrenData;
        let fileName = "أرشيف_الخدمة_الشامل";
        let sheetName = "التقرير الشامل";

        if (filterType === 'boys') {
            dataToExport = childrenData.filter(c => c.gender !== 'بنت');
            fileName = "أرشيف_الخدمة_ولاد";
            sheetName = "تقرير الولاد";
        } else if (filterType === 'girls') {
            dataToExport = childrenData.filter(c => c.gender === 'بنت');
            fileName = "أرشيف_الخدمة_بنات";
            sheetName = "تقرير البنات";
        }

        if (dataToExport.length === 0) {
            alert("لا يوجد مخدومين في هذه الفئة لتصديرهم! 🤷‍♂️");
            return;
        }

        const dataForExcel = dataToExport.map(c => {
            // حساب العمر
            const calculatedAge = calculateExactAge(c.birthDate);

            // حساب الحضور
            const childAtt = attendanceData.filter(a => a.childId === c.id);
            const totalService = childAtt.filter(a => a.type === 'service').length;
            const totalLiturgy = childAtt.filter(a => a.type === 'liturgy').length;

            return {
                "م": c.id,
                "اسم المخدوم": c.name || 'بدون اسم',
                "النوع": c.gender || 'غير محدد',
                "تاريخ الميلاد": c.birthDate || 'غير مسجل',
                "العمر التقريبي": calculatedAge,
                "تليفون الأم": c.motherPhone || 'لا يوجد',
                "تليفون الأب": c.fatherPhone || 'لا يوجد',
                "تليفون المخدوم": c.childPhone || 'لا يوجد',
                "الواتساب للتواصل": c.whatsappTarget === 'father' ? 'الأب' : c.whatsappTarget === 'child' ? 'المخدوم' : 'الأم',
                "المنطقة السكنية": c.address || 'غير محدد',
                "العنوان التفصيلي": c.detailedAddress || 'غير مسجل',
                "إجمالي حضور الخدمة": totalService,
                "إجمالي حضور القداس": totalLiturgy,
                "المواظبة المتتالية الحالية": c.streak || 0,
                "آخر حضور قداس": c.last_liturgy || 'لم يحضر',
                "آخر حضور خدمة": c.last_service || 'لم يحضر',
                "آخر تاريخ افتقاد": c.last_visited || 'لم يُفتقد',
                "أب الاعتراف": c.fatherConfessor || 'غير مسجل',
                "الرتبة الشماسية": c.gender === 'ولد' ? (c.isOrdained ? c.ordinationRank || 'شماس' : 'غير مرسوم') : 'غير مطبق',
                "ملاحظات إضافية": c.specialNotes || 'لا يوجد'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);

        // تظبيط عرض العواميد
        const wscols = [{ wch: 5 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `${fileName}_${today}.xlsx`);
    };

    const handleGlobalReset = async () => {
        if (window.confirm("⚠️ تحذير خطير: إنت على وشك تصفير كل المواظبة، الغياب، والافتقاد لبداية شهر جديد! متأكد؟")) {
            if (window.confirm("تأكيد أخير: الداتا هتتمسح ومش هترجع، كمل؟")) {
                try {
                    const now = new Date().toISOString();
                    const updates = childrenData.map(c => db.children.update(c.id, { streak: 0, last_liturgy: null, last_service: null, last_visited: null, isDirty: true, updatedAt: now }));
                    await Promise.all(updates);
                    triggerAutoSync();
                    alert("تم تصفير العدادات بنجاح لبداية شهر جديد! 🚀");
                } catch (error) {
                    console.error(error);
                    alert("عطل في قاعدة البيانات: " + error.message);
                }
            }
        }
    };

    const handleNuclearDelete = async () => {
        if (window.confirm("⚠️ تحذير نهائي وقاتل: إنت بتمسح كل المخدومين وكل الغياب من الموبايل نهائياً! هل إنت متأكد؟")) {
            const pass = prompt(`اكتب كلمة (${appSettings.deletePass}) للتأكيد النهائي:`);
            if (pass === appSettings.deletePass) {
                try {
                    const now = new Date().toISOString();
                    // 🪦 Soft-delete all children
                    const allKids = await db.children.toArray();
                    await Promise.all(allKids.map(c => db.children.update(c.id, { isDeleted: true, isDirty: true, updatedAt: now })));
                    
                    // 🪦 Soft-delete all attendance
                    const allAtt = await db.attendance.toArray();
                    await Promise.all(allAtt.map(a => db.attendance.update(a.id, { isDeleted: true, isDirty: true, updatedAt: now })));
                    
                    triggerAutoSync();
                    alert("تم تنظيف قاعدة البيانات بالكامل! الأرض فاضية وجاهزة للداتا الجديدة. 🧹");
                } catch (error) {
                    console.error(error);
                    alert("عطل في قاعدة البيانات: " + error.message);
                }
            } else {
                alert("تم إلغاء العملية، كلمة المرور خاطئة، الداتا في أمان.");
            }
        }
    };

    const calcPercent = (count) => total === 0 ? 0 : Math.round((count / total) * 100);

    return (
        <div className="animate-in slide-in-from-right-8 duration-300 space-y-6">

            {/* 1. الكروت العلوية (ملخص الأرقام) */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center col-span-2">
                    <Users className="text-indigo-50 mb-1 w-8 h-8" />
                    <h3 className="text-slate-500 font-black text-xs">إجمالي المخدومين المقيدين</h3>
                    <p className="text-3xl font-black text-slate-800">{total}</p>
                    <div className="flex gap-4 mt-2 text-[10px] font-bold text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full">
                        <span>👦 {boys} ولاد</span><span>👧 {girls} بنات</span>
                    </div>
                </div>
            </div>

            {/* 📈 2. مؤشر حضور الشهر (رسم بياني) */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-blue-100">
                <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <BarChart3 className="text-blue-500 w-5 h-5" /> مؤشر حضور الشهر الحالي
                    </h3>
                </div>

                <div className="space-y-5">
                    {attendanceStats.map((stat, i) => {
                        const prevStat = i > 0 ? attendanceStats[i - 1] : null;
                        const serviceTrend = prevStat ? (stat.service >= prevStat.service ? '📈' : '📉') : '📊';

                        return (
                            <div key={stat.date} className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black text-slate-600">
                                    <span>{stat.label} ({stat.date.slice(5)})</span>
                                </div>

                                {/* بار الخدمة */}
                                <div className="flex items-center gap-2">
                                    <div className="w-10 text-[9px] font-bold text-indigo-500 text-right">الخدمة:</div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000" style={{ width: `${calcPercent(stat.service)}%` }}></div>
                                    </div>
                                    <div className="w-12 text-[10px] font-black text-slate-700 text-left flex items-center justify-end gap-1">
                                        {stat.service} {serviceTrend}
                                    </div>
                                </div>

                                {/* بار القداس */}
                                <div className="flex items-center gap-2">
                                    <div className="w-10 text-[9px] font-bold text-amber-500 text-right">القداس:</div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                                        <div className="bg-amber-400 h-full rounded-full transition-all duration-1000" style={{ width: `${calcPercent(stat.liturgy)}%` }}></div>
                                    </div>
                                    <div className="w-12 text-[10px] font-black text-slate-700 text-left flex items-center justify-end gap-1">
                                        {stat.liturgy}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {attendanceStats.length === 0 && <p className="text-xs text-center text-slate-400 font-bold py-4">لا توجد جُمع في هذا الشهر بعد.</p>}
                </div>
            </div>

            {/* 🏡 3. ملخص الافتقاد الزمني (Timeline) */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-emerald-100">
                <h3 className="text-sm font-black text-slate-800 mb-4 border-b border-slate-50 pb-3 flex items-center gap-2">
                    <MapPin className="text-emerald-500 w-5 h-5" /> سجل الافتقاد السريع
                </h3>

                <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                    {sortedVisitDates.length === 0 ? (
                        <p className="text-[10px] font-bold text-slate-400 text-center py-2">لم يتم تسجيل أي افتقاد مؤخراً.</p>
                    ) : (
                        sortedVisitDates.map(date => (
                            <div key={date} className="relative pl-4 border-r-2 border-emerald-200">
                                <div className="absolute w-3 h-3 bg-emerald-500 rounded-full -right-1.75 top-1 border-2 border-white shadow-sm"></div>
                                <h3 className="text-[11px] font-black text-emerald-800 mb-1 flex items-center gap-2">
                                    📅 {date} <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[9px]">({visitationsByDate[date].length} مخدومين)</span>
                                </h3>
                                <p className="text-[10px] font-bold text-slate-500 leading-6">
                                    {visitationsByDate[date].join('، ')}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 📥 4. تصدير الداتا المتطور (التقسيم الجبار) */}
            <div className="bg-linear-to-br from-green-50 to-emerald-50 p-6 rounded-3xl shadow-sm border border-green-200">
                <h3 className="text-sm font-black text-green-800 mb-2 flex items-center gap-2"><FileSpreadsheet className="text-green-600 w-5 h-5" /> تصدير الداتا (Excel)</h3>
                <p className="text-[10px] font-bold text-green-700/80 mb-5">اختر الفئة اللي عايز تطبعها أو تبعتها لخدامها.</p>

                <div className="flex flex-col gap-3">
                    <button onClick={() => handleExport('all')} className="w-full bg-green-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-green-700 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2">
                        <Download size={18} /> تحميل الكشف الشامل (الكل)
                    </button>

                    <div className="flex gap-3">
                        <button onClick={() => handleExport('boys')} className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-black text-xs hover:bg-blue-600 active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5">
                            👦 كشف الولاد
                        </button>
                        <button onClick={() => handleExport('girls')} className="flex-1 bg-pink-500 text-white py-3 rounded-xl font-black text-xs hover:bg-pink-600 active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5">
                            👧 كشف البنات
                        </button>
                    </div>
                </div>
            </div>

            {/* ⚠️ 5. منطقة الخطر (التنظيف) */}
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100 mt-10">
                <h3 className="text-sm font-black text-red-800 mb-1 flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={16} /> منطقة تنظيف البيانات (للمسئول)
                </h3>
                <p className="text-[10px] font-bold text-red-600/80 mb-4">احذر: استخدام هذه الأزرار سيؤدي لمسح البيانات من جهازك.</p>

                <div className="flex flex-col gap-2">
                    <button onClick={handleGlobalReset} className="w-full bg-amber-500 text-white py-3 rounded-xl font-black text-xs hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-sm">
                        <RefreshCw size={16} /> تصفير العدادات (لبداية شهر جديد)
                    </button>

                    <button onClick={handleNuclearDelete} className="w-full bg-red-600 text-white py-3 rounded-xl font-black text-xs hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-sm">
                        <Trash2 size={16} /> مسح كل المخدومين والغياب (Clean Slate)
                    </button>
                </div>
            </div>
        </div>
    );
}

function KidsManagerView({ childrenData }) {
    const { triggerAutoSync } = useAutoSync();
    const [search, setSearch] = useState("");
    const [genderFilter, setGenderFilter] = useState("all");
    const [editingChild, setEditingChild] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isCompressingImage, setIsCompressingImage] = useState(false);

    const emptyChild = {
        name: "", motherPhone: "", fatherPhone: "", childPhone: "", whatsappTarget: "mother",
        gender: "ولد", address: "", detailedAddress: "", gpsLink: "", birthDate: "", fatherJob: "", specialNotes: "", profilePic: "", fatherConfessor: "", isOrdained: false, ordinationRank: ""
    };
    const [formChild, setFormChild] = useState(emptyChild);

    const filtered = (childrenData || []).filter(c => {
        const matchesSearch = (c.name || '').includes(search);
        const matchesGender = genderFilter === "all" ? true : c.gender === (genderFilter === "boys" ? "ولد" : "بنت");
        return matchesSearch && matchesGender;
    });

    const getDisplayPhone = (c) => {
        if (c.whatsappTarget === 'child' && c.childPhone) return `📱 ${c.childPhone}`;
        if (c.whatsappTarget === 'father' && c.fatherPhone) return `👨 ${c.fatherPhone}`;
        if (c.whatsappTarget === 'mother' && c.motherPhone) return `👩 ${c.motherPhone}`;
        
        if (c.childPhone) return `📱 ${c.childPhone}`;
        if (c.fatherPhone) return `👨 ${c.fatherPhone}`;
        if (c.motherPhone) return `👩 ${c.motherPhone}`;
        if (c.phone) return `📞 ${c.phone}`;
        return 'لا يوجد تليفون';
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!navigator.onLine) {
                alert("⚠️ لازم نت عشان ترفع الصورة!");
                return;
            }
            setIsCompressingImage(true);
            try {
                const secure_url = await uploadImageToCloudinary(file, 'auto');
                setFormChild(prev => ({ ...prev, profilePic: secure_url }));
                alert("✅ تم رفع الصورة بنجاح!");
            } catch (err) {
                console.error(err);
                alert("❌ فشل رفع الصورة، حاول مرة تانية.");
            } finally {
                setIsCompressingImage(false);
            }
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formChild.name) return alert("اكتب اسم المخدوم الأول!");

        let bMonth = null;
        if (formChild.birthDate) {
            const arabicMonths = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "إبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
            let foundMonth = false;
            for (const [arMonth, num] of Object.entries(arabicMonths)) {
                if (formChild.birthDate.includes(arMonth)) {
                    bMonth = num;
                    foundMonth = true;
                    break;
                }
            }
            if (!foundMonth) {
                const dateObj = new Date(formChild.birthDate);
                if (!isNaN(dateObj.getTime())) bMonth = dateObj.getMonth() + 1;
            }
        }

        const now = new Date().toISOString();
        const currentSyncKey = localStorage.getItem('currentSyncKey');
        const childDataToSave = { ...formChild, birthMonth: bMonth, isDirty: true, updatedAt: now, isDeleted: false, syncKey: currentSyncKey };

        if (editingChild) {
            await db.children.update(editingChild.id, childDataToSave);
            setEditingChild(null);
        } else {
            await db.children.add({ ...childDataToSave, streak: 0, gotClothes: false });
            setIsAdding(false);
        }
        setFormChild(emptyChild);
        triggerAutoSync();
        alert("تم الحفظ بنجاح! ✅");
    };

    const handleDelete = async (id) => {
        if (window.confirm("متأكد إنك عايز تمسح المخدوم ده نهائياً؟")) {
            const now = new Date().toISOString();
            await db.children.update(id, { isDeleted: true, isDirty: true, updatedAt: now });
            triggerAutoSync();
        }
    };

    if (isAdding || editingChild) {
        return (
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4 mb-6">
                <h3 className="font-black text-xl mb-6 flex items-center gap-2 text-indigo-700">
                    {editingChild ? <><Edit3 size={24} /> تعديل بيانات المخدوم</> : <><UserPlus size={24} /> استمارة مخدوم جديد</>}
                </h3>

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="flex flex-col items-center gap-3">
                        <label className="relative cursor-pointer group">
                            <div className={`w-28 h-28 rounded-full bg-slate-100 border-4 ${formChild.profilePic ? 'border-green-400 shadow-green-200' : 'border-slate-50'} shadow-lg flex items-center justify-center overflow-hidden transition-all`}>
                                {isCompressingImage ? (
                                    <div className="flex flex-col items-center text-indigo-500"><Loader2 className="animate-spin mb-1" size={28} /><span className="text-[10px] font-black">جاري الضغط</span></div>
                                ) : formChild.profilePic ? (
                                    <img src={formChild.profilePic} className="w-full h-full object-cover" alt="Profile" />
                                ) : (
                                    <Camera className="text-slate-400 group-hover:text-indigo-500 transition-colors" size={36} />
                                )}
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isCompressingImage} />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 ml-1">الاسم رباعي *</label>
                            <input type="text" value={formChild.name} onChange={e => setFormChild({ ...formChild, name: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400" required />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1">النوع</label>
                            <div className="flex gap-2 h-13.5">
                                {["ولد", "بنت"].map(g => (
                                    <button type="button" key={g} onClick={() => setFormChild({ ...formChild, gender: g })} className={`flex-1 rounded-xl font-black transition-all ${formChild.gender === g ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>{g}</button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><Calendar size={12} /> تاريخ الميلاد</label>
                            <input type="text" placeholder="مثال: 15 اغسطس 2016" value={formChild.birthDate} onChange={e => setFormChild({ ...formChild, birthDate: e.target.value })} className="w-full h-13.5 px-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><Phone size={12} /> تليفون الأم</label>
                            <input type="tel" value={formChild.motherPhone} onChange={e => setFormChild({ ...formChild, motherPhone: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-left" dir="ltr" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><Phone size={12} /> تليفون الأب</label>
                            <input type="tel" value={formChild.fatherPhone} onChange={e => setFormChild({ ...formChild, fatherPhone: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-left" dir="ltr" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><Phone size={12} /> تليفون المخدوم (شخصي)</label>
                            <input type="tel" value={formChild.childPhone || ''} onChange={e => setFormChild({ ...formChild, childPhone: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-left" dir="ltr" />
                        </div>

                        <div className="space-y-1 md:col-span-2 bg-green-50 p-3 rounded-xl border border-green-100">
                            <label className="text-xs font-black text-green-800 ml-1 mb-2 block">رقم الواتساب الأساسي للافتقاد؟</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm font-bold text-green-700 cursor-pointer">
                                    <input type="radio" name="whatsappTarget" checked={formChild.whatsappTarget === 'mother'} onChange={() => setFormChild({ ...formChild, whatsappTarget: 'mother' })} className="accent-green-600 w-4 h-4" /> رقم الأم
                                </label>
                                <label className="flex items-center gap-2 text-sm font-bold text-green-700 cursor-pointer">
                                    <input type="radio" name="whatsappTarget" checked={formChild.whatsappTarget === 'father'} onChange={() => setFormChild({ ...formChild, whatsappTarget: 'father' })} className="accent-green-600 w-4 h-4" /> رقم الأب
                                </label>
                                <label className="flex items-center gap-2 text-sm font-bold text-green-700 cursor-pointer">
                                    <input type="radio" name="whatsappTarget" checked={formChild.whatsappTarget === 'child'} onChange={() => setFormChild({ ...formChild, whatsappTarget: 'child' })} className="accent-green-600 w-4 h-4" /> رقم المخدوم
                                </label>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-indigo-600 ml-1 flex items-center gap-1"><MapPin size={12} /> المنطقة (مثال: العصافرة)</label>
                            <input type="text" value={formChild.address} onChange={e => setFormChild({ ...formChild, address: e.target.value })} className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-blue-600 ml-1 flex items-center gap-1"><Map size={12} /> لوكيشن البيت (GPS Link)</label>
                            <input type="url" value={formChild.gpsLink} onChange={e => setFormChild({ ...formChild, gpsLink: e.target.value })} className="w-full p-4 bg-blue-50 border border-blue-100 rounded-xl font-bold text-left" dir="ltr" />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-indigo-600 ml-1 flex items-center gap-1"><MapPin size={12} /> العنوان التفصيلي (وصف البيت)</label>
                            <textarea value={formChild.detailedAddress} onChange={e => setFormChild({ ...formChild, detailedAddress: e.target.value })} className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-xl font-bold min-h-20" placeholder="مثال: شارع صيدلية ملكه عمارة 38 الدور الرابع..."></textarea>
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><Briefcase size={12} /> وظيفة الأب</label>
                            <input type="text" value={formChild.fatherJob} onChange={e => setFormChild({ ...formChild, fatherJob: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold" />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1"><UserPlus size={12} /> أب الاعتراف</label>
                            <input type="text" value={formChild.fatherConfessor || ''} onChange={e => setFormChild({ ...formChild, fatherConfessor: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400" placeholder="مثال: أبونا..." />
                        </div>

                        {formChild.gender === 'ولد' && (
                            <div className="space-y-3 md:col-span-2 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 mt-2">
                                <label className="flex items-center gap-2 text-sm font-black text-indigo-800 cursor-pointer">
                                    <input type="checkbox" checked={formChild.isOrdained || false} onChange={e => setFormChild({ ...formChild, isOrdained: e.target.checked })} className="accent-indigo-600 w-5 h-5 rounded-md" />
                                    مرسوم شماس؟
                                </label>
                                
                                {formChild.isOrdained && (
                                    <div className="pt-2 border-t border-indigo-200/50">
                                        <label className="text-xs font-bold text-indigo-600 ml-1 mb-2 block">الرتبة الشماسية</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['إبصالتس (مرتل)', 'أغناسطس (قارئ)', 'إيبودياكون (مساعد شماس)'].map(rank => (
                                                <button type="button" key={rank} onClick={() => setFormChild({ ...formChild, ordinationRank: rank })} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${formChild.ordinationRank === rank ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100'}`}>
                                                    {rank}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-xs font-bold text-amber-600 ml-1 flex items-center gap-1"><StickyNote size={12} /> ملاحظات هامة</label>
                            <textarea value={formChild.specialNotes} onChange={e => setFormChild({ ...formChild, specialNotes: e.target.value })} className="w-full p-4 bg-amber-50 border border-amber-100 rounded-xl font-bold min-h-25"></textarea>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => { setIsAdding(false); setEditingChild(null); setFormChild(emptyChild); }} className="flex-1 py-4 rounded-xl font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">إلغاء</button>
                        <button type="submit" className="flex-2 py-4 rounded-xl font-black bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2">
                            <Save size={20} /> حفظ المخدوم
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="animate-in slide-in-from-right-8 duration-300">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-6">
                <ExcelImporter />
            </div>

            <div className="space-y-4 mb-6">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="ابحث لتعديل البيانات..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pr-10 pl-4 py-3 rounded-2xl bg-white border border-slate-200 font-bold focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                    </div>
                    <button onClick={() => { setFormChild(emptyChild); setIsAdding(true); }} aria-label="إضافة مخدوم جديد" className="bg-indigo-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 hover:bg-indigo-700 transition-colors">
                        <UserPlus size={20} />
                    </button>
                </div>

                <div className="flex gap-2 justify-center">
                    {[{ id: "boys", label: "ولاد 👦" }, { id: "girls", label: "بنات 👧" }].map(f => (
                        <button key={f.id} onClick={() => setGenderFilter(f.id)} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${genderFilter === f.id ? "bg-indigo-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-100"}`}>{f.label}</button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                {filtered.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 font-bold bg-white rounded-3xl border border-dashed border-slate-200">لا يوجد مخدومين بهذا الاسم.</div>
                ) : (
                    filtered.slice(0, 50).map(child => (
                        <div key={child.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="relative w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-xl overflow-hidden shadow-inner">
                                        {child.profilePic ? <img src={child.profilePic} width="48" height="48" loading="lazy" className="w-full h-full object-cover" alt={child.name} /> : (child.gender === 'بنت' ? '👧' : '👦')}

                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm text-slate-800">{child.name}</h3>
                                        <p className="text-[10px] font-bold text-slate-500 mt-0.5 flex gap-2">
                                            <span className="flex items-center gap-0.5"><MapPin size={10} /> {child.address || 'بدون منطقة'}</span>
                                            <span className="flex items-center gap-0.5"><Phone size={10} /> {getDisplayPhone(child)}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 border-t border-slate-50 pt-3 mt-1">
                                <button onClick={() => { setEditingChild(child); setFormChild(child); }} className="flex-1 bg-slate-50 text-indigo-600 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 hover:bg-indigo-50"><Edit3 size={14} /> تعديل شامل</button>
                                <button onClick={() => handleDelete(child.id)} className="flex-1 bg-slate-50 text-red-600 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 hover:bg-red-50"><Trash2 size={14} /> مسح</button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

