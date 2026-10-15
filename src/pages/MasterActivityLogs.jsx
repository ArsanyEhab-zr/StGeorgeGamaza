/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, where, startAfter, doc, getDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { 
    ArrowRight, Search, Filter, Calendar, Users, ShieldAlert, Clock, 
    RefreshCw, ChevronDown, FileText, Trash2, UserPlus, Edit3, 
    ArrowLeftRight, Layers, AlertTriangle, CheckCircle, Save, Target, X,
    CheckCircle2
} from 'lucide-react';

// 📋 ترجمة أنواع الإجراءات للعربية مع إيموجي وألوان
const ACTION_TYPE_MAP = {
    'ADD_CHILD':                   { label: 'إضافة مخدوم',        icon: '➕', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'UPDATE_CHILD':                { label: 'تعديل بيانات مخدوم',  icon: '✏️', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    'DELETE_CHILD':                { label: 'حذف مخدوم',          icon: '🗑️', color: 'bg-red-100 text-red-700 border-red-200' },
    'UPDATE_SERVANT_PROFILE':      { label: 'تعديل بروفايل خادم', icon: '👤', color: 'bg-teal-100 text-teal-700 border-teal-200' },
    'SAVE_NOTE':                   { label: 'تقرير افتقاد',       icon: '📝', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    'SAVE_NOTE_WITH_INTERVENTION': { label: 'طلب تدخل أبوي',   icon: '🚨', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    'RESOLVE_INTERVENTION':        { label: 'حل تدخل أبوي',      icon: '✅', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    'RECORD_ATTENDANCE':           { label: 'تسجيل حضور',         icon: '📋', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    'RESET_COUNTERS':              { label: 'تصفير عدادات',       icon: '🔄', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    'NUCLEAR_DELETE':              { label: 'مسح بيانات فصل',    icon: '💣', color: 'bg-red-100 text-red-800 border-red-300' },
    'GLOBAL_RESET':                { label: 'تصفير شامل',         icon: '🔄', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    'GLOBAL_WIPE':                 { label: 'مسح شامل',           icon: '☢️', color: 'bg-red-200 text-red-800 border-red-400' },
    'TRANSFER_CHILDREN':           { label: 'ترحيل مخدومين',      icon: '🔀', color: 'bg-violet-100 text-violet-700 border-violet-200' },
    'SAVE_STRUCTURE':              { label: 'حفظ هيكل الخدمة',    icon: '🏗️', color: 'bg-sky-100 text-sky-700 border-sky-200' },
};

const getActionMeta = (actionType) => ACTION_TYPE_MAP[actionType] || { label: actionType, icon: '📌', color: 'bg-slate-100 text-slate-600 border-slate-200' };

const cleanName = (n) => String(n || '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

// Helper to extract timestamp in milliseconds for robust descending in-memory sorting
const getLogTime = (log) => {
    if (!log) return 0;
    if (log.clientTimestamp) {
        const t = new Date(log.clientTimestamp).getTime();
        if (!isNaN(t) && t > 0) return t;
    }
    if (log.timestamp?.toDate) {
        try {
            const t = log.timestamp.toDate().getTime();
            if (!isNaN(t) && t > 0) return t;
        } catch {}
    }
    if (log.timestamp?.seconds) {
        return log.timestamp.seconds * 1000;
    }
    if (log.createdAt) {
        const t = new Date(log.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
    }
    return 0;
};

const LOGS_PER_PAGE = 30;

export default function MasterActivityLogs() {
    const navigate = useNavigate();

    // 🔐 Auth check
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');
    const isSuperAdmin = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || currentServant.role === 'أدمن مساعد';
    const isPriest = currentServant.role === 'كاهن';
    const hasAccess = isSuperAdmin || isPriest;

    // State
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Filters
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]); // Default: today
    const [servantFilter, setServantFilter] = useState('');
    const [osraFilter, setOsraFilter] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Load settings for osra names & servants
    const [appSettings, setAppSettings] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('appSettings') || '{}');
        } catch {
            return {};
        }
    });

    // Auto-fetch System/mainConfig on mount to ensure fresh servants and osras
    useEffect(() => {
        const fetchSystemConfig = async () => {
            if (!hasAccess || !navigator.onLine) return;
            try {
                const configRef = doc(firestore, 'System', 'mainConfig');
                const snap = await getDoc(configRef);
                if (snap.exists()) {
                    const data = snap.data();
                    const localSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
                    const merged = {
                        ...localSettings,
                        services: data.services || localSettings.services || [],
                        servants: data.servants || localSettings.servants || []
                    };
                    localStorage.setItem('appSettings', JSON.stringify(merged));
                    setAppSettings(merged);
                }
            } catch (err) {
                console.warn('[ActivityLogs] Failed to fetch System/mainConfig:', err);
            }
        };

        fetchSystemConfig();
    }, [hasAccess]);

    const allOsras = useMemo(() => appSettings.services?.flatMap(s => s.osras || []) || [], [appSettings]);

    // Unique servant names from BOTH application settings AND loaded logs
    const uniqueServants = useMemo(() => {
        const names = new Set();

        // 1. Add all church servants from appSettings (System/mainConfig)
        const configServants = appSettings.servants || [];
        configServants.forEach(s => {
            const name = s?.name?.trim();
            if (name) names.add(name);
        });

        // 2. Also add any servant names that appear in logs
        logs.forEach(l => {
            const name = l.servantName?.trim();
            if (name && name !== 'خادم غير معروف') {
                names.add(name);
            }
        });

        return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
    }, [appSettings.servants, logs]);

    // Unique osras/families for filter dropdown (from app settings + logs)
    const uniqueOsras = useMemo(() => {
        const osraMap = new Map();

        // 1. Add all osras from appSettings
        allOsras.forEach(o => {
            if (o.syncKey) {
                osraMap.set(String(o.syncKey).trim(), o.name || o.syncKey);
            }
        });

        // 2. Also add any assignedOsra found in logs
        logs.forEach(l => {
            if (l.assignedOsra) {
                const key = String(l.assignedOsra).trim();
                if (!osraMap.has(key)) {
                    const match = allOsras.find(o => String(o.syncKey).trim() === key);
                    osraMap.set(key, match ? match.name : key);
                }
            }
        });

        return Array.from(osraMap.entries())
            .map(([syncKey, name]) => ({ syncKey, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [allOsras, logs]);

    // Fetch logs
    const fetchLogs = async (isLoadMore = false) => {
        if (!hasAccess) return;

        try {
            isLoadMore ? setIsLoadingMore(true) : setIsLoading(true);
            setError(null);

            const logsRef = collection(firestore, 'activityLogs');
            let newLogs = [];
            let lastVisibleDoc = null;

            if (dateFilter) {
                // 1. Single-field query by dateKey - NEVER requires composite index!
                const q = query(
                    logsRef,
                    where('dateKey', '==', dateFilter),
                    limit(300)
                );
                const snapshot = await getDocs(q);
                newLogs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                // Entire day is fetched in a single batch
                lastVisibleDoc = null;
            } else {
                // 2. Base collection query for all dates
                try {
                    const constraints = [orderBy('clientTimestamp', 'desc')];
                    if (isLoadMore && lastDoc) {
                        constraints.push(startAfter(lastDoc));
                    }
                    constraints.push(limit(LOGS_PER_PAGE));
                    const q = query(logsRef, ...constraints);
                    const snapshot = await getDocs(q);
                    newLogs = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1] || null;
                } catch {
                    // Safe fallback to simple collection query without orderBy
                    const constraints = [limit(LOGS_PER_PAGE)];
                    if (isLoadMore && lastDoc) {
                        constraints.push(startAfter(lastDoc));
                    }
                    const q = query(logsRef, ...constraints);
                    const snapshot = await getDocs(q);
                    newLogs = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1] || null;
                }
            }

            // 3. Strictly in-memory sorting descending by timestamp / clientTimestamp / createdAt
            newLogs.sort((a, b) => getLogTime(b) - getLogTime(a));

            if (isLoadMore) {
                setLogs(prev => {
                    const map = new Map();
                    prev.forEach(item => map.set(item.id, item));
                    newLogs.forEach(item => map.set(item.id, item));
                    const combined = Array.from(map.values());
                    combined.sort((a, b) => getLogTime(b) - getLogTime(a));
                    return combined;
                });
            } else {
                setLogs(newLogs);
            }

            setLastDoc(lastVisibleDoc);
            setHasMore(!dateFilter && newLogs.length === LOGS_PER_PAGE && lastVisibleDoc !== null);
        } catch (err) {
            console.error('[ActivityLogs] Fetch error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        setLastDoc(null);
        setHasMore(true);
        fetchLogs(false);
    }, [dateFilter]);

    // Client-side filtering for servant, osra, action type & search text
    const filteredLogs = useMemo(() => {
        let result = logs;
        if (servantFilter) {
            const cleanTarget = cleanName(servantFilter);
            result = result.filter(l => cleanName(l.servantName) === cleanTarget || l.servantName === servantFilter);
        }
        if (osraFilter) {
            result = result.filter(l => l.assignedOsra === osraFilter);
        }
        if (actionFilter) {
            result = result.filter(l => l.actionType === actionFilter);
        }
        if (searchTerm.trim()) {
            const queryText = searchTerm.toLowerCase();
            result = result.filter(l => 
                (l.details && l.details.toLowerCase().includes(queryText)) ||
                (l.servantName && l.servantName.toLowerCase().includes(queryText)) ||
                (l.assignedOsra && l.assignedOsra.toLowerCase().includes(queryText))
            );
        }
        return result;
    }, [logs, servantFilter, osraFilter, actionFilter, searchTerm]);

    const activeFilterCount = (servantFilter ? 1 : 0) + (osraFilter ? 1 : 0) + (actionFilter ? 1 : 0) + (searchTerm ? 1 : 0);

    const clearAllFilters = () => {
        setServantFilter('');
        setOsraFilter('');
        setActionFilter('');
        setSearchTerm('');
    };

    const formatTime = (log) => {
        try {
            const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.clientTimestamp);
            return ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return '—';
        }
    };

    const formatFullDate = (log) => {
        try {
            const ts = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.clientTimestamp);
            return ts.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } catch {
            return log.dateKey || '—';
        }
    };

    const getOsraDisplayName = (syncKey) => {
        if (!syncKey) return '';
        const found = allOsras.find(o => o.syncKey === syncKey);
        return found ? found.name : syncKey;
    };

    // 🚫 Access denied
    if (!hasAccess) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
                <div className="bg-slate-800 p-8 rounded-[2.5rem] text-center shadow-2xl border border-slate-700 max-w-sm w-full">
                    <ShieldAlert className="text-red-500 mx-auto mb-4 w-16 h-16" strokeWidth={1.5} />
                    <h2 className="text-2xl font-black text-white mb-2">غير مصرح لك بالدخول</h2>
                    <p className="text-slate-400 text-sm mb-6">سجل النشاط مخصص للآباء الكهنة والمسؤول العام فقط.</p>
                    <button onClick={() => navigate(-1)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black hover:bg-indigo-700 w-full transition-colors">العودة</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-24" dir="rtl">
            {/* ─── Header ─── */}
            <header className="bg-gradient-to-l from-slate-800 to-slate-900 text-white p-4 sticky top-0 z-50 shadow-xl rounded-b-[2.5rem]">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} aria-label="الرجوع" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-all shrink-0 backdrop-blur-md">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black flex items-center gap-2">
                                <FileText size={20} className="text-amber-400" /> سجل النشاط المركزي
                            </h1>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                مراقبة وتتبع جميع الإجراءات الحساسة للخدام عبر الأسر
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => fetchLogs(false)} 
                        className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center hover:bg-amber-500/30 transition-all backdrop-blur-md text-amber-300"
                        title="تحديث السجلات"
                    >
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </header>

            <main className="p-4 max-w-4xl mx-auto mt-4 space-y-4">

                {/* ─── Search & Date Bar ─── */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Primary Row: Date + Search */}
                    <div className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {/* Date Picker */}
                            <div className="flex-1 relative">
                                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-xs sm:text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                />
                            </div>

                            {/* Quick Date Shortcuts */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
                                    className={`px-3 py-2.5 rounded-xl font-black text-xs transition-all border ${dateFilter === new Date().toISOString().split('T')[0] ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    اليوم
                                </button>
                                <button
                                    onClick={() => setDateFilter('')}
                                    className={`px-3 py-2.5 rounded-xl font-black text-xs transition-all border ${!dateFilter ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    كل الأيام
                                </button>
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`px-3 py-2.5 rounded-xl font-black text-xs transition-all border flex items-center gap-1 ${showFilters || activeFilterCount > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                >
                                    <Filter size={14} /> فلاتر
                                    {activeFilterCount > 0 && (
                                        <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                                            {activeFilterCount}
                                        </span>
                                    )}
                                    <ChevronDown size={14} className={`transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="بحث في تفاصيل الإجراء أو اسم الخادم..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-400"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Expandable filters (Servant, Osra, Action Type) */}
                    {showFilters && (
                        <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/50 animate-in slide-in-from-top-2 fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* Servant filter */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-500 mb-1 pr-1">👤 فلترة بالخادم</label>
                                    <select
                                        value={servantFilter}
                                        onChange={(e) => setServantFilter(e.target.value)}
                                        className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-white focus:border-amber-400 focus:outline-none transition-colors"
                                    >
                                        <option value="">جميع الخدام ({uniqueServants.length})</option>
                                        {uniqueServants.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Osra / Family filter */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-500 mb-1 pr-1">🏠 فلترة بالأسرة / الفصل</label>
                                    <select
                                        value={osraFilter}
                                        onChange={(e) => setOsraFilter(e.target.value)}
                                        className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-white focus:border-amber-400 focus:outline-none transition-colors"
                                    >
                                        <option value="">جميع الأسر ({uniqueOsras.length})</option>
                                        {uniqueOsras.map(o => (
                                            <option key={o.syncKey} value={o.syncKey}>{o.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Action type filter */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-500 mb-1 pr-1">⚡ فلترة بنوع الإجراء</label>
                                    <select
                                        value={actionFilter}
                                        onChange={(e) => setActionFilter(e.target.value)}
                                        className="w-full p-2.5 rounded-xl border border-slate-200 font-bold text-xs bg-white focus:border-amber-400 focus:outline-none transition-colors"
                                    >
                                        <option value="">جميع أنواع الإجراءات</option>
                                        {Object.entries(ACTION_TYPE_MAP).map(([key, val]) => (
                                            <option key={key} value={key}>{val.icon} {val.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Clear filters shortcut */}
                            {activeFilterCount > 0 && (
                                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                                    <span className="text-[11px] font-bold text-indigo-700">
                                        تم تفعيل {activeFilterCount} فلتر
                                    </span>
                                    <button
                                        onClick={clearAllFilters}
                                        className="text-xs font-black text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
                                    >
                                        <X size={12} /> مسح جميع الفلاتر
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── Stats Summary ─── */}
                {!isLoading && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-xs">
                            <span className="text-2xl font-black text-indigo-600">{filteredLogs.length}</span>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">إجراء مسجّل</p>
                        </div>
                        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-xs">
                            <span className="text-2xl font-black text-amber-600">{new Set(filteredLogs.map(l => l.servantName)).size}</span>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">خادم نشط</p>
                        </div>
                        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-xs">
                            <span className="text-2xl font-black text-red-600">{filteredLogs.filter(l => ['DELETE_CHILD', 'NUCLEAR_DELETE', 'GLOBAL_WIPE', 'GLOBAL_RESET'].includes(l.actionType)).length}</span>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">عمليات حساسة / حذف</p>
                        </div>
                    </div>
                )}

                {/* ─── Loading State ─── */}
                {isLoading && (
                    <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
                        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-sm font-bold text-slate-600">جاري تحميل سجل النشاط...</p>
                        <p className="text-xs text-slate-400 mt-1">يتم جلب البيانات من السحابة</p>
                    </div>
                )}

                {/* ─── Error State ─── */}
                {error && (
                    <div className="bg-red-50 border border-red-200 p-6 rounded-3xl text-center">
                        <AlertTriangle className="text-red-500 mx-auto mb-3" size={32} />
                        <p className="text-sm font-bold text-red-700 mb-2">حدث خطأ أثناء تحميل السجلات</p>
                        <p className="text-xs text-red-500 mb-4 break-all">{error}</p>
                        <button onClick={() => fetchLogs(false)} className="bg-red-600 text-white px-6 py-2 rounded-xl font-black text-sm hover:bg-red-700 transition-colors">
                            إعادة المحاولة
                        </button>
                    </div>
                )}

                {/* ─── Empty State ─── */}
                {!isLoading && !error && filteredLogs.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                        <FileText className="text-slate-300 mx-auto mb-4" size={48} />
                        <p className="text-lg font-black text-slate-700 mb-1">لا توجد سجلات مطابقة</p>
                        <p className="text-xs font-bold text-slate-400 max-w-xs mx-auto">
                            {dateFilter ? `لا توجد إجراءات مسجلة ليوم ${dateFilter}` : 'لم يتم تسجيل أي عمليات ضمن الفلاتر المحددة'}
                        </p>
                        {activeFilterCount > 0 && (
                            <button
                                onClick={clearAllFilters}
                                className="mt-4 text-xs font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors"
                            >
                                إلغاء جميع الفلاتر
                            </button>
                        )}
                    </div>
                )}

                {/* ─── Logs List ─── */}
                {!isLoading && !error && filteredLogs.length > 0 && (
                    <div className="space-y-3">
                        {filteredLogs.map((log, index) => {
                            const meta = getActionMeta(log.actionType);
                            const isDangerous = ['DELETE_CHILD', 'NUCLEAR_DELETE', 'GLOBAL_WIPE', 'GLOBAL_RESET'].includes(log.actionType);
                            const osraName = getOsraDisplayName(log.assignedOsra);

                            return (
                                <div
                                    key={log.id}
                                    className={`bg-white rounded-2xl shadow-xs border overflow-hidden group transition-all hover:shadow-md ${isDangerous ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'}`}
                                >
                                    {/* Colored top accent */}
                                    <div className={`h-1 ${isDangerous ? 'bg-gradient-to-l from-red-500 to-orange-500' : 'bg-gradient-to-l from-amber-400 to-amber-500'}`}></div>

                                    <div className="p-4">
                                        {/* Row 1: Action Badge + Time */}
                                        <div className="flex items-start justify-between gap-2 mb-2.5">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${meta.color}`}>
                                                <span className="text-sm">{meta.icon}</span> {meta.label}
                                            </span>
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 shrink-0 bg-slate-50 px-2.5 py-1 rounded-lg">
                                                <Clock size={12} className="text-slate-400" />
                                                <span>{formatTime(log)}</span>
                                                {!dateFilter && (
                                                    <span className="text-[10px] text-slate-400 mr-1">({log.dateKey})</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Row 2: Details */}
                                        <p className="text-sm font-bold text-slate-800 leading-relaxed mb-3 pr-1">
                                            {log.details}
                                        </p>

                                        {/* Row 3: Servant info + Osra */}
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs font-bold pt-2 border-t border-slate-100">
                                            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                                👤 {log.servantName}
                                            </span>
                                            {osraName && (
                                                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                                    🏠 {osraName}
                                                </span>
                                            )}
                                            {log.role && (
                                                <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg">
                                                    🏷️ {log.role}
                                                </span>
                                            )}
                                            {log.servantPhone && (
                                                <span className="text-slate-400 px-1 font-mono text-[10px]" dir="ltr">
                                                    {log.servantPhone}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Load More Button */}
                        {hasMore && (
                            <button
                                onClick={() => fetchLogs(true)}
                                disabled={isLoadingMore}
                                className={`w-full py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${isLoadingMore ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:shadow-xs'}`}
                            >
                                {isLoadingMore ? (
                                    <><RefreshCw size={16} className="animate-spin" /> جاري التحميل...</>
                                ) : (
                                    <><ChevronDown size={16} /> تحميل المزيد من السجلات</>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
