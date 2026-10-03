/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import SmartAlerts from '../components/SmartAlerts';
import { Settings, Users, MapPin, Gift, BookOpen, CalendarDays, Church, UserMinus, UserCheck, X, MessageCircleWarning, FileText, Crown, ArrowRight, Bell, Star, PhoneCall, Award, ChevronRight, QrCode, CreditCard } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { calculateExactAge } from '../utils/dateUtils';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function Home() {
    const navigate = useNavigate();
    const [gregorianDate, setGregorianDate] = useState("");
    const [copticDate, setCopticDate] = useState("");
    const [modalState, setModalState] = useState({ isOpen: false, type: null });
    const [showPastDatePicker, setShowPastDatePicker] = useState(false);
    const [pastDate, setPastDate] = useState('');
    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');

    // 🌟 جلب بيانات الخادم من التخزين المحلي
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');

    // 🌟 تحديد صلاحيات الخادم (ماستر أو كاهن أو أمين خدمة أو أدمن مساعد)
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
    const isLeadership = isMaster || currentServant.role === 'كاهن' || currentServant.role === 'أمين أسرة' || currentServant.role === 'أدمن مساعد';

    // 🌟 جلب إعدادات الكنيسة والخدمة
    const [appSettings, setAppSettings] = useState({ khedmaName: "الخدمة", osraName: "الأسرة", osraLogo: "", khedmaLogo: "" });
    const [todaysLesson, setTodaysLesson] = useState(null);
    const [curriculumPdfUrl, setCurriculumPdfUrl] = useState("");

    const [activeWidget, setActiveWidget] = useState(localStorage.getItem('preferredWidget') || 'BIRTHDAYS');

    const isFriday = new Date().getDay() === 5;
    const targetDate = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day >= 5 ? day - 5 : day + 2;
        d.setDate(d.getDate() - diff);
        return d.toISOString().split('T')[0];
    }, []);

    // 🔐 عزل البيانات: كل أسرة تشوف أطفالها بس
    const children = useLiveQuery(() => {
        if (isMaster) return db.children.toArray();
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).toArray();
    }, [currentSyncKey, isMaster]);

    // 🌟 عدد الأحداث العامة الغير مقروءة
    const unseenGlobalEventsCount = useLiveQuery(() => {
        const lastViewed = parseInt(localStorage.getItem('lastSeenGlobalEventTime') || '0', 10);
        const todayStr = new Date().toISOString().split('T')[0];
        return db.events.filter(e => {
            const isGlobal = e.isGlobal === true || e.syncKey === 'global';
            return isGlobal && (e.date >= todayStr) && ((e.createdAt || 0) > lastViewed);
        }).count();
    }, []);

    useEffect(() => {
        // 🌟 1. تظبيط التواريخ
        const date = new Date();
        setGregorianDate(date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        try {
            setCopticDate(new Intl.DateTimeFormat('ar-EG-u-ca-coptic', { day: 'numeric', month: 'long', year: 'numeric' }).format(date));
        } catch (e) {
            setCopticDate("التقويم القبطي");
        }

        // 🌟 2. قراءة الداتا بذكاء من الـ appSettings (الاسم، اللوجو، المنهج، الـ PDF)
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                let finalKhedmaName = parsed.khedmaName || "الخدمة";
                let finalKhedmaLogo = parsed.khedmaLogo || "";
                let finalOsraName = parsed.osraName || "الأسرة";
                let finalOsraLogo = parsed.osraLogo || "";

                let matchedPdf = "";
                let matchedLessons = [];

                if (isMaster) {
                    finalKhedmaName = parsed.services?.[0]?.name || parsed.khedmaName || "الخدمة المركزية";
                    finalKhedmaLogo = parsed.services?.[0]?.logo || parsed.khedmaLogo || "";
                    finalOsraName = "كل الأسر (صلاحية كاملة)";
                } else if (parsed.services && Array.isArray(parsed.services)) {
                    // البحث عن أسرة الخادم
                    for (const service of parsed.services) {
                        const foundOsra = (service.osras || []).find(o => String(o.syncKey).trim() === String(currentSyncKey).trim());
                        if (foundOsra) {
                            finalKhedmaName = service.name;
                            finalKhedmaLogo = service.logo;
                            finalOsraName = foundOsra.name;
                            finalOsraLogo = foundOsra.logo;

                            // 🌟 السحر هنا: بناخد المنهج من جوه الأسرة نفسها!
                            matchedPdf = foundOsra.pdfUrl || "";
                            matchedLessons = foundOsra.lessons || [];
                            break;
                        }
                    }
                }

                // 🌟 3. عرض البيانات في الشاشة
                setAppSettings({ khedmaName: finalKhedmaName, khedmaLogo: finalKhedmaLogo, osraName: finalOsraName, osraLogo: finalOsraLogo });

                setCurriculumPdfUrl(matchedPdf);
                if (matchedPdf) {
                    localStorage.setItem('curriculumPdfUrl', matchedPdf);
                } else {
                    localStorage.removeItem('curriculumPdfUrl');
                }

                if (matchedLessons.length > 0) {
                    // 🔐 فلترة الدروس: إخفاء الدروس اللي تاريخها فات
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const todayStr = today.toISOString().split('T')[0];

                    const validLessons = matchedLessons.filter(l => {
                        if (!l.date) return true; // لو مفيش تاريخ، نعرضه
                        const parsed = new Date(l.date);
                        if (!isNaN(parsed.getTime())) {
                            // تاريخ ISO حقيقي — نقارن تاريخياً
                            parsed.setHours(0, 0, 0, 0);
                            return parsed >= today;
                        }
                        // تاريخ نصي قديم (عربي) — نعرضه عشان ميختفيش
                        return true;
                    });
                    const lesson = validLessons.find(l => l.date === targetDate) || validLessons[0];
                    setTodaysLesson(lesson || null);
                } else {
                    setTodaysLesson(null);
                }

            } catch (e) { console.error("Error reading settings", e); }
        }
    }, [targetDate, currentSyncKey, isMaster]);


    useEffect(() => {
        localStorage.setItem('preferredWidget', activeWidget);
    }, [activeWidget]);

    const widgetData = useMemo(() => {
        if (!children || isLeadership) return { birthdays: [], topStreaks: [], needsVisitation: [] };
        
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        
        const birthdays = children.filter(c => c.birthMonth === currentMonth).map(c => {
            const age = calculateExactAge(c.birthDate);
            return { ...c, calculatedAge: age === 'غير محدد' ? '' : `${age} سنة` };
        });
        
        const topStreaks = [...children]
            .sort((a, b) => (b.streak || 0) - (a.streak || 0))
            .filter(c => (c.streak || 0) > 0)
            .slice(0, 15);
            
        const needsVisitation = children.filter(c => {
            if (!c.last_service && !c.last_liturgy) return true;
            const lastAttended = new Date(Math.max(
                c.last_service ? new Date(c.last_service).getTime() : 0,
                c.last_liturgy ? new Date(c.last_liturgy).getTime() : 0
            ));
            const diffDays = Math.floor((now - lastAttended) / (1000 * 60 * 60 * 24));
            return diffDays >= 21 || c.streak === 0;
        }).slice(0, 5);

        return { birthdays, topStreaks, needsVisitation };
    }, [children, isLeadership]);

    // 🌟🌟🌟 نظام الإشعارات الذكي (مراقبة النت وأعياد الميلاد) 🌟🌟🌟
    useEffect(() => {
        const setupNotifications = async () => {
            try {
                const permStatus = await LocalNotifications.requestPermissions();

                Network.addListener('networkStatusChange', async status => {
                    if (status.connected) {
                        const hasUnsyncedNotes = Object.keys(localStorage).some(key => key.startsWith('draft_note_'));
                        const dirtyChildren = await db.children.filter(c => c.isDirty === true || c.synced === 0).count();
                        const dirtyAttendance = await db.attendance.filter(a => a.isDirty === true || a.synced === 0).count();
                        
                        if (hasUnsyncedNotes || dirtyChildren > 0 || dirtyAttendance > 0) {
                            await LocalNotifications.schedule({
                                notifications: [
                                    {
                                        title: "النت رجع يا هندسة! 🌐",
                                        body: "عندك داتا وملاحظات متسجلة أوفلاين، افتح الأبلكيشن واعمل مزامنة عشان متضيعش.",
                                        id: 100,
                                        schedule: { at: new Date(Date.now() + 1000) },
                                        sound: null,
                                        smallIcon: "ic_launcher"
                                    }
                                ]
                            });
                        }
                    }
                });

            } catch (error) {
                console.log("مشكلة في تشغيل الإشعارات:", error);
            }
        };

        setupNotifications();

        return () => {
            Network.removeAllListeners();
        };
    }, []);



    const getReportData = () => {
        let list = [];
        if (modalState.type === 'absent') {
            list = (children || []).filter(c => c.last_service !== targetDate && c.last_liturgy !== targetDate);
        } else if (modalState.type === 'service') {
            list = (children || []).filter(c => c.last_service === targetDate);
        } else if (modalState.type === 'liturgy') {
            list = (children || []).filter(c => c.last_liturgy === targetDate);
        }

        return {
            boys: list.filter(c => c.gender !== 'بنت'),
            girls: list.filter(c => c.gender === 'بنت')
        };
    };

    const { boys: reportBoys, girls: reportGirls } = modalState.isOpen ? getReportData() : { boys: [], girls: [] };

    const cleanPhoneNumber = (phone) => {
        let clean = String(phone || "").replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '2' + clean;
        else if (!clean.startsWith('20') && clean.length > 0) clean = '20' + clean;
        return clean;
    };

    const getTargetPhone = (child) => {
        if (child.whatsappTarget === 'child' && child.childPhone) return child.childPhone;
        if (child.whatsappTarget === 'child' && !child.childPhone) return child.motherPhone || child.fatherPhone || child.phone;
        if (child.whatsappTarget === 'father' && child.fatherPhone) return child.fatherPhone;
        if (child.whatsappTarget === 'mother' && child.motherPhone) return child.motherPhone;
        return child.motherPhone || child.fatherPhone || child.childPhone || child.phone;
    };

    const generateMissedFridayMsg = (child, specificTarget = null) => {
        const title = child.gender === 'بنت' ? 'مخدومتنا' : 'مخدومنا';
        const namePart = child.name ? child.name.split(' ')[0] : '';
        let msg = `وحشتنا يا ${title} ${namePart ? `(${namePart})` : ''}! 🥺💔\nمجتش ليه الجمعة اللي فاتت؟ مكانك كان فاضي، مستنيينك الجمعة الجاية ضروري!`;
        
        let phoneStr = '';
        if (specificTarget === 'father' && child.fatherPhone) phoneStr = child.fatherPhone;
        else if (specificTarget === 'mother' && child.motherPhone) phoneStr = child.motherPhone;
        else if (specificTarget === 'child' && child.childPhone) phoneStr = child.childPhone;
        else phoneStr = getTargetPhone(child);

        return `https://api.whatsapp.com/send?phone=${cleanPhoneNumber(phoneStr)}&text=${encodeURIComponent(msg)}`;
    };

    const masterOsras = useMemo(() => {
        if (!isMaster) return [];
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                let list = [];
                if (parsed.services && Array.isArray(parsed.services)) {
                    parsed.services.forEach(s => {
                        if (s.osras) list = [...list, ...s.osras];
                    });
                }
                return list;
            } catch (e) { return []; }
        }
        return [];
    }, [isMaster]);

    const handleEnterOsra = (osra) => {
        localStorage.setItem('masterSyncKey', currentSyncKey);
        localStorage.setItem('currentSyncKey', osra.syncKey);
        localStorage.setItem('assignedOsra', osra.name);
        localStorage.setItem('isSuperAdminImpersonating', 'true');
        window.location.reload();
    };
 
    const handleCurriculumClick = () => {
        if (curriculumPdfUrl) {
            navigate('/pdf-viewer', { state: { pdfUrl: curriculumPdfUrl } });
        } else {
            alert("⚠️ لم يتم رفع منهج (ملف PDF) لهذه الأسرة بعد. يمكنك رفعه من صفحة الإعدادات أو لوحة الإدارة.");
        }
    };

    // SmartRadar & SmartWidget logic refactored into main render return

    return (
        <div className="min-h-screen bg-slate-50 relative overflow-x-hidden font-sans pb-10" dir="rtl">
            <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-125 h-125 rounded-full bg-indigo-600/5 blur-[100px]" />
                <div className="absolute bottom-10 -left-20 w-100 h-100 rounded-full bg-amber-500/5 blur-[80px]" />
            </div>

            <main className="relative z-10 max-w-4xl mx-auto px-4 pt-6">

                <header className="bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex justify-between items-start">
                        <div className="flex gap-4 items-center">

                            <div className="relative flex shrink-0">
                                {!isMaster && (
                                    appSettings.osraLogo || TENANT_CONFIG.DEFAULT_OSRA_LOGO ? (
                                        <img src={appSettings.osraLogo || TENANT_CONFIG.DEFAULT_OSRA_LOGO} alt="لوجو الأسرة" width="64" height="64" loading="lazy" decoding="async" className="w-16 h-16 rounded-full border-4 border-white shadow-md z-10 bg-slate-100 object-cover" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full border-4 border-white shadow-md z-10 bg-indigo-100 flex items-center justify-center text-xl font-black text-indigo-500">
                                            {appSettings.osraName ? appSettings.osraName.charAt(0) : "أ"}
                                        </div>
                                    )
                                )}
                                {appSettings.khedmaLogo || TENANT_CONFIG.DEFAULT_KHEDMA_LOGO ? (
                                    <img src={appSettings.khedmaLogo || TENANT_CONFIG.DEFAULT_KHEDMA_LOGO} alt="لوجو الخدمة" width="64" height="64" loading="lazy" decoding="async" className={`w-16 h-16 rounded-full border-4 border-white shadow-md bg-slate-100 object-cover ${!isMaster ? '-mr-6' : ''}`} />
                                ) : (
                                    <div className={`w-16 h-16 rounded-full border-4 border-white shadow-md bg-purple-100 flex items-center justify-center text-xl font-black text-purple-500 ${!isMaster ? '-mr-6' : ''}`}>
                                        {appSettings.khedmaName ? appSettings.khedmaName.charAt(0) : "خ"}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h2 className="text-xs md:text-sm font-black text-slate-500 mb-1">{appSettings.osraName}</h2>
                                <h1 className="text-xl md:text-2xl lg:text-3xl font-black text-indigo-900 mb-1">{appSettings.khedmaName}</h1>

                                {/* 🌟 زرار الكلندر موجود للكل يقدر يدوس عليه */}
                                <div
                                    onClick={() => {
                                        localStorage.setItem('lastSeenGlobalEventTime', Date.now().toString());
                                        navigate('/calendar');
                                    }}
                                    className="flex flex-col gap-1 mt-3 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all group select-none relative"
                                    title="افتح أجندة الخدمة والمهام"
                                >
                                    {unseenGlobalEventsCount > 0 && (
                                        <div className="absolute -top-3 -right-2 z-10 flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-full border border-red-200 shadow-sm">
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            </span>
                                            <span className="text-[9px] font-black text-red-600">حدث جديد</span>
                                        </div>
                                    )}
                                    <div className="inline-flex items-center gap-1.5 text-[11px] md:text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg w-fit group-hover:bg-blue-50 group-hover:text-blue-700 border border-transparent group-hover:border-blue-200 transition-colors shadow-sm">
                                        <CalendarDays size={14} className="text-blue-500 group-hover:scale-110 transition-transform" /> {gregorianDate}
                                    </div>

                                    <div className="inline-flex items-center gap-1.5 text-[11px] md:text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 w-fit group-hover:bg-amber-100 transition-colors shadow-sm">
                                        <Church size={14} className="text-amber-500 group-hover:scale-110 transition-transform" /> {copticDate}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Link to="/dashboard" aria-label="لوحة التحكم والإعدادات" className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex justify-center items-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                                <Settings size={24} />
                            </Link>
                        </div>
                    </div>
                </header>



                {/* 🌟 Smart Alerts (Phase 6) */}
                <SmartAlerts />

                {/* 🌟 التطبيقات الذكية المتغيرة (تم إزالتها وتحويلها لبطاقات رئيسية بناءً على طلب المستخدم) */}



                {/* 🌟 لوحة الكاهن الشاملة (تظهر فقط للأدمن/الكاهن) */}
                {isMaster && (
                    <>
                        <Link to="/master-dashboard" className="mb-8 flex items-center justify-between bg-linear-to-r from-amber-500 to-yellow-500 p-4 rounded-3xl shadow-lg shadow-amber-500/20 active:scale-95 transition-transform border border-amber-300">
                            <div className="flex items-center gap-3 text-white">
                                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                                    <Crown size={24} />
                                </div>
                                <div>
                                    <h2 className="font-black text-lg">لوحة الكاهن الشاملة</h2>
                                    <p className="text-[10px] font-bold text-amber-50">مراقبة جميع الأسر والمخدومين</p>
                                </div>
                            </div>
                            <ArrowRight size={20} className="text-white opacity-80" />
                        </Link>

                        {/* 🌟 Classes Dashboard (Central Control Room) */}
                        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-xl font-black text-indigo-900 mb-4 flex items-center gap-2">
                                <Church className="text-amber-500" /> لوحة الفصول والأسر
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {masterOsras.length > 0 ? masterOsras.map((osra, i) => (
                                    <div key={i} className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-5 rounded-3xl shadow-xl shadow-indigo-900/20 border border-amber-500/20 flex flex-col justify-between hover:scale-[1.02] transition-transform">
                                        <div className="flex items-center gap-4 mb-5">
                                            {osra.logo || TENANT_CONFIG.DEFAULT_OSRA_LOGO ? (
                                                <img src={osra.logo || TENANT_CONFIG.DEFAULT_OSRA_LOGO} alt={osra.name} className="w-14 h-14 rounded-2xl object-cover bg-white p-1 shadow-sm" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-black text-white p-1 shadow-sm border border-white/30">
                                                    {osra.name ? osra.name.charAt(0) : "ف"}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="text-white font-black text-lg">{osra.name}</h3>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleEnterOsra(osra)}
                                            className="w-full bg-amber-500 hover:bg-amber-400 text-indigo-950 py-3 rounded-2xl text-sm font-black shadow-md transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Award size={18} /> الدخول كخادم للأسرة
                                        </button>
                                    </div>
                                )) : (
                                    <div className="col-span-full text-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 text-slate-500 font-bold">
                                        لا توجد أسر مسجلة. قم بإضافتها من الإعدادات.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* 🌟 3 Primary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* 1. سجل الغياب */}
                    {!isMaster && (
                        <div className="relative overflow-hidden p-6 rounded-3xl border border-indigo-100 shadow-xl bg-white hover:border-indigo-300 transition-all duration-300 flex flex-col items-center text-center">
                            <Link to="/attendance" className="flex flex-col items-center w-full pb-4">
                                <div className="w-16 h-16 rounded-full bg-indigo-900 text-white flex items-center justify-center mb-3 transition-transform hover:scale-110">
                                    <Users size={32} strokeWidth={2} />
                                </div>
                                <h2 className="text-xl font-black mb-1 text-indigo-900">سجل الغياب</h2>
                                <p className="text-[11px] font-bold text-slate-500">تسجيل ومتابعة حضور اليوم</p>
                            </Link>

                            <div className="w-full pt-4 border-t border-slate-100 grid grid-cols-1 gap-2 mt-auto">
                                <Link to="/tracking-dashboards" className="bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 w-full mb-2">
                                    <BookOpen size={14} /> لوحة المتابعة والتقارير
                                </Link>
                                <button onClick={() => setModalState({ isOpen: true, type: 'absent' })} className="bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 w-full">
                                    <UserMinus size={14} /> مين غاب؟
                                </button>
                                <div className="flex gap-2 w-full">
                                    <button onClick={() => setModalState({ isOpen: true, type: 'service' })} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-[11px] font-black shadow-md transition-all flex items-center justify-center gap-1.5">
                                        <UserCheck size={14} /> حضر الخدمة
                                    </button>
                                    <button onClick={() => setModalState({ isOpen: true, type: 'liturgy' })} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-[11px] font-black shadow-md transition-all flex items-center justify-center gap-1.5">
                                        <Church size={14} /> حضر القداس
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. أعياد الميلاد والمواظبة */}
                    {!isMaster && (
                        <div className="relative overflow-hidden p-6 rounded-3xl bg-white border border-indigo-100 shadow-xl transition-all duration-300 flex flex-col">
                            <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
                                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                    <Gift size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-indigo-900">أعياد الميلاد</h2>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-40 pr-1 mb-4">
                                {widgetData?.birthdays?.length > 0 ? widgetData.birthdays.map(c => (
                                    <div key={c.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                                        <span className="text-xs font-black text-indigo-900">{c.name}</span>
                                        <Gift className="text-amber-500" size={16} />
                                    </div>
                                )) : <p className="text-xs font-bold text-slate-400 text-center py-2">لا يوجد أعياد ميلاد هذا الشهر</p>}
                            </div>

                            <div className="w-full pt-4 border-t border-slate-100 mt-auto">
                                <button onClick={() => setModalState({ isOpen: true, type: 'champions' })} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5">
                                    🏆 عرض مخدومين المواظبة
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. الافتقاد */}
                    {!isMaster && (
                        <Link to="/visitation" className="group p-6 rounded-3xl bg-white border border-indigo-100 hover:border-indigo-300 shadow-xl hover:shadow-indigo-900/20 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer">
                            <div className="w-16 h-16 rounded-full bg-indigo-900 text-amber-500 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                                <MapPin size={32} strokeWidth={2} />
                            </div>
                            <h2 className="text-xl font-black text-indigo-900 mb-1">خريطة الافتقاد</h2>
                            <p className="text-[11px] font-bold text-slate-500">متابعة الغياب وزيارات البيوت</p>
                        </Link>
                    )}
                </div>

                {/* 🌟 تسجيل حضور الخادم الذاتي (Self Check-in) */}
                {!isMaster && (
                    <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button
                            onClick={() => navigate('/servant-checkin')}
                            className="w-full bg-gradient-to-l from-emerald-600 to-emerald-800 hover:from-emerald-700 hover:to-emerald-900 p-6 rounded-[2.5rem] shadow-xl shadow-emerald-900/20 hover:shadow-2xl transition-all duration-300 flex items-center justify-between group border border-emerald-500/30 text-right cursor-pointer transform active:scale-95"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-white/20 text-white rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all backdrop-blur-sm">
                                    <UserCheck size={28} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white">تسجيل حضوري اليوم</h2>
                                    <p className="text-xs text-emerald-100 mt-1 font-bold">
                                        سجل حضورك، القداس، والافتقاد بضغطة واحدة
                                    </p>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center group-hover:-translate-x-1 transition-all">
                                <ChevronRight size={20} className="rotate-180" />
                            </div>
                        </button>
                    </div>
                )}

                {/* 🌟 دليل الأبطال (Deacons Directory) */}
                {!isMaster && (
                    <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button
                            onClick={() => navigate('/info-directory')}
                            className="w-full bg-indigo-900 hover:bg-indigo-950 p-6 rounded-[2.5rem] shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-between group border border-indigo-800 text-right cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-all">
                                    <BookOpen size={28} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white">دليل المخدومين</h2>
                                    <p className="text-xs text-indigo-200 mt-1 font-bold">
                                        عرض وتعديل بيانات المخدومين، المجموعات، والملفات الشخصية بالكامل
                                    </p>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center group-hover:translate-x-[-4px] transition-all">
                                <ChevronRight size={20} className="rotate-180" />
                            </div>
                        </button>
                    </div>
                )}

                {/* 🌟 Sections for Exams and Curriculum */}
                {!isMaster && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <Link to="/exams" className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex items-center gap-4 hover:bg-slate-50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-900 flex items-center justify-center">
                                <Award size={24} />
                            </div>
                            <div>
                                <h3 className="font-black text-indigo-900">الامتحانات والدرجات</h3>
                                <p className="text-xs text-slate-500 font-bold">رصد وتقييم أداء المخدومين</p>
                            </div>
                        </Link>
                        
                        <div 
                            onClick={handleCurriculumClick} 
                            className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex items-center gap-4 hover:bg-slate-50 transition-all duration-300 cursor-pointer"
                        >
                            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h3 className="font-black text-indigo-900">منهج الفصل الدراسي</h3>
                                <p className="text-xs text-slate-500 font-bold">تصفح وقراءة المذكرة</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 🌟 أدوات QR — تسجيل حضور وطباعة كارنيهات */}
                {!isMaster && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <Link to="/qr-attendance" className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex items-center gap-4 hover:bg-slate-50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center">
                                <QrCode size={24} />
                            </div>
                            <div>
                                <h3 className="font-black text-indigo-900">حضور QR سريع</h3>
                                <p className="text-xs text-slate-500 font-bold">مسح بطاقات المخدومين وتسجيل الحضور</p>
                            </div>
                        </Link>

                        <Link to="/generate-cards" className="bg-white p-5 rounded-2xl shadow-md border border-slate-100 flex items-center gap-4 hover:bg-slate-50 transition-all duration-300">
                            <div className="w-12 h-12 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center">
                                <CreditCard size={24} />
                            </div>
                            <div>
                                <h3 className="font-black text-indigo-900">طباعة كارنيهات QR</h3>
                                <p className="text-xs text-slate-500 font-bold">إنشاء وطباعة بطاقات QR للمخدومين</p>
                            </div>
                        </Link>
                    </div>
                )}
            </main>

            {/* المودال بتاع تقرير الغياب السريع */}
            {modalState.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl animate-in slide-in-from-bottom-8">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <h2 className={`text-lg font-black flex items-center gap-2 
                                ${modalState.type === 'absent' ? 'text-red-600' : modalState.type === 'champions' ? 'text-amber-500' : modalState.type === 'service' ? 'text-green-600' : 'text-blue-600'}`}>
                                {modalState.type === 'absent' && <><UserMinus size={20} /> مين غاب؟</>}
                                {modalState.type === 'service' && <><BookOpen size={20} /> حضروا الخدمة</>}
                                {modalState.type === 'liturgy' && <><Church size={20} /> حضروا القداس</>}
                                {modalState.type === 'champions' && <><Award size={20} className="text-amber-500 animate-bounce" /> مخدومين المواظبة</>}
                            </h2>
                            <button onClick={() => setModalState({ isOpen: false, type: null })} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} /></button>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto pr-1">
                            {modalState.type === 'champions' ? (
                                <div className="space-y-2.5">
                                    {widgetData.topStreaks.length > 0 ? (
                                        widgetData.topStreaks.map((child, index) => (
                                            <div key={child.id} className="flex justify-between items-center bg-amber-50/50 p-3.5 rounded-2xl border border-amber-100 shadow-sm">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    <span className="font-black text-xs text-slate-800">{child.name}</span>
                                                </div>
                                                <span className="text-xs font-black text-amber-700 bg-amber-100 px-3 py-1 rounded-xl flex items-center gap-1">
                                                    {child.streak} مواظبة 🔥
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs font-bold text-slate-400 text-center py-4">لا يوجد مخدومين مواظبة حالياً</p>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {reportBoys.length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="bg-blue-50 text-blue-700 font-black text-xs py-2 px-3 rounded-lg mb-3 inline-flex items-center gap-1">
                                                ولاد 👦 ({reportBoys.length})
                                            </h3>
                                            <div className="space-y-2">
                                                {reportBoys.map(child => (
                                                    <div key={child.id} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                                                        <span className="font-black text-xs text-slate-700">{child.name || 'بدون اسم'}</span>
                                                        {modalState.type === 'absent' && (
                                                            <div className="flex gap-1 flex-wrap">
                                                                {child.fatherPhone && <a href={generateMissedFridayMsg(child, 'father')} target="_blank" rel="noreferrer" className="bg-blue-600 text-blue-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">👨 أب</a>}
                                                                {child.motherPhone && <a href={generateMissedFridayMsg(child, 'mother')} target="_blank" rel="noreferrer" className="bg-pink-600 text-pink-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-pink-700">👩 أم</a>}
                                                                {child.childPhone && <a href={generateMissedFridayMsg(child, 'child')} target="_blank" rel="noreferrer" className="bg-green-600 text-green-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-700">👦 مخدوم</a>}
                                                                {(!child.fatherPhone && !child.motherPhone && !child.childPhone) && <a href={generateMissedFridayMsg(child)} target="_blank" rel="noreferrer" className="bg-slate-600 text-slate-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-slate-700"><MessageCircleWarning size={12} /> رسالة</a>}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {reportGirls.length > 0 && (
                                        <div>
                                            <h3 className="bg-pink-50 text-pink-700 font-black text-xs py-2 px-3 rounded-lg mb-3 inline-flex items-center gap-1">
                                                بنات 👧 ({reportGirls.length})
                                            </h3>
                                            <div className="space-y-2">
                                                {reportGirls.map(child => (
                                                    <div key={child.id} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                                                        <span className="font-black text-xs text-slate-700">{child.name || 'بدون اسم'}</span>
                                                        {modalState.type === 'absent' && (
                                                            <div className="flex gap-1 flex-wrap">
                                                                {child.fatherPhone && <a href={generateMissedFridayMsg(child, 'father')} target="_blank" rel="noreferrer" className="bg-blue-600 text-blue-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">👨 أب</a>}
                                                                {child.motherPhone && <a href={generateMissedFridayMsg(child, 'mother')} target="_blank" rel="noreferrer" className="bg-pink-600 text-pink-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-pink-700">👩 أم</a>}
                                                                {child.childPhone && <a href={generateMissedFridayMsg(child, 'child')} target="_blank" rel="noreferrer" className="bg-green-600 text-green-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-700">👦 مخدوم</a>}
                                                                {(!child.fatherPhone && !child.motherPhone && !child.childPhone) && <a href={generateMissedFridayMsg(child)} target="_blank" rel="noreferrer" className="bg-slate-600 text-slate-50 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-slate-700"><MessageCircleWarning size={12} /> رسالة</a>}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {reportBoys.length === 0 && reportGirls.length === 0 && (
                                        <div className="text-center py-8 text-slate-400 font-bold text-sm">مفيش بيانات للتقرير ده.</div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}