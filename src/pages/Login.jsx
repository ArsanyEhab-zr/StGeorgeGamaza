/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Phone, Key, Loader2, Church, Lock, Download } from 'lucide-react';

// 🌟 استدعاء مكتبات الفايربيز
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';

// 🌟 استدعاء قاعدة البيانات المحلية عشان ننظفها قبل الدخول
import { db } from '../db/database';
import { Capacitor } from '@capacitor/core';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function Login() {
    const navigate = useNavigate();
    const [phone, setPhone] = useState("");
    const [syncKey, setSyncKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const [appSettings, setAppSettings] = useState({ khedmaName: "نظام إدارة الخدمة", khedmaLogo: "" });

    const [deferredPrompt, setDeferredPrompt] = useState(null);

    useEffect(() => {
        const currentKey = localStorage.getItem('currentSyncKey');
        if (currentKey) navigate('/');

        // 🌟 جلب إعدادات التطبيق من LocalStorage للعرض المبدئي
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                setAppSettings({
                    khedmaName: parsed.khedmaName || "نظام إدارة الخدمة",
                    khedmaLogo: parsed.khedmaLogo || ""
                });
            } catch (e) {
                console.error("Error parsing local settings", e);
            }
        }

        // 🌟 إعدادات التثبيت PWA
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        const handleAppInstalled = () => {
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [navigate]);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } else {
            alert("لتثبيت التطبيق على أجهزة آيفون، اضغط على زر المشاركة (Share) ثم اختر 'Add to Home Screen'.");
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        const cleanPhone = phone.trim().toLowerCase();
        const cleanSyncKey = syncKey.trim();

        // 🌟 الباب السري للـ Super Admin
        if (cleanPhone === 'admin' && cleanSyncKey === 'admin') {
            // 🧹 تنظيف الذاكرة المحلية عشان الأدمن يشوف الداتا على نضافة
            try {
                await db.children.clear();
                await db.attendance.clear();
            } catch (clearErr) {
                console.log("Error clearing DB:", clearErr);
            }

            localStorage.setItem('currentSyncKey', 'ADMIN_MODE');
            localStorage.setItem('currentServant', JSON.stringify({ name: 'المسئول العام', role: 'Super Admin' }));
            navigate('/dashboard');
            return;
        }

        try {
            // 🌟🌟🌟 التعديل السحري هنا: السحب من mainConfig (اللي فيه الخدام الجداد) 🌟🌟🌟
            const configRef = doc(firestore, 'System', 'mainConfig');
            const configSnap = await getDoc(configRef);

            let servantsList = [];

            if (configSnap.exists()) {
                const cloudData = configSnap.data();
                servantsList = cloudData.servants || [];

                // ندمج الداتا الجديدة اللي جاية من السحابة مع الداتا القديمة اللي في الموبايل
                const localSettings = JSON.parse(localStorage.getItem('appSettings')) || {};
                const mergedSettings = { ...localSettings, services: cloudData.services || [], servants: servantsList };
                localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
            } else {
                // لو مفيش نت أو مفيش داتا على الكلاود، نعتمد على الـ LocalStorage
                const localSettings = JSON.parse(localStorage.getItem('appSettings')) || {};
                servantsList = localSettings.servants || [];
            }

            // 🌟 2. التحقق من وجود الخادم في لستة الخدام
            const foundServant = servantsList.find(s => s.phone === cleanPhone && s.syncKey === cleanSyncKey);

            if (foundServant) {
                // 🧹 تنظيف الذاكرة المحلية فوراً لمنع تداخل أطفال أي خادم تاني كان فاتح من نفس الموبايل
                try {
                    await db.children.clear();
                    await db.attendance.clear();
                } catch (clearErr) {
                    console.log("Error clearing DB:", clearErr);
                }

                // الخادم موجود!
                localStorage.setItem('currentSyncKey', foundServant.syncKey);
                localStorage.setItem('currentServant', JSON.stringify(foundServant));

                // توجيه الخادم للرئيسية
                const isSuperAdmin = foundServant.syncKey === 'MASTER_ACCESS' || foundServant.syncKey === 'ADMIN_MODE' || foundServant.role === 'أدمن مساعد';
                if (isSuperAdmin) {
                    navigate('/master-dashboard');
                } else {
                    navigate('/');
                }
            } else {
                setError("بيانات الدخول غير صحيحة، أو الخادم غير مسجل.");
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("حدث خطأ في الاتصال بالسيرفر، تأكد من وجود إنترنت.");
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden" dir="rtl">
            <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-indigo-600/30 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>

            <div className="w-full max-w-md relative z-10">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[2.5rem] shadow-2xl">
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center p-1 mb-4 shadow-lg overflow-hidden">
                            {appSettings.khedmaLogo ? (
                                <img src={appSettings.khedmaLogo} width="96" height="96" loading="eager" alt="لوجو الخدمة" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <Church className="text-white w-12 h-12" />
                            )}
                        </div>
                        <h1 className="text-2xl font-black text-white mb-1">تسجيل الدخول</h1>
                        <p className="text-xs font-bold text-indigo-200">{appSettings.khedmaName}</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-2xl text-xs font-bold text-center animate-in fade-in">
                                {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-indigo-100 ml-1">رقم هاتف الخادم</label>
                            <div className="relative">
                                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300" size={18} />
                                <input
                                    type="text"
                                    required
                                    aria-label="رقم هاتف الخادم"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    placeholder="أدخل رقمك المسجل..."
                                    className="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold placeholder:text-white/30 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-indigo-100 ml-1">مفتاح المزامنة (Cloud Key)</label>
                            <div className="relative">
                                <Key className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300" size={18} />
                                <input
                                    type="password"
                                    required
                                    aria-label="مفتاح المزامنة"
                                    value={syncKey}
                                    onChange={e => setSyncKey(e.target.value)}
                                    placeholder="أدخل المفتاح السري لأسرتك..."
                                    className="w-full pl-4 pr-12 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold placeholder:text-white/30 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all tracking-widest text-left"
                                    dir="ltr"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-linear-to-r from-indigo-500 to-purple-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-2 mt-4 disabled:opacity-70 disabled:hover:scale-100"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <><ShieldCheck size={20} /> دخول آمن</>}
                        </button>

                        <div className="mt-5 text-center">
                            <span className="text-xs font-bold text-indigo-200">مش مسجل معانا في الخدمة؟ </span>
                            <Link to="/signup" className="text-xs font-black text-white hover:text-indigo-300 underline underline-offset-4 transition-all">
                                اعمل طلب انضمام من هنا
                            </Link>
                        </div>

                        {Capacitor.getPlatform() === 'web' && (
                            <>
                                <div className="flex items-center gap-3 my-6">
                                    <div className="flex-1 h-px bg-slate-200/20"></div>
                                    <span className="text-xs font-bold text-slate-400">أو</span>
                                    <div className="flex-1 h-px bg-slate-200/20"></div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleInstallClick}
                                    className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-linear-to-r from-emerald-500 to-green-600 text-white font-black hover:from-emerald-600 hover:to-green-700 transition-all shadow-lg active:scale-95"
                                >
                                    <Download size={22} />
                                    تثبيت التطبيق على الهاتف
                                </button>
                            </>
                        )}
                    </form>
                </div>
                <p className="text-center text-[10px] text-slate-500 mt-6 font-bold flex items-center justify-center gap-1">
                    <Lock size={10} /> نظام مشفر بتقنية Multi-tenant
                </p>
            </div>
        </main>
    );
}