import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { syncDataWithCloud } from '../db/sync';
import { logActivity } from '../utils/activityLogger';
import { Link } from 'react-router-dom';
import {
    BellRing, ChevronUp, ChevronDown, CalendarX, HeartHandshake,
    CheckCircle2, MessageCircle, X, Phone, CheckCircle, Clock
} from 'lucide-react';

/**
 * 🚨 SmartAlertsCard — كارت التنبيهات الذكية والمتابعة الفورية
 * Reactively computes alerts for consecutive absences and missing visitations.
 * All dismiss/resolve mutations write directly to Dexie and sync with Firestore
 * ensuring instant cross-device updates for all servants and admins.
 */
export default function SmartAlertsCard({ activeClassKey = null, customSyncKey = null, isMasterProp = null }) {
    const currentSyncKey = customSyncKey || localStorage.getItem('currentSyncKey');
    const currentServantObj = JSON.parse(localStorage.getItem('currentServant') || '{}');
    const allowedClasses = currentServantObj.allowedClasses || [];
    const isMaster = isMasterProp !== null 
        ? isMasterProp 
        : (currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE');
    const isStageAdmin = currentSyncKey === 'STAGE_ADMIN';

    // UI accordion state (client-only display preference)
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('smartAlertsExpanded');
        return saved !== null ? saved === 'true' : true;
    });
    const [alertFilter, setAlertFilter] = useState('all'); // 'all' | 'absence' | 'visitation'
    const [isActionLoading, setIsActionLoading] = useState(false);

    const appSettingsStr = localStorage.getItem('appSettings');
    const appSettings = appSettingsStr ? JSON.parse(appSettingsStr) : {};

    const getOsraName = (syncKey) => {
        if (!syncKey) return '';
        try {
            const services = appSettings.services || [];
            for (const s of services) {
                const found = (s.osras || []).find(o => String(o.syncKey).trim() === String(syncKey).trim());
                if (found) return found.name;
            }
        } catch (_e) {}
        return '';
    };

    const selectedClassLabel = useMemo(() => {
        if (!isMaster) return '';
        if (activeClassKey && activeClassKey !== 'MASTER_ACCESS' && activeClassKey !== 'ADMIN_MODE' && activeClassKey !== 'all') {
            const found = getOsraName(activeClassKey);
            return found ? `أسرة ${found}` : activeClassKey;
        }
        return 'كل الأسر (عام)';
    }, [isMaster, activeClassKey, appSettings]);

    const getChildPhone = (c) => {
        if (c.whatsappTarget === 'father' && c.fatherPhone) return c.fatherPhone;
        if (c.whatsappTarget === 'child' && c.childPhone) return c.childPhone;
        if (c.motherPhone) return c.motherPhone;
        if (c.childPhone) return c.childPhone;
        if (c.fatherPhone) return c.fatherPhone;
        return c.phone || '';
    };

    const getWhatsAppUrl = (child, alertType) => {
        const phone = String(getChildPhone(child)).replace(/\D/g, '').replace(/^0+/, '');
        if (!phone) return null;
        const firstName = child.name ? child.name.split(' ')[0] : 'مخدومنا الغالي';
        const msg = alertType === 'absence'
            ? `سلام يا ${firstName}.. وحشتنا جداً في الكنيسة وافتقدناك في الخدمة، طمنا عليك! 🌟`
            : `سلام ونعمة يا ${firstName}.. بنحب نطمن عليك ونشوف أخبارك إيه، ربنا يباركك! 🌸`;
        return `https://api.whatsapp.com/send?phone=20${phone}&text=${encodeURIComponent(msg)}`;
    };

    const parseDateToMs = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const d = new Date(val);
        const ts = d.getTime();
        return isNaN(ts) ? 0 : ts;
    };

    // 🌟🌟🌟 Strict Reactivity: Entire alert computation inside useLiveQuery 🌟🌟🌟
    // Subscribes automatically to both db.children and db.attendance
    const alertsData = useLiveQuery(async () => {
        const nowTs = Date.now();
        const thirtyDaysAgoTs = nowTs - (30 * 24 * 60 * 60 * 1000);
        const targetKey = customSyncKey || currentSyncKey;

        // 1. Scoped Children Query
        let kids = [];
        if (isMaster) {
            // If the Admin explicitly selected a specific class filter (e.g. 'St_Ephrem_2026')
            if (activeClassKey && activeClassKey !== 'MASTER_ACCESS' && activeClassKey !== 'ADMIN_MODE' && activeClassKey !== 'all') {
                kids = await db.children.where('syncKey').equals(activeClassKey).toArray();
            } else {
                // Only show ALL children if no specific class is selected
                kids = await db.children.toArray();
            }
        } else if (isStageAdmin) {
            if (activeClassKey && activeClassKey !== 'all' && allowedClasses.includes(activeClassKey)) {
                kids = await db.children.where('syncKey').equals(activeClassKey).toArray();
            } else {
                if (allowedClasses.length === 0) return { absenceAlerts: [], visitationAlerts: [], allAlerts: [] };
                kids = await db.children.where('syncKey').anyOf(allowedClasses).toArray();
            }
        } else if (targetKey) {
            kids = await db.children.where('syncKey').equals(targetKey).toArray();
        }

        // Filter soft-deleted
        kids = kids.filter(c => !c.isDeleted);

        // For Master Admin showing all classes, filter out orphaned kids not in any active Osra
        if (isMaster && (!activeClassKey || activeClassKey === 'all' || activeClassKey === 'MASTER_ACCESS' || activeClassKey === 'ADMIN_MODE')) {
            const saved = localStorage.getItem('appSettings');
            const settings = saved ? JSON.parse(saved) : {};
            const allValidSyncKeys = (settings.services || []).flatMap(s => s.osras || []).map(o => o.syncKey);
            kids = kids.filter(c => allValidSyncKeys.includes(c.syncKey));
        }

        // 🛑 Global Snooze / Dismiss filter: ignore children snoozed within the active window
        kids = kids.filter(c => {
            if (c.alertSnoozedUntil && Number(c.alertSnoozedUntil) > nowTs) {
                return false;
            }
            return true;
        });

        // 2. Scoped Attendance Query
        let attendanceRecords = [];
        if (isMaster) {
            if (activeClassKey && activeClassKey !== 'MASTER_ACCESS' && activeClassKey !== 'ADMIN_MODE' && activeClassKey !== 'all') {
                attendanceRecords = await db.attendance.where('syncKey').equals(activeClassKey).toArray();
            } else {
                attendanceRecords = await db.attendance.toArray();
            }
        } else if (isStageAdmin) {
            if (activeClassKey && activeClassKey !== 'all' && allowedClasses.includes(activeClassKey)) {
                attendanceRecords = await db.attendance.where('syncKey').equals(activeClassKey).toArray();
            } else {
                if (allowedClasses.length === 0) return { absenceAlerts: [], visitationAlerts: [], allAlerts: [] };
                attendanceRecords = await db.attendance.where('syncKey').anyOf(allowedClasses).toArray();
            }
        } else if (targetKey) {
            attendanceRecords = await db.attendance.where('syncKey').equals(targetKey).toArray();
        }
        attendanceRecords = attendanceRecords.filter(r => !r.isDeleted);

        // 3. Extract recorded Fridays and meeting dates
        const fridaysSet = new Set();
        const allDatesSet = new Set();
        attendanceRecords.forEach(a => {
            if (a.date) {
                const d = new Date(a.date + 'T12:00:00');
                if (d.getDay() === 5) {
                    fridaysSet.add(a.date);
                }
                if (a.type === 'service' || a.type === 'liturgy') {
                    allDatesSet.add(a.date);
                }
            }
        });
        const recordedFridays = Array.from(fridaysSet).sort().reverse();
        const allRecordedDates = Array.from(allDatesSet).sort().reverse();

        // 4. Consecutive Absences (last 3 Fridays)
        const absenceAlerts = kids.filter(child => {
            const classFridays = recordedFridays.filter(fDate => {
                return attendanceRecords.some(a => a.date === fDate && (isMaster || a.syncKey === child.syncKey));
            });

            const targetDates = classFridays.length >= 3
                ? classFridays.slice(0, 3)
                : (allRecordedDates.length >= 3 ? allRecordedDates.slice(0, 3) : classFridays);

            if (targetDates.length < 3) {
                const explicitAbsents = attendanceRecords.filter(a => String(a.childId) === String(child.id) && a.status === 'absent');
                return explicitAbsents.length >= 3;
            }

            const attendedAny = targetDates.some(d => {
                return attendanceRecords.some(a =>
                    String(a.childId) === String(child.id) &&
                    a.date === d &&
                    a.status === 'present'
                );
            });

            return !attendedAny;
        }).map(child => {
            const classFridays = recordedFridays.filter(fDate => {
                return attendanceRecords.some(a => a.date === fDate && (isMaster || a.syncKey === child.syncKey));
            });
            const dates = (classFridays.length >= 3 ? classFridays : allRecordedDates).slice(0, 3);
            return {
                id: `absence_${child.id}`,
                childId: child.id,
                type: 'absence',
                child,
                title: 'غياب 3 جمع متتالية',
                description: dates.length > 0 ? `غائب في أيام: ${dates.join(' ، ')}` : 'غياب متكرر عن الخدمة',
                severity: 'danger',
                dates
            };
        });

        // 5. Missing Visitation (no visitation in last 30 days)
        const lastVisitationMap = {};
        attendanceRecords.forEach(a => {
            if (a.type === 'visitation' && a.date) {
                const cid = String(a.childId);
                const aDateTs = new Date(a.date + 'T12:00:00').getTime();
                if (!lastVisitationMap[cid] || aDateTs > lastVisitationMap[cid].ts) {
                    lastVisitationMap[cid] = { ts: aDateTs, dateStr: a.date };
                }
            }
        });

        const visitationAlerts = kids.filter(child => {
            let lastVisitedTs = parseDateToMs(child.last_visited);
            const attVis = lastVisitationMap[String(child.id)];
            if (attVis && attVis.ts > lastVisitedTs) {
                lastVisitedTs = attVis.ts;
            }

            if (lastVisitedTs === 0) return true; // Never visited
            return lastVisitedTs < thirtyDaysAgoTs;
        }).map(child => {
            let lastVisitedTs = parseDateToMs(child.last_visited);
            let lastVisitedStr = child.last_visited 
                ? (typeof child.last_visited === 'number' 
                    ? new Date(child.last_visited).toISOString().split('T')[0] 
                    : String(child.last_visited).split('T')[0]) 
                : null;

            const attVis = lastVisitationMap[String(child.id)];
            if (attVis && attVis.ts > lastVisitedTs) {
                lastVisitedTs = attVis.ts;
                lastVisitedStr = attVis.dateStr;
            }

            let note = 'لم يتم تسجيل أي افتقاد له مسبقاً';
            if (lastVisitedTs > 0 && lastVisitedStr) {
                const diffDays = Math.ceil(Math.abs(nowTs - lastVisitedTs) / (1000 * 60 * 60 * 24));
                note = `آخر افتقاد: منذ ${diffDays} يوم (${lastVisitedStr})`;
            }

            return {
                id: `visitation_${child.id}`,
                childId: child.id,
                type: 'visitation',
                child,
                title: 'لم يتم افتقاده منذ أكثر من شهر',
                description: note,
                severity: 'warning',
                lastVisitedStr
            };
        });

        const allAlerts = [...absenceAlerts, ...visitationAlerts];

        return {
            absenceAlerts,
            visitationAlerts,
            allAlerts,
            totalCount: allAlerts.length
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentSyncKey, isMaster, isStageAdmin, JSON.stringify(allowedClasses), activeClassKey]);

    const safeAlertsData = alertsData || { absenceAlerts: [], visitationAlerts: [], allAlerts: [], totalCount: 0 };
    const { absenceAlerts, visitationAlerts, allAlerts, totalCount } = safeAlertsData;

    const filteredAlerts = alertFilter === 'absence'
        ? absenceAlerts
        : alertFilter === 'visitation'
            ? visitationAlerts
            : allAlerts;

    // 🌟 Helper to update child record in Dexie safely (handles both number and string IDs)
    const updateChildInDexie = async (id, changes) => {
        try {
            await db.children.update(id, changes);
        } catch (_e) {
            const numId = Number(id);
            if (!isNaN(numId)) {
                await db.children.update(numId, changes);
            }
        }
    };

    // 🌟🌟🌟 1. Global "Log Visitation" Sync 🌟🌟🌟
    const handleResolveAlert = async (alertItem) => {
        try {
            setIsActionLoading(true);
            const child = alertItem.child;
            const nowTs = Date.now();
            const todayStr = new Date().toISOString().split('T')[0];
            const nowIso = new Date().toISOString();
            const targetSyncKey = child.syncKey || currentSyncKey || 'default';

            // 1. Update child profile in Dexie directly with timestamp
            await updateChildInDexie(child.id, {
                last_visited: nowTs,
                isDirty: true,
                updatedAt: nowTs
            });

            // 2. Also log a visitation record in attendance
            await db.attendance.add({
                date: todayStr,
                childId: String(child.id),
                type: 'visitation',
                status: 'present',
                syncKey: targetSyncKey,
                isDirty: true,
                updatedAt: nowIso,
                isDeleted: false
            });

            logActivity('SAVE_NOTE', `تسجيل افتقاد فوري عبر التنبيهات الذكية: ${child.name || child.id}`);

            // 3. Push to Firestore immediately so all other devices drop the child in real time
            syncDataWithCloud().catch(err => console.warn('Sync failed:', err));

            alert(`✅ تم تسجيل افتقاد ${child.name} بنجاح ومزامنة التنبيه لجميع الخدام!`);
        } catch (err) {
            console.error("Error resolving alert:", err);
            alert("حدث خطأ أثناء حفظ الافتقاد: " + err.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    // 🌟🌟🌟 2. Global "Snooze / Dismiss" (تأجيل 7 أيام) 🌟🌟🌟
    const handleSnoozeAlert = async (alertItem) => {
        try {
            setIsActionLoading(true);
            const child = alertItem.child;
            const snoozeUntil = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
            const nowTs = Date.now();

            // 1. Update child in Dexie with global snooze timestamp
            await updateChildInDexie(child.id, {
                alertSnoozedUntil: snoozeUntil,
                isDirty: true,
                updatedAt: nowTs
            });

            logActivity('UPDATE_CHILD', `تأجيل تنبيه المخدوم 7 أيام: ${child.name || child.id}`);

            // 2. Trigger global cloud sync immediately so snooze applies to all devices
            syncDataWithCloud().catch(err => console.warn('Sync failed:', err));
        } catch (err) {
            console.error("Error snoozing alert:", err);
            alert("حدث خطأ أثناء تأجيل التنبيه: " + err.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <div className="mb-6 bg-white rounded-[2rem] border border-amber-200/90 shadow-md shadow-amber-500/5 overflow-hidden transition-all duration-300">
            {/* شريط العنوان وزرار الطي والفتح */}
            <div 
                onClick={() => {
                    setIsExpanded(prev => {
                        const next = !prev;
                        localStorage.setItem('smartAlertsExpanded', String(next));
                        return next;
                    });
                }}
                className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none bg-gradient-to-r from-amber-50 via-white to-orange-50 hover:from-amber-100/70 hover:to-orange-100/60 transition-colors"
            >
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                        <BellRing size={22} className={totalCount > 0 ? "animate-bounce" : ""} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base sm:text-lg font-black text-slate-800">التنبيهات الذكية والمتابعة الفورية</h2>
                            {isMaster && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    {selectedClassLabel}
                                </span>
                            )}
                            {totalCount > 0 && (
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">
                            {totalCount > 0
                                ? `يوجد ${totalCount} مخدوم بحاجة للمتابعة الفورية (${absenceAlerts.length} غياب 3 جمع • ${visitationAlerts.length} مطلوب افتقاد)${isMaster ? ` • نطاق: ${selectedClassLabel}` : ''}`
                                : `رائع! كل المخدومين في ${isMaster ? selectedClassLabel : 'الفصل'} منتظمين ومفتقدين في الموعد المحدد 🎉`}
                        </p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${totalCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {totalCount} تنبيه
                    </span>
                    <button
                        type="button"
                        aria-label={isExpanded ? "طي التنبيهات" : "عرض التنبيهات"}
                        className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-100 transition-colors shrink-0"
                    >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {/* محتوى التنبيهات القابل للطي */}
            {isExpanded && (
                <div className="p-4 sm:p-5 border-t border-amber-100 bg-white space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* تصنيفات التنبيهات */}
                    {totalCount > 0 && (
                        <div className="flex flex-wrap gap-2 pb-1 border-b border-slate-100">
                            <button
                                type="button"
                                onClick={() => setAlertFilter('all')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${alertFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                الكل ({totalCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAlertFilter('absence')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${alertFilter === 'absence' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100'}`}
                            >
                                <CalendarX size={14} /> غياب 3 جمع ({absenceAlerts.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAlertFilter('visitation')}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${alertFilter === 'visitation' ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'}`}
                            >
                                <HeartHandshake size={14} /> مطلوب افتقاد ({visitationAlerts.length})
                            </button>
                        </div>
                    )}

                    {/* قائمة التنبيهات */}
                    {filteredAlerts.length === 0 ? (
                        <div className="py-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                            <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
                            <p className="text-sm font-black text-slate-700">لا يوجد تنبيهات ضمن هذا التصنيف</p>
                            <p className="text-xs font-bold text-slate-400 mt-1">جميع المخدومين في حالة متابعة ممتازة</p>
                        </div>
                    ) : (
                        <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
                            {filteredAlerts.map(item => {
                                const child = item.child;
                                const isAbsence = item.type === 'absence';
                                const osraTitle = isMaster ? getOsraName(child.syncKey) : '';
                                const phone = getChildPhone(child);
                                const waUrl = getWhatsAppUrl(child, item.type);

                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                            isAbsence
                                                ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300'
                                                : 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
                                        }`}
                                    >
                                        {/* بيانات المخدوم */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-white shadow-sm flex items-center justify-center text-xl">
                                                    {child.profilePic ? (
                                                        <img
                                                            src={child.profilePic}
                                                            alt={child.name}
                                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        child.gender === 'بنت' ? '👧' : '👦'
                                                    )}
                                                </div>
                                                <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] ${isAbsence ? 'bg-rose-600' : 'bg-amber-500'}`}>
                                                    {isAbsence ? '⚠️' : '🤝'}
                                                </span>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Link
                                                        to={`/child/${child.id}`}
                                                        className="font-black text-sm text-slate-800 hover:text-indigo-600 transition-colors truncate"
                                                    >
                                                        {child.name || 'بدون اسم'}
                                                    </Link>
                                                    {osraTitle && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            {osraTitle}
                                                        </span>
                                                    )}
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                        isAbsence
                                                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                                                    }`}>
                                                        {item.title}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-500 mt-1">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>

                                        {/* أزرار الإجراءات الفورية */}
                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                            {waUrl && (
                                                <a
                                                    href={waUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors shadow-xs"
                                                    title="إرسال رسالة واتساب"
                                                >
                                                    <MessageCircle size={15} />
                                                </a>
                                            )}
                                            {phone && (
                                                <a
                                                    href={`tel:${phone}`}
                                                    className="w-8 h-8 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors shadow-xs"
                                                    title={`اتصال: ${phone}`}
                                                >
                                                    <Phone size={15} />
                                                </a>
                                            )}
                                            <button
                                                type="button"
                                                disabled={isActionLoading}
                                                onClick={() => handleResolveAlert(item)}
                                                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                                                title="تسجيل افتقاد فوري وحل التنبيه لجميع الخدام"
                                            >
                                                <CheckCircle size={14} /> تسجيل افتقاد
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isActionLoading}
                                                onClick={() => handleSnoozeAlert(item)}
                                                className="text-slate-400 hover:text-amber-600 p-1.5 rounded-lg hover:bg-amber-50 transition-colors flex items-center gap-1"
                                                title="تأجيل التنبيه لمدة 7 أيام وإخفاؤه للجميع"
                                            >
                                                <Clock size={15} />
                                                <span className="text-[10px] font-bold hidden sm:inline">تأجيل 7 أيام</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
