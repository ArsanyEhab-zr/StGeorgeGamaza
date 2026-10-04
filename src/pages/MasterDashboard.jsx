/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
// 🌟 استدعاء فايربيز عشان زرار المزامنة
import { doc, getDoc, onSnapshot, setDoc, writeBatch, collectionGroup, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { encryptData, decryptData } from '../encryption';
import { firestore } from '../db/firebase';
import { ArrowRight, ShieldAlert, Users, Search, Phone, Crown, Layers, MessageCircle, UserCircle, Key, AlertTriangle, CheckCircle, RefreshCw, Trash2, Target, CheckSquare, Plus, Edit3, ArrowLeftRight, ChevronDown } from 'lucide-react';
import ExcelExporter from '../components/ExcelExporter';
import useAutoSync from '../hooks/useAutoSync';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function MasterDashboard() {
    const navigate = useNavigate();
    const { triggerAutoSync } = useAutoSync();

    // 🔐 جلب الهوية الأساسية للخادم
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');

    // 🌟 جلب الإعدادات في State
    const [appSettings, setAppSettings] = useState(JSON.parse(localStorage.getItem('appSettings')) || {});


    // 👑 تحديد الصلاحيات بدقة جراحية
    const isSuperAdmin = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || currentServant.role === 'أدمن مساعد';
    const isStageAdmin = currentServant.role === 'أمين مرحلة';
    const isPriest = currentServant.role === 'كاهن';
    const isAmin = currentServant.role === 'أمين خدمة' || currentServant.role === 'أمين أسرة';
    const hasAccess = isSuperAdmin || isPriest || isAmin || isStageAdmin;

    // States
    const children = useLiveQuery(async () => {
        if (!hasAccess) return [];
        let kids = [];
        if (isSuperAdmin || isPriest) {
            kids = await db.children.toArray();
        } else if (isStageAdmin) {
            const allowedSyncKeys = currentServant.allowedClasses || [];
            kids = await db.children.filter(c => allowedSyncKeys.includes(c.syncKey)).toArray();
        } else if (currentSyncKey) {
            kids = await db.children.where('syncKey').equals(currentSyncKey).toArray();
        }
        
        // Unify: Exclude soft-deleted kids globally
        return kids.filter(c => !c.isDeleted);
    }, [hasAccess, isSuperAdmin, isPriest, isStageAdmin, currentSyncKey, currentServant.allowedClasses]);
    const [selectedOsraKey, setSelectedOsraKey] = useState(sessionStorage.getItem('master_osraKey') || null);
    const [searchTerm, setSearchTerm] = useState(sessionStorage.getItem('master_search') || '');
    const [genderFilter, setGenderFilter] = useState(sessionStorage.getItem('master_gender') || 'ALL');

    // 🌟 المتغير الجديد للتبديل بين الأطفال والخدام 🌟
    const [viewMode, setViewMode] = useState(sessionStorage.getItem('master_viewMode') || 'KIDS'); // 'KIDS' | 'SERVANTS'

    // 🌟 متابعة أنشطة الخدمة
    const [activities, setActivities] = useState({ targeted: [], executed: [] });
    const [newActivity, setNewActivity] = useState('');
    const [newActivityType, setNewActivityType] = useState('targeted');

    useEffect(() => {
        if (!hasAccess) return;
        const activitiesRef = doc(firestore, 'System', 'serviceActivities');
        const unsubscribe = onSnapshot(activitiesRef, (docSnap) => {
            if (docSnap.exists()) {
                setActivities(docSnap.data());
            } else {
                setActivities({ targeted: [], executed: [] });
            }
        });
        return () => unsubscribe();
    }, [hasAccess]);

    const handleAddActivity = async () => {
        if (!newActivity.trim()) return;
        const newAct = { id: Date.now().toString(), text: newActivity.trim() };
        const updated = { ...activities };
        updated[newActivityType] = [...(updated[newActivityType] || []), newAct];
        await setDoc(doc(firestore, 'System', 'serviceActivities'), updated);
        setNewActivity('');
    };

    const handleDeleteActivity = async (id, type) => {
        if (!window.confirm("متأكد من مسح هذا النشاط؟")) return;
        const updated = { ...activities };
        updated[type] = (updated[type] || []).filter(a => a.id !== id);
        await setDoc(doc(firestore, 'System', 'serviceActivities'), updated);
    };

    const handleMoveToExecuted = async (id) => {
        const item = (activities.targeted || []).find(a => a.id === id);
        if (!item) return;
        const updated = { ...activities };
        updated.targeted = updated.targeted.filter(a => a.id !== id);
        updated.executed = [...(updated.executed || []), item];
        await setDoc(doc(firestore, 'System', 'serviceActivities'), updated);
    };

    useEffect(() => {
        if (selectedOsraKey) sessionStorage.setItem('master_osraKey', selectedOsraKey);
        else sessionStorage.removeItem('master_osraKey');
    }, [selectedOsraKey]);
    useEffect(() => sessionStorage.setItem('master_search', searchTerm), [searchTerm]);
    useEffect(() => sessionStorage.setItem('master_gender', genderFilter), [genderFilter]);
    useEffect(() => sessionStorage.setItem('master_viewMode', viewMode), [viewMode]);

    const allowedOsras = useMemo(() => {
        if (isSuperAdmin || isPriest) {
            return appSettings.services?.flatMap(s => s.osras || []) || [];
        } else if (isStageAdmin) {
            const allOsras = appSettings.services?.flatMap(s => s.osras || []) || [];
            return allOsras.filter(o => (currentServant.allowedClasses || []).includes(o.syncKey));
        } else if (isAmin) {
            const myService = appSettings.services?.find(s => s.osras?.some(o => o.syncKey === currentSyncKey));
            if (myService) return myService.osras || [];
            return appSettings.services?.flatMap(s => s.osras || []) || [];
        }
        return [];
    }, [appSettings, isSuperAdmin, isPriest, isAmin, isStageAdmin, currentSyncKey, currentServant.allowedClasses]);

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


    // 🔄 أداة ترحيل المخدومين بين الفصول
    const [showTransferTool, setShowTransferTool] = useState(false);
    const [transferSourceKey, setTransferSourceKey] = useState('');
    const [transferTargetKey, setTransferTargetKey] = useState('');
    const [transferSelectedIds, setTransferSelectedIds] = useState(new Set());
    const [isTransferring, setIsTransferring] = useState(false);

    const transferSourceChildren = useMemo(() => {
        if (!transferSourceKey || !children) return [];
        return children.filter(c => c.syncKey === transferSourceKey);
    }, [transferSourceKey, children]);

    const handleToggleTransferSelect = (childId) => {
        setTransferSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(childId)) next.delete(childId);
            else next.add(childId);
            return next;
        });
    };

    const handleToggleSelectAll = () => {
        if (transferSelectedIds.size === transferSourceChildren.length) {
            setTransferSelectedIds(new Set());
        } else {
            setTransferSelectedIds(new Set(transferSourceChildren.map(c => c.id)));
        }
    };

    const executeTransfer = async () => {
        if (!transferSourceKey || !transferTargetKey || transferSelectedIds.size === 0) return;
        if (transferSourceKey === transferTargetKey) {
            alert('⚠️ فصل المصدر والوجهة متطابقان! اختر فصلًا مختلفًا.');
            return;
        }
        if (!window.confirm(`هل تريد ترحيل ${transferSelectedIds.size} مخدوم من الفصل المصدر إلى الفصل الجديد؟ هذه العملية ستنقل بياناتهم بالكامل.`)) return;

        setIsTransferring(true);
        try {
            const batch = writeBatch(firestore);
            let transferredCount = 0;

            for (const childId of transferSelectedIds) {
                try {
                    const child = children.find(c => c.id === childId);
                    if (!child) continue;

                    const oldDocRef = doc(firestore, 'Osras', transferSourceKey, 'children', String(child.id));
                    const newDocRef = doc(firestore, 'Osras', transferTargetKey, 'children', String(child.id));

                    // قراءة الداتا المشفرة من المصدر
                    const oldSnap = await getDoc(oldDocRef);
                    if (!oldSnap.exists()) continue;

                    const rawData = oldSnap.data();
                    const decryptedData = rawData.payload ? decryptData(rawData.payload) : rawData;
                    if (!decryptedData) continue;

                    // تحديث الـ syncKey للفصل الجديد
                    decryptedData.syncKey = transferTargetKey;
                    decryptedData.updatedAt = new Date().toISOString();

                    const newPayload = rawData.payload
                        ? { payload: encryptData(decryptedData) }
                        : decryptedData;

                    batch.set(newDocRef, newPayload);
                    batch.delete(oldDocRef);
                    transferredCount++;
                } catch (err) {
                    console.error('Failed to transfer child:', childId, err);
                }
            }

            if (transferredCount > 0) {
                await batch.commit();

                // تحديث Dexie محلياً
                for (const childId of transferSelectedIds) {
                    try {
                        await db.children.update(childId, {
                            syncKey: transferTargetKey,
                            isDirty: false,
                            updatedAt: new Date().toISOString()
                        });
                    } catch (_e) { /* skip if not found locally */ }
                }

                alert(`✅ تم ترحيل ${transferredCount} مخدوم بنجاح!`);
                setTransferSelectedIds(new Set());
                setTransferSourceKey('');
                setTransferTargetKey('');
                setShowTransferTool(false);
            } else {
                alert('لم يتم ترحيل أي مخدوم. تأكد من اختيار مخدومين صحيحين.');
            }
        } catch (error) {
            console.error('Transfer error:', error);
            alert('حدث خطأ أثناء الترحيل: ' + error.message);
        } finally {
            setIsTransferring(false);
        }
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

    const pendingInterventions = useMemo(() => {
        if (!children) return [];
        let interventions = [];
        children.forEach(child => {
            const isChildInScope = isSuperAdmin || isPriest || allowedOsras.some(o => o.syncKey === child.syncKey);
            if (!isChildInScope) return;

            if (child.notes && Array.isArray(child.notes)) {
                child.notes.forEach(note => {
                    if (note?.requiresIntervention && note?.interventionStatus === 'pending') {
                        interventions.push({ ...note, childId: child.id });
                    }
                });
            }
        });
        return interventions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [children, allowedOsras, isSuperAdmin, isPriest]);

    const handleResolveIntervention = async (childId, noteId) => {
        if (!window.confirm('هل أنت متأكد من حل هذه المشكلة وإغلاق طلب التدخل؟')) return;
        
        try {
            const childToUpdate = await db.children.get(childId);
            if (childToUpdate && childToUpdate.notes) {
                const updatedNotes = childToUpdate.notes.map(n => 
                    n.id === noteId ? { ...n, interventionStatus: 'resolved' } : n
                );
                await db.children.update(childId, {
                    notes: updatedNotes,
                    isDirty: true,
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error resolving intervention:', error);
            alert('حدث خطأ أثناء إغلاق الطلب.');
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



                {/* 🔄 أداة ترحيل المخدومين بين الفصول - Super Admin فقط */}
                {isSuperAdmin && !selectedOsraKey && (
                    <div className="mb-6 animate-in fade-in slide-in-from-top-4">
                        <button
                            onClick={() => setShowTransferTool(!showTransferTool)}
                            className="w-full p-4 rounded-2xl font-black text-white shadow-md flex items-center justify-center gap-2 transition-all bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg"
                        >
                            <ArrowLeftRight size={20} />
                            أداة ترحيل المخدومين بين الفصول
                            <ChevronDown size={16} className={`transition-transform ${showTransferTool ? 'rotate-180' : ''}`} />
                        </button>

                        {showTransferTool && (
                            <div className="mt-3 bg-white p-5 rounded-3xl border-2 border-indigo-100 shadow-lg">
                                {/* الفصل المصدر والوجهة */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                    <div>
                                        <label className="block text-xs font-black text-slate-600 mb-2">📤 فصل المصدر</label>
                                        <select
                                            value={transferSourceKey}
                                            onChange={(e) => { setTransferSourceKey(e.target.value); setTransferSelectedIds(new Set()); }}
                                            className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold text-sm bg-slate-50 focus:border-indigo-400 focus:outline-none transition-colors"
                                        >
                                            <option value="">-- اختر فصل المصدر --</option>
                                            {allowedOsras.map(o => (
                                                <option key={o.syncKey} value={o.syncKey || ''}>{o.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-600 mb-2">📥 الفصل الجديد / الوجهة</label>
                                        <select
                                            value={transferTargetKey}
                                            onChange={(e) => setTransferTargetKey(e.target.value)}
                                            className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold text-sm bg-slate-50 focus:border-indigo-400 focus:outline-none transition-colors"
                                        >
                                            <option value="">-- اختر الفصل الجديد --</option>
                                            {allowedOsras.filter(o => o.syncKey !== transferSourceKey).map(o => (
                                                <option key={o.syncKey} value={o.syncKey || ''}>{o.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* جدول المخدومين */}
                                {transferSourceKey && transferSourceChildren.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-black text-slate-700">مخدومين الفصل ({transferSourceChildren.length})</h4>
                                            <button
                                                onClick={handleToggleSelectAll}
                                                className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                            >
                                                {transferSelectedIds.size === transferSourceChildren.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                                            </button>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200">
                                            {transferSourceChildren.map((child) => (
                                                <label
                                                    key={child.id}
                                                    className={`flex items-center gap-3 p-3 border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${transferSelectedIds.has(child.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={transferSelectedIds.has(child.id)}
                                                        onChange={() => handleToggleTransferSelect(child.id)}
                                                        className="w-5 h-5 rounded-md accent-indigo-600 shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-black text-slate-800 block truncate">{child.name}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{String(child.id || '')}</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg shrink-0">
                                                        {String(child.gender || '').includes('ولد') || String(child.gender || '').toLowerCase() === 'boy' ? '👦' : '👧'}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {transferSourceKey && transferSourceChildren.length === 0 && (
                                    <p className="text-center text-sm font-bold text-slate-400 py-6">لا يوجد مخدومين في هذا الفصل.</p>
                                )}

                                {/* زر التنفيذ */}
                                {transferSelectedIds.size > 0 && transferTargetKey && (
                                    <button
                                        onClick={executeTransfer}
                                        disabled={isTransferring}
                                        className={`w-full mt-4 p-3.5 rounded-2xl font-black text-white shadow-md flex items-center justify-center gap-2 transition-all ${isTransferring ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg'}`}
                                    >
                                        <ArrowLeftRight size={18} />
                                        {isTransferring ? 'جاري الترحيل بأمان...' : `ترحيل المخدومين المحددين (${transferSelectedIds.size})`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 🚨 قسم طلبات التدخل الرعوي العاجلة */}
                {!selectedOsraKey && pendingInterventions.length > 0 && (
                    <div className="mb-8 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-2 mb-4 bg-red-100 p-3 rounded-2xl border border-red-200">
                            <AlertTriangle className="text-red-600" size={24} />
                            <h2 className="text-lg font-black text-red-800">طلبات التدخل الرعوي العاجلة ({pendingInterventions.length})</h2>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {pendingInterventions.map((intervention) => (
                                <div key={intervention.id} className="bg-white p-5 rounded-3xl border-2 border-red-100 shadow-md relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pl-4 pr-6">
                                        <div>
                                            <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                                                {intervention.childName} <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{intervention.osraName}</span>
                                            </h3>
                                            <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-1">
                                                <UserCircle size={14} /> الخادم المُبلغ: <span className="text-slate-700">{intervention.servantName}</span> • {new Date(intervention.date).toLocaleDateString('ar-EG')}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleResolveIntervention(intervention.childId, intervention.id)} 
                                            className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl font-black text-sm transition-colors flex items-center gap-2 w-full md:w-auto justify-center"
                                        >
                                            <CheckCircle size={16} /> تمت المتابعة وحل المشكلة
                                        </button>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-sm font-bold text-red-900 whitespace-pre-wrap leading-relaxed mr-6">
                                        "{intervention.text}"
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                                    <span className="text-[10px] font-bold text-indigo-100">مخدوم</span>
                                </div>
                            </div>

                            {!isStageAdmin && (
                                <div className="col-span-1 sm:col-span-2 mt-2">
                                    <ExcelExporter />
                                </div>
                            )}

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
                                            <span className="text-[9px] font-bold text-indigo-400 group-hover:text-amber-500">مخدوم</span>
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

                {/* 🎯 متابعة أنشطة الخدمة */}
                {isSuperAdmin && (
                    <div className="mt-8 pt-6">
                        <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-sm overflow-hidden">
                            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                                <Target className="text-indigo-500" size={24} /> متابعة أنشطة الخدمة
                            </h3>

                            <div className="flex flex-col sm:flex-row gap-2 mb-6">
                                <select 
                                    value={newActivityType} 
                                    onChange={(e) => setNewActivityType(e.target.value)}
                                    className="w-full sm:w-auto shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none"
                                >
                                    <option value="targeted">مستهدف</option>
                                    <option value="executed">منفذ</option>
                                </select>
                                <input 
                                    type="text" 
                                    placeholder="أضف نشاطاً جديداً..." 
                                    value={newActivity} 
                                    onChange={(e) => setNewActivity(e.target.value)}
                                    className="w-full min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddActivity()}
                                />
                                <button 
                                    onClick={handleAddActivity}
                                    className="w-full sm:w-auto shrink-0 bg-indigo-600 text-white px-6 py-3 rounded-xl font-black hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={20} /> إضافة
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Targeted */}
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <h4 className="font-black text-slate-700 mb-4 flex items-center gap-2">
                                        <Target size={18} className="text-blue-500" /> الأنشطة المستهدفة في الخدمة
                                    </h4>
                                    <div className="space-y-3">
                                        {(activities.targeted || []).length === 0 ? (
                                            <p className="text-xs text-slate-400 font-bold text-center">لا توجد أنشطة مستهدفة.</p>
                                        ) : (
                                            (activities.targeted || []).map(act => (
                                                <div key={act.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-3 group">
                                                    <p className="text-sm font-bold text-slate-700 flex-1">{act.text}</p>
                                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleMoveToExecuted(act.id)} className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100" title="نقل إلى المنفذ">
                                                            <CheckSquare size={16} />
                                                        </button>
                                                        <button onClick={() => {
                                                            const newText = prompt("تعديل النشاط:", act.text);
                                                            if (newText && newText.trim()) {
                                                                const updated = { ...activities };
                                                                const idx = updated.targeted.findIndex(a => a.id === act.id);
                                                                if (idx > -1) updated.targeted[idx].text = newText.trim();
                                                                setDoc(doc(firestore, 'System', 'serviceActivities'), updated);
                                                            }
                                                        }} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100">
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button onClick={() => handleDeleteActivity(act.id, 'targeted')} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Executed */}
                                <div className="bg-green-50/30 p-4 rounded-2xl border border-green-100">
                                    <h4 className="font-black text-slate-700 mb-4 flex items-center gap-2">
                                        <CheckCircle size={18} className="text-green-500" /> الأنشطة المنفذة
                                    </h4>
                                    <div className="space-y-3">
                                        {(activities.executed || []).length === 0 ? (
                                            <p className="text-xs text-slate-400 font-bold text-center">لا توجد أنشطة منفذة.</p>
                                        ) : (
                                            (activities.executed || []).map(act => (
                                                <div key={act.id} className="bg-white p-3 rounded-xl shadow-sm border border-green-200 flex items-center justify-between gap-3 group">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <CheckCircle size={20} className="text-green-600 shrink-0" />
                                                        <p className="text-sm font-bold text-slate-800">{act.text}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => {
                                                            const newText = prompt("تعديل النشاط:", act.text);
                                                            if (newText && newText.trim()) {
                                                                const updated = { ...activities };
                                                                const idx = updated.executed.findIndex(a => a.id === act.id);
                                                                if (idx > -1) updated.executed[idx].text = newText.trim();
                                                                setDoc(doc(firestore, 'System', 'serviceActivities'), updated);
                                                            }
                                                        }} className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100">
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button onClick={() => handleDeleteActivity(act.id, 'executed')} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* ⚠️ منطقة الخطر للإدارة المركزية (Global Wipe) */}
                {isSuperAdmin && (
                    <div className="mt-8 pt-6">
                        <div className="bg-red-50 border border-red-200 p-6 rounded-3xl text-center">
                            <h3 className="text-sm font-black text-red-800 mb-2 flex items-center justify-center gap-2">
                                <AlertTriangle className="text-red-500" size={18} /> منطقة الخطر (Danger Zone - Global Wipe)
                            </h3>
                            <p className="text-[10px] font-bold text-red-600/80 mb-4">احذر: هذا القسم يمسح بيانات جميع الفصول على مستوى الكنيسة.</p>
                            
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={async () => {
                                        if (selectedOsraKey && selectedOsraKey !== 'ALL_CHURCH') {
                                            alert("تنبيه: لا يمكن مسح جميع الفصول أثناء تفعيل فلتر لأسرة معينة. قم بإلغاء الفلتر أولاً.");
                                            return;
                                        }
                                        if (window.confirm("⚠️ تحذير شديد: هل أنت متأكد من تصفير العدادات لجميع الفصول بالكامل؟")) {
                                            if (window.confirm("تأكيد أخير: الداتا هتتصفر لجميع الفصول ومش هترجع، كمل؟")) {
                                                try {
                                                    const now = new Date().toISOString();
                                                    const allKids = await db.children.toArray();
                                                    const updates = allKids.map(c => db.children.update(c.id, { streak: 0, last_liturgy: null, last_service: null, last_visited: null, isDirty: true, updatedAt: now }));
                                                    await Promise.all(updates);
                                                    triggerAutoSync();
                                                    alert("تم تصفير العدادات بنجاح لجميع الفصول! 🚀");
                                                } catch (error) {
                                                    console.error(error);
                                                    alert("عطل في قاعدة البيانات: " + error.message);
                                                }
                                            }
                                        }
                                    }} 
                                    className={`w-full py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm ${selectedOsraKey && selectedOsraKey !== 'ALL_CHURCH' ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                                >
                                    <RefreshCw size={16} /> تصفير العدادات لجميع الفصول (Global Reset)
                                </button>
                                
                                <button 
                                    onClick={async () => {
                                        if (selectedOsraKey && selectedOsraKey !== 'ALL_CHURCH') {
                                            alert("تنبيه: لا يمكن مسح جميع الفصول أثناء تفعيل فلتر لأسرة معينة. قم بإلغاء الفلتر أولاً.");
                                            return;
                                        }
                                        if (window.confirm("⚠️ تحذير شديد: هل أنت متأكد من مسح جميع بيانات الخدمة لجميع الفصول بالكامل؟")) {
                                            const confirmPass = appSettings.deletePass || 'مسح';
                                            const pass = prompt(`اكتب كلمة (${confirmPass}) للتأكيد النهائي:`);
                                            if (pass === confirmPass) {
                                                try {
                                                    const now = new Date().toISOString();
                                                    const allKids = await db.children.toArray();
                                                    await Promise.all(allKids.map(c => db.children.update(c.id, { isDeleted: true, isDirty: true, updatedAt: now })));
                                                    
                                                    const allAtt = await db.attendance.toArray();
                                                    await Promise.all(allAtt.map(a => db.attendance.update(a.id, { isDeleted: true, isDirty: true, updatedAt: now })));
                                                    
                                                    triggerAutoSync();
                                                    alert("تم مسح البيانات بالكامل لجميع الفصول! الأرض فاضية. 🧹");
                                                } catch (error) {
                                                    console.error(error);
                                                    alert("عطل في قاعدة البيانات: " + error.message);
                                                }
                                            } else {
                                                alert("تم إلغاء العملية، كلمة المرور خاطئة.");
                                            }
                                        }
                                    }} 
                                    className={`w-full py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-sm border ${selectedOsraKey && selectedOsraKey !== 'ALL_CHURCH' ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed' : 'bg-white text-red-600 border-red-100 hover:bg-red-50'}`}
                                >
                                    <Trash2 size={16} /> مسح المخدومين والغياب لجميع الفصول (Clean Slate)
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}