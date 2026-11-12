import { attendanceIdentity, resolveAttendanceChild } from '../utils/childIdentity';
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Search, Church, BookOpen, CheckCheck, X, MessageCircleWarning, History, UserMinus, UserCheck, Calendar } from 'lucide-react';
import useAutoSync from '../hooks/useAutoSync';
import BottomNav from '../components/BottomNav';
import { logActivity } from '../utils/activityLogger';
import {
    getDefaultServiceDateForClass,
    isThursdayServiceClass,
    resolveClassInfo,
    getLocalDateString
} from '../utils/serviceWeek';
import { useChurchDataEngine } from '../hooks/useChurchDataEngine';

export default function Attendance() {
    const { triggerAutoSync } = useAutoSync();
    const location = useLocation();
    const navigate = useNavigate();
    const passedDate = location.state?.preselectedDate;

    const [activeFilter, setActiveFilter] = useState(sessionStorage.getItem('attendance_filter') || "all");
    const [searchQuery, setSearchQuery] = useState(sessionStorage.getItem('attendance_search') || "");
    const [modalState, setModalState] = useState({ isOpen: false, type: null });

    // Sync state with sessionStorage
    useEffect(() => sessionStorage.setItem('attendance_filter', activeFilter), [activeFilter]);
    useEffect(() => sessionStorage.setItem('attendance_search', searchQuery), [searchQuery]);

    // 🔐 Resolve active class syncKey & className
    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '').trim();
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || currentSyncKey === 'STAGE_ADMIN';
    const dashboardActiveClass = sessionStorage.getItem('dashboard_activeClassKey') || 'all';
    const activeSyncKey = (isMaster && dashboardActiveClass && dashboardActiveClass !== 'all')
        ? dashboardActiveClass
        : currentSyncKey;

    const classInfo = useMemo(() => resolveClassInfo(activeSyncKey), [activeSyncKey]);
    const activeClassName = classInfo.className || localStorage.getItem('assignedOsra') || '';
    const isThursdayClass = useMemo(
        () => isThursdayServiceClass(activeSyncKey, activeClassName),
        [activeSyncKey, activeClassName]
    );

    // 🌟 Smart default service date (Thursday for Thursday classes or on Thursdays, Friday for Friday classes)
    const targetDate = useMemo(() => {
        return getDefaultServiceDateForClass(activeSyncKey, activeClassName);
    }, [activeSyncKey, activeClassName]);

    const [hasManualDate, setHasManualDate] = useState(() => Boolean(passedDate));
    const [selectedDate, setSelectedDate] = useState(() => {
        if (passedDate) return passedDate;
        const savedManualKey = sessionStorage.getItem('attendance_manual_syncKey');
        const savedManualDate = sessionStorage.getItem('attendance_manual_date');
        if (savedManualKey === activeSyncKey && savedManualDate) {
            return savedManualDate;
        }
        return getDefaultServiceDateForClass(activeSyncKey, activeClassName);
    });

    // If user switches classes and hasn't manually picked a custom date for the new class, update to that class's default service date
    useEffect(() => {
        if (passedDate) return;
        const savedManualKey = sessionStorage.getItem('attendance_manual_syncKey');
        if (!hasManualDate || savedManualKey !== activeSyncKey) {
            const nextDefault = getDefaultServiceDateForClass(activeSyncKey, activeClassName);
            setSelectedDate(nextDefault);
            setHasManualDate(false);
        }
    }, [activeSyncKey, activeClassName, passedDate, hasManualDate]);

    useEffect(() => {
        sessionStorage.setItem('attendance_date', selectedDate);
    }, [selectedDate]);

    const handleDateChange = (e) => {
        const val = e.target.value;
        if (!val) return;
        setHasManualDate(true);
        setSelectedDate(val);
        sessionStorage.setItem('attendance_manual_syncKey', activeSyncKey);
        sessionStorage.setItem('attendance_manual_date', val);
    };

    const handlePreviousWeek = () => {
        const d = new Date(`${selectedDate}T12:00:00`);
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() - 7);
            const prevStr = getLocalDateString(d);
            setHasManualDate(true);
            setSelectedDate(prevStr);
            sessionStorage.setItem('attendance_manual_syncKey', activeSyncKey);
            sessionStorage.setItem('attendance_manual_date', prevStr);
        }
    };

    const handleResetToCurrentWeek = () => {
        const defDate = getDefaultServiceDateForClass(activeSyncKey, activeClassName);
        setHasManualDate(false);
        setSelectedDate(defDate);
        sessionStorage.removeItem('attendance_manual_syncKey');
        sessionStorage.removeItem('attendance_manual_date');
    };

    // 🌟 Single Source of Truth Engine for children & selectedDate attendance
    const {
        activeChildren: canonicalChildren,
        validatedAttendance, canonicalData
    } = useChurchDataEngine(activeSyncKey, {
        exactDate: selectedDate,
        targetSyncKey: activeSyncKey
    });

    // Raw attendance records for selectedDate to display exact button states (present / absent / excused)
    const attendanceRecords = useLiveQuery(
        () => db.attendance.where('date').equals(selectedDate).toArray(),
        [selectedDate]
    );

    const statusByChildAndType = useMemo(() => {
        const map = new Map();
        for (const r of (attendanceRecords || [])) {
            if (!r || !r.type) continue;
            const resolvedChild = resolveAttendanceChild(r, canonicalData);
            if (!resolvedChild) continue;
            const key = `${String(resolvedChild.id)}::${r.type}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, r);
            } else {
                const t1 = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                const t2 = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
                if (t2 >= t1) map.set(key, r);
            }
        }
        return map;
    }, [attendanceRecords, canonicalData]);

    const getAttendanceStatus = (childId, type) => {
        const record = statusByChildAndType.get(`${String(childId).trim()}::${type}`);
        if (!record || record.isDeleted) return null;
        if (record.present === false || record.attended === false) return 'absent';
        return record.status || 'present';
    };

    const children = useMemo(() => {
        if (!canonicalChildren) return [];
        if (!searchQuery.trim()) return canonicalChildren;
        const q = searchQuery.toLowerCase();
        return canonicalChildren.filter(c => c.name?.toLowerCase().includes(q));
    }, [canonicalChildren, searchQuery]);

    const filteredChildren = useMemo(() => {
        return children.filter((c) => {
            if (activeFilter === "boys" && c.gender === "بنت") return false;
            if (activeFilter === "girls" && c.gender !== "بنت") return false;
            return true;
        });
    }, [children, activeFilter]);

    const filteredChildIdSet = useMemo(
        () => new Set(filteredChildren.map(c => String(c.id).trim())),
        [filteredChildren]
    );

    // Strictly validated present counts for the displayed children
    const liturgyCount = useMemo(() => {
        return validatedAttendance.whoAttendedLiturgyList.filter(c =>
            filteredChildIdSet.has(String(c.id).trim())
        ).length;
    }, [validatedAttendance.whoAttendedLiturgyList, filteredChildIdSet]);

    const serviceCount = useMemo(() => {
        return validatedAttendance.whoAttendedServiceList.filter(c =>
            filteredChildIdSet.has(String(c.id).trim())
        ).length;
    }, [validatedAttendance.whoAttendedServiceList, filteredChildIdSet]);

    const getReportData = () => {
        let list = [];
        if (modalState.type === 'absent') {
            list = (children || []).filter(c => !validatedAttendance.servicePresentIds.has(String(c.id).trim()));
        } else if (modalState.type === 'excused') {
            list = (children || []).filter(c => getAttendanceStatus(c.id, 'service') === 'excused');
        } else if (modalState.type === 'service') {
            list = (children || []).filter(c => validatedAttendance.servicePresentIds.has(String(c.id).trim()));
        } else if (modalState.type === 'liturgy') {
            list = (children || []).filter(c => validatedAttendance.liturgyPresentIds.has(String(c.id).trim()));
        }

        return {
            boys: list.filter(c => c.gender !== 'بنت'),
            girls: list.filter(c => c.gender === 'بنت')
        };
    };

    const { boys: reportBoys, girls: reportGirls } = modalState.isOpen ? getReportData() : { boys: [], girls: [] };

    const setAttendanceStatus = async (child, type, status) => {
        try {
            const nowIso = new Date().toISOString();
            const nowMs = Date.now();
            const currentKey = String(localStorage.getItem('currentSyncKey') || '').trim();
            const targetSyncKey = String(
                child.syncKey ||
                (activeSyncKey !== 'MASTER_ACCESS' && activeSyncKey !== 'ADMIN_MODE' && activeSyncKey !== 'STAGE_ADMIN' ? activeSyncKey : '') ||
                currentKey
            ).trim();

            const childIdStr = String(child.id).trim();

            // Fetch all records for selectedDate to deduplicate and update cleanly
            const recordsForDate = await db.attendance.where('date').equals(selectedDate).toArray();
            const childRecordsForDate = recordsForDate.filter(a => resolveAttendanceChild(a, canonicalData)?.id === child.id);
            const sameTypeRecords = childRecordsForDate.filter(a => a.type === type);

            // Clean up any duplicate rows in db.attendance for the same (date, childId, type)
            const activeSameType = sameTypeRecords.filter(r => !r.isDeleted);
            const primaryRecord = activeSameType[0] || sameTypeRecords[0] || null;
            const duplicateIds = sameTypeRecords
                .filter(r => primaryRecord && r.id !== primaryRecord.id && r.id != null)
                .map(r => r.id);

            if (duplicateIds.length > 0) {
                await db.attendance.bulkDelete(duplicateIds);
            }

            const otherActiveRecords = childRecordsForDate.filter(r => r.type !== type && !r.isDeleted && r.status === 'present');
            const updates = { isDirty: true, updatedAt: nowIso };

            if (primaryRecord && !primaryRecord.isDeleted) {
                if (primaryRecord.status === status) {
                    // Clicking the same active status toggles it off (soft-delete for cloud sync)
                    await db.attendance.update(primaryRecord.id, {
                        ...attendanceIdentity(child),
                        isDeleted: true,
                        isDirty: true,
                        syncKey: targetSyncKey,
                        updatedAt: nowIso,
                        updatedAtMs: nowMs
                    });
                    if (status === 'present') {
                        const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                        if (child[field] === selectedDate) updates[field] = null;
                        if (otherActiveRecords.length === 0) {
                            updates.streak = Math.max((child.streak || 0) - 1, 0);
                        }
                    }
                } else {
                    // Update existing record to the new status
                    await db.attendance.update(primaryRecord.id, {
                        status,
                        ...attendanceIdentity(child),
                        syncKey: targetSyncKey,
                        isDeleted: false,
                        isDirty: true,
                        updatedAt: nowIso,
                        updatedAtMs: nowMs
                    });
                    if (status === 'present') {
                        const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                        if (!child[field] || selectedDate >= child[field]) updates[field] = selectedDate;
                    }
                }
            } else if (primaryRecord && primaryRecord.isDeleted) {
                // Revive previously soft-deleted record for the same (date, childId, type) to avoid duplicate rows
                await db.attendance.update(primaryRecord.id, {
                    date: selectedDate,
                    ...attendanceIdentity(child),
                    type,
                    status,
                    syncKey: targetSyncKey,
                    isDeleted: false,
                    isDirty: true,
                    updatedAt: nowIso,
                    updatedAtMs: nowMs
                });
                if (status === 'present') {
                    const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                    if (!child[field] || selectedDate >= child[field]) updates[field] = selectedDate;
                    if (otherActiveRecords.length === 0) updates.streak = (child.streak || 0) + 1;
                }
            } else {
                // Insert a single clean attendance record
                await db.attendance.add({
                    date: selectedDate,
                    ...attendanceIdentity(child),
                    type,
                    status,
                    syncKey: targetSyncKey,
                    isDirty: true,
                    updatedAt: nowIso,
                    updatedAtMs: nowMs,
                    isDeleted: false
                });

                if (status === 'present') {
                    const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                    if (!child[field] || selectedDate >= child[field]) updates[field] = selectedDate;
                    if (otherActiveRecords.length === 0) updates.streak = (child.streak || 0) + 1;
                }
            }

            await db.children.update(child.id, updates);
            triggerAutoSync();

            // 📋 Audit Trail: تسجيل تغيير حالة الحضور
            const statusLabels = { present: 'حاضر', absent: 'غائب', excused: 'بعذر' };
            const typeLabels = { liturgy: 'القداس', service: 'الخدمة' };
            logActivity('RECORD_ATTENDANCE', `تسجيل حضور المخدوم: ${child.name || child.id} — ${statusLabels[status] || status} (${typeLabels[type] || type}) ليوم ${selectedDate}`);
        } catch (err) {
            alert("عطل في قاعدة البيانات: " + err.message);
        }
    };

    const cleanPhoneNumber = (phone) => {
        let clean = String(phone || "").replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '2' + clean;
        else if (!clean.startsWith('20') && clean.length > 0) clean = '20' + clean;
        return clean;
    };

    const getTargetPhone = (child) => {
        if (child.whatsappTarget === 'child' && child.childPhone) return child.childPhone;
        if (child.whatsappTarget === 'father' && child.fatherPhone) return child.fatherPhone;
        if (child.whatsappTarget === 'mother' && child.motherPhone) return child.motherPhone;
        return child.childPhone || child.fatherPhone || child.motherPhone || child.phone;
    };

    const generateMissedServiceMsg = (child) => {
        const title = child.gender === 'بنت' ? 'مخدومتنا' : 'مخدومنا';
        const namePart = child.name ? child.name.split(' ')[0] : 'يا مخدوم';
        let msg = `وحشتنا يا ${title} (${namePart})! 🥺💔\nمجتش ليه يوم ${selectedDate}؟ مكانك كان فاضي، مستنيينك في الكنيسة!`;
        const phone = cleanPhoneNumber(getTargetPhone(child));
        return {
            whatsapp: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
            sms: `sms:${phone}?body=${encodeURIComponent(msg)}`
        };
    };

    const getArabicDateText = (dateString) => {
        try {
            const d = new Date(`${dateString}T12:00:00`);
            const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const dayName = days[d.getDay()];
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dayName}، ${dd}/${mm}/${yyyy}`;
        } catch (e) {
            return dateString;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-32 font-sans" dir="rtl">
            <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm mb-6 rounded-b-4xl">
                <div className="max-w-4xl mx-auto">
                    {/* Date Warning Banner */}
                    <div className="mb-4 bg-amber-100 border-l-4 border-r-4 border-amber-500 text-amber-900 p-3.5 rounded-xl shadow-md font-black text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
                        <span>
                            ⚠️ يتم الآن تسجيل الحضور لتاريخ: {getArabicDateText(selectedDate)}
                        </span>
                        <span className="text-[11px] bg-amber-200/80 text-amber-950 px-2.5 py-1 rounded-lg font-black">
                            {isThursdayClass ? '🗓️ خدمة يوم الخميس' : '🗓️ خدمة يوم الجمعة'}
                        </span>
                    </div>

                    {/* Date Picker UI Wrapper */}
                    <div className="flex flex-wrap items-center gap-2 mb-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                        <Calendar className="text-blue-500 w-5 h-5 mr-2 shrink-0" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={handleDateChange}
                            className="flex-1 min-w-[140px] bg-slate-50 text-slate-700 font-bold py-2 px-3 rounded-xl outline-none border border-slate-200 focus:border-blue-400 focus:bg-white transition-all text-sm"
                        />
                        {selectedDate !== targetDate && (
                            <button
                                onClick={handleResetToCurrentWeek}
                                className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-emerald-100 transition-all shrink-0 border border-emerald-200"
                            >
                                أسبوع الخدمة الحالي
                            </button>
                        )}
                        <button
                            onClick={handlePreviousWeek}
                            className="bg-blue-50 text-blue-600 px-3.5 py-2 rounded-xl text-xs font-black hover:bg-blue-100 transition-all shrink-0 border border-blue-100"
                        >
                            الأسبوع الماضي
                        </button>
                    </div>

                    <p className="mb-3 text-center font-bold" role="status">الحضور: {validatedAttendance.presentCount} من {canonicalChildren.length} — الغياب: {canonicalChildren.length - validatedAttendance.presentCount}</p>
                    <div className="relative mb-4">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="ابحث عن مخدوم..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pr-10 pl-4 py-2.5 rounded-full bg-slate-100 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                    </div>
                    <div className="flex gap-2 justify-center">
                        {[{ id: "all", label: `الكل 🌟 (${children.length})` }, { id: "boys", label: "ولاد 👦" }, { id: "girls", label: "بنات 👧" }].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setActiveFilter(f.id)}
                                aria-label={`تصفية حسب ${f.label}`}
                                className={`flex-1 px-4 py-2 rounded-full text-xs font-black transition-all ${activeFilter === f.id ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600"}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="px-4 max-w-4xl mx-auto">
                <div className="bg-white border border-slate-200 p-4 rounded-3xl mb-6 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center px-1">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                            <History size={16} className="text-indigo-500" /> تقارير يوم ({selectedDate})
                        </h3>
                        <span className="text-xs font-black text-slate-500">
                            إجمالي المخدومين النشطين: {filteredChildren.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                        <button onClick={() => setModalState({ isOpen: true, type: 'absent' })} className="bg-red-700 text-red-50 border border-red-800 py-2.5 rounded-xl text-[11px] font-black hover:bg-red-800 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <UserMinus size={16} /> المتبقين / غياب ({Math.max(0, filteredChildren.length - serviceCount)})
                        </button>
                        <button onClick={() => setModalState({ isOpen: true, type: 'service' })} className="bg-green-700 text-green-50 border border-green-800 py-2.5 rounded-xl text-[11px] font-black hover:bg-green-800 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <UserCheck size={16} /> حضور الخدمة ({serviceCount})
                        </button>
                        <button onClick={() => setModalState({ isOpen: true, type: 'liturgy' })} className="bg-yellow-600 text-yellow-50 border border-yellow-700 py-2.5 rounded-xl text-[11px] font-black hover:bg-yellow-700 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <Church size={16} /> حضور القداس ({liturgyCount})
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 mb-6">
                    <div className="flex-1 bg-blue-50 p-3 rounded-2xl border border-blue-100 flex justify-between items-center">
                        <span className="text-blue-700 font-black text-sm flex gap-1"><Church size={18} /> قداس</span>
                        <span className="bg-blue-500 text-white px-2.5 py-0.5 rounded-md text-xs font-black">{liturgyCount} / {filteredChildren.length}</span>
                    </div>
                    <div className="flex-1 bg-green-50 p-3 rounded-2xl border border-green-100 flex justify-between items-center">
                        <span className="text-green-700 font-black text-sm flex gap-1"><BookOpen size={18} /> خدمة</span>
                        <span className="bg-green-500 text-white px-2.5 py-0.5 rounded-md text-xs font-black">{serviceCount} / {filteredChildren.length}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredChildren.map(child => (
                        <div key={child.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col gap-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl overflow-hidden ring-2 ring-slate-50">
                                    {child.profilePic ? (
                                        <img
                                            src={child.profilePic}
                                            alt={child.name}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            className="object-cover w-full h-full"
                                        />
                                    ) : (child.gender === 'بنت' ? '👧' : '👦')}
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-sm">{child.name || 'بدون اسم'}</h3>
                                    <p className={`text-[10px] px-2 py-0.5 rounded mt-1 w-fit font-bold ${child.streak > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>الاستريك: {child.streak || 0}</p>
                                </div>
                            </div>
                            <div className="flex gap-2 mb-2">
                                <button onClick={() => setAttendanceStatus(child, 'liturgy', 'present')} className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-colors ${getAttendanceStatus(child.id, 'liturgy') === 'present' ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}><Church size={14} /> القداس</button>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setAttendanceStatus(child, 'service', 'present')} className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-colors ${getAttendanceStatus(child.id, 'service') === 'present' ? 'bg-green-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>✅ حضور</button>
                                <button onClick={() => setAttendanceStatus(child, 'service', 'absent')} className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-colors ${getAttendanceStatus(child.id, 'service') === 'absent' ? 'bg-red-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>❌ غياب</button>
                                <button onClick={() => setAttendanceStatus(child, 'service', 'excused')} className={`flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-colors ${getAttendanceStatus(child.id, 'service') === 'excused' ? 'bg-yellow-500 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>🟡 اعتذار</button>
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={() => setModalState({ isOpen: true, type: 'absent' })} className="w-full mt-8 py-4 rounded-full bg-slate-800 text-white font-black flex items-center justify-center gap-2 shadow-lg hover:bg-slate-900 active:scale-95 transition-all"><CheckCheck size={20} /> مراجعة تقرير اليوم المخفي (تقفيل)</button>
            </main>

            {modalState.isOpen && (
                <div className="fixed inset-0 z-100 flex items-end md:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-md rounded-4xl p-6 shadow-2xl animate-in slide-in-from-bottom-8">

                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <h2 className={`text-lg font-black flex items-center gap-2 
                                ${modalState.type === 'absent' ? 'text-red-600' : modalState.type === 'service' ? 'text-green-600' : 'text-yellow-600'}`}>
                                {modalState.type === 'absent' && <><UserMinus size={20} /> تقرير غياب ({reportBoys.length + reportGirls.length})</>}
                                {modalState.type === 'service' && <><BookOpen size={20} /> تقرير حضور الخدمة ({reportBoys.length + reportGirls.length})</>}
                                {modalState.type === 'liturgy' && <><Church size={20} /> تقرير حضور القداس ({reportBoys.length + reportGirls.length})</>}
                            </h2>
                            <button onClick={() => setModalState({ isOpen: false, type: null })} aria-label="إغلاق" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X size={16} /></button>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto pr-1">
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
                                                    <div className="flex gap-1">
                                                        <a href={generateMissedServiceMsg(child).whatsapp} aria-label={`واتساب لـ ${child.name}`} target="_blank" rel="noreferrer" className="bg-green-700 text-green-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-800">
                                                            <MessageCircleWarning size={12} /> واتساب
                                                        </a>
                                                        <a href={generateMissedServiceMsg(child).sms} aria-label={`رسالة لـ ${child.name}`} className="bg-blue-600 text-blue-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">
                                                            رسالة
                                                        </a>
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
                                                    <div className="flex gap-1">
                                                        <a href={generateMissedServiceMsg(child).whatsapp} aria-label={`واتساب لـ ${child.name}`} target="_blank" rel="noreferrer" className="bg-green-700 text-green-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-800">
                                                            <MessageCircleWarning size={12} /> واتساب
                                                        </a>
                                                        <a href={generateMissedServiceMsg(child).sms} aria-label={`رسالة لـ ${child.name}`} className="bg-blue-600 text-blue-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">
                                                            رسالة
                                                        </a>
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
                        </div>
                    </div>
                </div>
            )}
            <BottomNav />
        </div>
    );
}
