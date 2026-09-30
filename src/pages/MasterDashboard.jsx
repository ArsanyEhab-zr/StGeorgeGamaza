/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
// 🌟 استدعاء فايربيز عشان زرار المزامنة
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { ArrowRight, ShieldAlert, Users, Search, Phone, Crown, Layers, MessageCircle, UserCircle, Key } from 'lucide-react';
import ExcelExporter from '../components/ExcelExporter';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function MasterDashboard() {
    const navigate = useNavigate();

    // 🔐 جلب الهوية الأساسية للخادم
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');

    // 🌟 جلب الإعدادات في State
    const [appSettings, setAppSettings] = useState(JSON.parse(localStorage.getItem('appSettings')) || {});


    // 👑 تحديد الصلاحيات بدقة جراحية
    const isSuperAdmin = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || currentServant.role === 'أدمن مساعد';
    const isPriest = currentServant.role === 'كاهن';
    const isAmin = currentServant.role === 'أمين خدمة' || currentServant.role === 'أمين أسرة';
    const hasAccess = isSuperAdmin || isPriest || isAmin;

    // States
    const children = useLiveQuery(() => {
        if (!hasAccess) return [];
        if (isSuperAdmin || isPriest) return db.children.toArray();
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).toArray();
    }, [hasAccess, isSuperAdmin, isPriest, currentSyncKey]);
    const [selectedOsraKey, setSelectedOsraKey] = useState(sessionStorage.getItem('master_osraKey') || null);
    const [searchTerm, setSearchTerm] = useState(sessionStorage.getItem('master_search') || '');
    const [genderFilter, setGenderFilter] = useState(sessionStorage.getItem('master_gender') || 'ALL');

    // 🌟 المتغير الجديد للتبديل بين الأطفال والخدام 🌟
    const [viewMode, setViewMode] = useState(sessionStorage.getItem('master_viewMode') || 'KIDS'); // 'KIDS' | 'SERVANTS'

    useEffect(() => {
        if (selectedOsraKey) sessionStorage.setItem('master_osraKey', selectedOsraKey);
        else sessionStorage.removeItem('master_osraKey');
    }, [selectedOsraKey]);
    useEffect(() => sessionStorage.setItem('master_search', searchTerm), [searchTerm]);
    useEffect(() => sessionStorage.setItem('master_gender', genderFilter), [genderFilter]);
    useEffect(() => sessionStorage.setItem('master_viewMode', viewMode), [viewMode]);

    // 🌟 تحديد نطاق الرؤية (Scope)
    const allowedOsras = useMemo(() => {
        if (isSuperAdmin || isPriest) {
            return appSettings.services?.flatMap(s => s.osras || []) || [];
        } else if (isAmin) {
            const myService = appSettings.services?.find(s => s.osras?.some(o => o.syncKey === currentSyncKey));
            if (myService) return myService.osras || [];
            return appSettings.services?.flatMap(s => s.osras || []) || [];
        }
        return [];
    }, [appSettings, isSuperAdmin, isPriest, isAmin, currentSyncKey]);

    // 🌟🌟 Auto-Pull: سحب الهيكل المركزي تلقائياً عند فتح الصفحة 🌟🌟
    useEffect(() => {
        const autoFetchStructure = async () => {
            if (!navigator.onLine || !hasAccess) return;
            try {
                const settingsRef = doc(firestore, 'System', 'mainConfig');
                const snap = await getDoc(settingsRef);
                if (snap.exists()) {
                    const cloudConfig = snap.data();
                    const localSettingsString = localStorage.getItem('appSettings');
                    const localSettings = JSON.parse(localSettingsString || '{}');

                    const mergedSettings = {
                        ...localSettings,
                        services: cloudConfig.services || [],
                        servants: cloudConfig.servants || []
                    };

                    localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
                    setAppSettings(mergedSettings);
                    console.log('🔄 [MasterDashboard] Auto-pulled structure from cloud.');
                }
            } catch (error) {
                console.warn('[MasterDashboard] Auto-pull failed:', error.message);
            }
        };
        autoFetchStructure();
    }, [hasAccess]);

    const cleanPhoneForWhatsapp = (phone) => {
        let clean = String(phone || "").replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '2' + clean;
        return clean;
    };

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

    const getBestPhone = (c) => {
        if (c.whatsappTarget === 'child' && c.childPhone) return c.childPhone;
        if (c.whatsappTarget === 'father' && c.fatherPhone) return c.fatherPhone;
        if (c.whatsappTarget === 'mother' && c.motherPhone) return c.motherPhone;
        return c.childPhone || c.fatherPhone || c.motherPhone || c.phone || '';
    };

    const activeOsra = selectedOsraKey === 'ALL_CHURCH'
        ? { name: (isSuperAdmin || isPriest) ? 'كل الكنيسة (جميع المخدومين)' : TENANT_CONFIG.MASTER_VIEW_NAME, logo: '' }
        : allowedOsras.find(o => o.syncKey === selectedOsraKey);

    // 🌟 الفلترة الذكية للأطفال (مغلفة بـ useMemo)
    const osraChildren = useMemo(() => {
        if (!children) return [];
        return children.filter(child => {
            if (selectedOsraKey !== 'ALL_CHURCH' && child.syncKey !== selectedOsraKey) return false;
            if (selectedOsraKey === 'ALL_CHURCH') {
                const isChildInScope = allowedOsras.some(o => o.syncKey === child.syncKey);
                if (!isChildInScope) return false;
            }
            const genderTxt = String(child.gender || '').trim();
            const isGirl = ['بنت', 'أنثى', 'انثى', 'انثي', 'فتاة'].includes(genderTxt);
            if (genderFilter === 'BOYS' && isGirl) return false;
            if (genderFilter === 'GIRLS' && !isGirl) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return child.name?.toLowerCase().includes(term) || child.phone?.includes(term) || child.motherPhone?.includes(term) || child.fatherPhone?.includes(term) || child.childPhone?.includes(term);
            }
            return true;
        });
    }, [children, selectedOsraKey, allowedOsras, genderFilter, searchTerm]);

    // 🌟 الفلترة الذكية للخدام (الميزة الجديدة لأبونا)
    const osraServants = useMemo(() => {
        let list = appSettings.servants || [];

        // 1. فلترة بالصلاحيات (الأمين بيشوف خدام أسرته بس)
        if (!isSuperAdmin && !isPriest) {
            const allowedKeys = allowedOsras.map(o => o.syncKey);
            list = list.filter(s => allowedKeys.includes(s.syncKey));
        }

        // 2. فلترة بالأسرة المحددة
        if (selectedOsraKey && selectedOsraKey !== 'ALL_CHURCH') {
            list = list.filter(s => s.syncKey === selectedOsraKey);
        }

        // 3. فلترة بالبحث
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            list = list.filter(s => s.name?.toLowerCase().includes(term) || s.phone?.includes(term));
        }

        return list;
    }, [appSettings.servants, isSuperAdmin, isPriest, allowedOsras, selectedOsraKey, searchTerm]);

    if (!hasAccess) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
                <div className="bg-slate-800 p-8 rounded-[2.5rem] text-center shadow-2xl border border-slate-700">
                    <ShieldAlert className="text-red-500 mx-auto mb-4 w-16 h-16" strokeWidth={1.5} />
                    <h2 className="text-2xl font-black text-white mb-2">غير مصرح لك بالدخول</h2>
                    <p className="text-slate-400 text-sm mb-6">هذه الصفحة مخصصة للآباء الكهنة وأمناء الخدمة فقط.</p>
                    <button onClick={() => navigate(-1)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black hover:bg-indigo-700 w-full transition-colors">العودة للرئيسية</button>
                </div>
            </div>
        );
    }

    const handleGoBack = () => {
        if (selectedOsraKey) {
            setSelectedOsraKey(null);
            setSearchTerm('');
            setGenderFilter('ALL');
            setViewMode('KIDS');
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="rtl">
            <header className="bg-linear-to-l from-amber-600 to-yellow-500 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem]">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button onClick={handleGoBack} aria-label="الرجوع للخلف" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-all shrink-0 backdrop-blur-md">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black flex items-center gap-2"><Crown size={20} /> لوحة الإدارة الشاملة</h1>
                            <p className="text-[10px] font-bold text-amber-100 mt-0.5">
                                {selectedOsraKey && activeOsra ? `عرض بيانات: ${activeOsra.name}` : ((isSuperAdmin || isPriest) ? 'مراقبة جميع الأسر الكنسية' : 'مراقبة خدمتك الخاصة')}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-4xl mx-auto mt-4">

                {/* 🌟 الشاشة الأولى: لستة الأسر */}
                {!selectedOsraKey && (
                    <div className="animate-in fade-in zoom-in duration-300">
                        <h2 className="text-sm font-black text-slate-500 mb-4 flex items-center gap-2">
                            <Layers size={18} className="text-indigo-500" /> اختر الأسرة لعرض المخدومين والخدام:
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* 👑 كارت التجميعة */}
                            <div
                                onClick={() => setSelectedOsraKey('ALL_CHURCH')}
                                className="bg-linear-to-r from-indigo-600 to-purple-600 p-4 rounded-4xl shadow-lg cursor-pointer hover:scale-[1.02] transition-transform flex items-center gap-4 group text-white col-span-1 sm:col-span-2"
                            >
                                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                                    <Users size={32} className="text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-black text-xl">{(isSuperAdmin || isPriest) ? 'كل الكنيسة' : TENANT_CONFIG.MASTER_VIEW_NAME}</h3>
                                    <p className="text-xs font-bold text-indigo-100 mt-1">جميع الأفراد ضمن نطاق إدارتك</p>
                                </div>
                                <div className="flex flex-col items-center justify-center bg-white/20 w-16 h-16 rounded-2xl shrink-0 backdrop-blur-sm">
                                    <span className="font-black text-xl text-white">
                                        {children?.filter(c => allowedOsras.some(o => o.syncKey === c.syncKey)).length || 0}
                                    </span>
                                    <span className="text-[10px] font-bold text-indigo-100">طفل</span>
                                </div>
                            </div>

                            <div className="col-span-1 sm:col-span-2 mt-2">
                                <ExcelExporter />
                            </div>

                            {/* 📂 كروت الأسر المنفصلة */}
                            {allowedOsras.map((osra) => {
                                const countKids = children?.filter(c => c.syncKey === osra.syncKey).length || 0;
                                const countServants = appSettings.servants?.filter(s => s.syncKey === osra.syncKey).length || 0;
                                return (
                                    <div
                                        key={osra.syncKey}
                                        onClick={() => setSelectedOsraKey(osra.syncKey)}
                                        className="bg-white p-4 rounded-4xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-amber-300 cursor-pointer transition-all flex items-center gap-4 group"
                                    >
                                        <div className="w-16 h-16 rounded-full bg-slate-100 border-4 border-slate-50 overflow-hidden shrink-0 shadow-inner group-hover:border-amber-100 transition-colors">
                                            {osra.logo ? (
                                                <img src={osra.logo} width="64" height="64" loading="lazy" alt="لوجو الأسرة" className="w-full h-full object-cover" />
                                            ) : (
                                                <Users className="w-full h-full p-4 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-black text-lg text-slate-800">{osra.name}</h3>
                                            <p className="text-[10px] font-bold text-slate-500 mt-1 flex gap-2">
                                                <span>أمين الأسرة: {osra.amin || 'غير محدد'}</span>
                                                <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">👨‍🏫 {countServants} خدام</span>
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center justify-center bg-indigo-50 w-12 h-12 rounded-2xl shrink-0 group-hover:bg-amber-50 transition-colors">
                                            <span className="font-black text-indigo-700 group-hover:text-amber-700">{countKids}</span>
                                            <span className="text-[9px] font-bold text-indigo-400 group-hover:text-amber-500">طفل</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 🌟 الشاشة التانية: العرض الداخلي (أطفال / خدام) */}
                {selectedOsraKey && activeOsra && (
                    <div className="animate-in slide-in-from-left duration-300 space-y-4">

                        {/* الهيدر بتاع الأسرة المحددة */}
                        <div className="bg-white p-4 rounded-4xl shadow-sm border border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {activeOsra.logo ? (
                                    <img src={activeOsra.logo} width="48" height="48" loading="eager" alt="لوجو الأسرة" className="w-12 h-12 rounded-full border-2 border-slate-100 object-cover" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500"><Users size={20} /></div>
                                )}
                                <div>
                                    <h2 className="font-black text-slate-800 text-sm">{activeOsra.name}</h2>
                                    <p className="text-[10px] font-bold text-slate-400">مفاتيح الكلاود: {activeOsra.syncKey || 'متعدد'}</p>
                                </div>
                            </div>
                            <button onClick={handleGoBack} className="text-xs font-black bg-slate-100 text-slate-600 px-4 py-2 rounded-xl flex items-center gap-1 hover:bg-slate-200">
                                <ArrowRight size={14} /> عودة
                            </button>
                        </div>

                        {/* 🌟 زراير التبديل بين الأطفال والخدام 🌟 */}
                        <div className="flex gap-2 bg-slate-200/50 p-1.5 rounded-2xl mb-4">
                            <button onClick={() => setViewMode('KIDS')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all flex justify-center items-center gap-2 ${viewMode === 'KIDS' ? 'bg-white text-indigo-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>
                                👦👧 المخدومين ({osraChildren.length})
                            </button>
                            <button onClick={() => setViewMode('SERVANTS')} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all flex justify-center items-center gap-2 ${viewMode === 'SERVANTS' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' : 'text-slate-500 hover:bg-slate-200'}`}>
                                👨‍🏫 الخدام ({osraServants.length})
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="text"
                                placeholder={`ابحث بالاسم أو التليفون في ${viewMode === 'KIDS' ? 'المخدومين' : 'الخدام'}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-4 pr-12 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm font-bold text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                        </div>

                        {/* الفلتر بيظهر للأطفال بس */}
                        {viewMode === 'KIDS' && (
                            <div className="flex gap-2 bg-slate-200/50 p-1 rounded-2xl mb-4">
                                <button onClick={() => setGenderFilter('ALL')} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${genderFilter === 'ALL' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>الكل</button>
                                <button onClick={() => setGenderFilter('BOYS')} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${genderFilter === 'BOYS' ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30' : 'text-slate-500 hover:bg-slate-200'}`}>ولاد 👦</button>
                                <button onClick={() => setGenderFilter('GIRLS')} className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${genderFilter === 'GIRLS' ? 'bg-pink-500 text-white shadow-sm shadow-pink-500/30' : 'text-slate-500 hover:bg-slate-200'}`}>بنات 👧</button>
                            </div>
                        )}

                        <div className="space-y-3 pt-2">
                            {/* 🌟 عرض الخدام 🌟 */}
                            {viewMode === 'SERVANTS' ? (
                                osraServants.length === 0 ? (
                                    <div className="text-center py-10 bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                                        <UserCircle className="text-amber-300 mx-auto mb-3" size={40} />
                                        <p className="text-slate-500 font-bold text-sm">لا يوجد خدام يطابقون البحث.</p>
                                    </div>
                                ) : (
                                    osraServants.map(servant => (
                                        <div key={servant.id} className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-400"></div>

                                            <div className="pr-2">
                                                <h3 className="font-black text-slate-800 flex items-center gap-2">
                                                    {servant.name}
                                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600">
                                                        {servant.role}
                                                    </span>
                                                </h3>
                                                <p className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-2">
                                                    <span className="flex items-center gap-1"><Users size={12} /> {servant.assignedOsra}</span>
                                                    <span className="flex items-center gap-1 text-indigo-500"><Key size={12} /> {servant.syncKey}</span>
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <a href={`tel:${servant.phone}`} className="bg-slate-50 text-slate-600 p-2.5 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center shadow-sm">
                                                    <Phone size={16} />
                                                </a>
                                                <a href={`https://wa.me/${cleanPhoneForWhatsapp(servant.phone)}`} target="_blank" rel="noreferrer" className="bg-green-50 text-green-600 p-2.5 rounded-xl hover:bg-green-100 transition-colors flex items-center justify-center shadow-sm">
                                                    <MessageCircle size={16} />
                                                </a>
                                            </div>
                                        </div>
                                    ))
                                )
                            ) : (
                                /* 🌟 عرض المخدومين (الأطفال) 🌟 */
                                osraChildren.length === 0 ? (
                                    <div className="text-center py-10 bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                                        <Users className="text-slate-300 mx-auto mb-3" size={40} />
                                        <p className="text-slate-500 font-bold text-sm">لا يوجد مخدومين يطابقون البحث.</p>
                                    </div>
                                ) : (
                                    osraChildren.map(child => {
                                        const genderTxt = String(child.gender || '').trim();
                                        const isGirl = ['بنت', 'أنثى', 'انثى', 'انثي', 'فتاة'].includes(genderTxt);

                                        return (
                                            <div key={child.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group">
                                                <div className={`absolute top-0 right-0 w-1.5 h-full ${isGirl ? 'bg-pink-400' : 'bg-blue-400'}`}></div>

                                                <div className="pr-2">
                                                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                                                        {child.name}
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-md ${isGirl ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>
                                                            {child.gender || 'غير محدد'}
                                                        </span>
                                                    </h3>
                                                    <p className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                                                        <Phone size={10} /> {getDisplayPhone(child)}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {getBestPhone(child) && (
                                                        <a href={`tel:${getBestPhone(child)}`} className="bg-slate-50 text-slate-600 p-2.5 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center shadow-sm">
                                                            <Phone size={16} />
                                                        </a>
                                                    )}
                                                    {getBestPhone(child) && (
                                                        <a href={`https://wa.me/${cleanPhoneForWhatsapp(getBestPhone(child))}`} target="_blank" rel="noreferrer" className="bg-green-50 text-green-600 p-2.5 rounded-xl hover:bg-green-100 transition-colors flex items-center justify-center shadow-sm">
                                                            <MessageCircle size={16} />
                                                        </a>
                                                    )}
                                                    <button onClick={() => navigate(`/info/${child.id}`)} className="flex-1 md:flex-none bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black hover:bg-slate-700 transition-colors text-center shadow-md">
                                                        عرض الملف
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })
                                )
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}