import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import * as XLSX from 'xlsx';
import { 
    Calendar, Download, Printer, Search, Users, CheckCircle2, 
    XCircle, TrendingUp, Sparkles, Filter, ChevronDown, ArrowRight,
    MapPin, Phone
} from 'lucide-react';
import { VISITATION_TYPES, getVisitationInfo, formatLastVisitedDate } from '../utils/visitationTypes';
import { getLocalDateString } from '../utils/serviceWeek';

const MONTHS_AR = [
    { value: 1, label: 'يناير (1)' },
    { value: 2, label: 'فبراير (2)' },
    { value: 3, label: 'مارس (3)' },
    { value: 4, label: 'أبريل (4)' },
    { value: 5, label: 'مايو (5)' },
    { value: 6, label: 'يونيو (6)' },
    { value: 7, label: 'يوليو (7)' },
    { value: 8, label: 'أغسطس (8)' },
    { value: 9, label: 'سبتمبر (9)' },
    { value: 10, label: 'أكتوبر (10)' },
    { value: 11, label: 'نوفمبر (11)' },
    { value: 12, label: 'ديسمبر (12)' }
];

export default function ChildrenAttendanceReport({ childrenData = [], appSettings = {}, onBack = null }) {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // 🗓️ Period Filter State (Requirement #3)
    const [periodMode, setPeriodMode] = useState('monthly'); // 'monthly' | 'yearly' | 'custom'
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return getLocalDateString(d);
    });
    const [toDate, setToDate] = useState(todayStr);

    // 🔍 Search and Class Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOsraFilter, setSelectedOsraFilter] = useState('all');

    // 🌟 Calculate Elapsed Fridays in the selected period (occurred up to today)
    const elapsedFridays = useMemo(() => {
        let startDate, endDate;

        if (periodMode === 'monthly') {
            const mPad = String(selectedMonth).padStart(2, '0');
            startDate = new Date(`${selectedYear}-${mPad}-01`);
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            endDate = new Date(`${selectedYear}-${mPad}-${String(lastDay).padStart(2, '0')}`);
        } else if (periodMode === 'yearly') {
            startDate = new Date(`${selectedYear}-01-01`);
            endDate = new Date(`${selectedYear}-12-31`);
        } else {
            startDate = fromDate ? new Date(fromDate) : new Date(todayStr);
            endDate = toDate ? new Date(toDate) : new Date(todayStr);
        }

        const fridays = [];
        const cur = new Date(startDate);
        const end = new Date(endDate);
        cur.setHours(12, 0, 0, 0);
        end.setHours(12, 0, 0, 0);

        while (cur <= end) {
            if (cur.getDay() === 5) { // Friday
                const yyyy = cur.getFullYear();
                const mm = String(cur.getMonth() + 1).padStart(2, '0');
                const dd = String(cur.getDate()).padStart(2, '0');
                const dateString = `${yyyy}-${mm}-${dd}`;
                if (dateString <= todayStr) {
                    fridays.push(dateString);
                }
            }
            cur.setDate(cur.getDate() + 1);
        }
        return fridays.sort();
    }, [periodMode, selectedYear, selectedMonth, fromDate, toDate, todayStr]);

    // 🌟 Fetch scoped attendance from Dexie
    const attendanceRecords = useLiveQuery(async () => {
        let startBound, endBound;
        if (periodMode === 'monthly') {
            const mPad = String(selectedMonth).padStart(2, '0');
            startBound = `${selectedYear}-${mPad}-01`;
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            endBound = `${selectedYear}-${mPad}-${String(lastDay).padStart(2, '0')}`;
        } else if (periodMode === 'yearly') {
            startBound = `${selectedYear}-01-01`;
            endBound = `${selectedYear}-12-31`;
        } else {
            startBound = fromDate || '2000-01-01';
            endBound = toDate || todayStr;
        }

        const records = await db.attendance
            .where('date')
            .between(startBound, endBound, true, true)
            .toArray();

        return records.filter(r => !r.isDeleted);
    }, [periodMode, selectedYear, selectedMonth, fromDate, toDate, todayStr]) || [];

    // Helper to resolve Osra Name
    const getOsraName = (child) => {
        if (child.osraName) return child.osraName;
        if (child.assignedOsra) return child.assignedOsra;
        const services = appSettings.services || [];
        for (const s of services) {
            const found = (s.osras || []).find(o => o.syncKey === child.syncKey);
            if (found) return found.name;
        }
        return child.syncKey || 'غير محدد';
    };

    // Filter available Osras
    const availableOsras = useMemo(() => {
        const set = new Set();
        childrenData.forEach(c => {
            const name = getOsraName(c);
            if (name) set.add(name);
        });
        return Array.from(set).sort();
    }, [childrenData, appSettings]);

    // 🌟 Compute Per-Child Attendance & Absence Metrics
    const computedReport = useMemo(() => {
        const fridaysSet = new Set(elapsedFridays);
        const totalFridays = elapsedFridays.length;

        // Group attendance by childId
        const attByChild = {};
        attendanceRecords.forEach(r => {
            const cid = String(r.childId);
            if (!attByChild[cid]) attByChild[cid] = [];
            attByChild[cid].push(r);
        });

        const activeKids = childrenData.filter(c => !c.isDeleted);

        return activeKids.map((c, index) => {
            const cid = String(c.id);
            const records = attByChild[cid] || [];

            // Fridays attended for service
            const attendedFridays = new Set();
            let totalLiturgy = 0;
            let totalTasbeha = 0;

            records.forEach(r => {
                if (r.status === 'present') {
                    if (r.type === 'service' && fridaysSet.has(r.date)) {
                        attendedFridays.add(r.date);
                    }
                    if (r.type === 'liturgy') totalLiturgy++;
                    if (r.type === 'tasbeha') totalTasbeha++;
                }
            });

            const presentCount = attendedFridays.size;
            const absentCount = Math.max(0, totalFridays - presentCount);
            const attendancePercentage = totalFridays > 0
                ? Math.round((presentCount / totalFridays) * 100)
                : 0;

            const lastVisitDate = formatLastVisitedDate(c.last_visited);
            const lastVisitTypeInfo = c.lastVisitationType ? getVisitationInfo(c.lastVisitationType) : null;
            const lastVisitLabel = c.lastVisitationLabel || (lastVisitTypeInfo ? lastVisitTypeInfo.shortLabel : (lastVisitDate ? 'افتـقـاد' : 'لم يُفتقد'));

            return {
                index: index + 1,
                id: c.id,
                name: c.name || 'بدون اسم',
                gender: c.gender,
                isOrdained: c.isOrdained,
                ordinationRank: c.ordinationRank,
                osraName: getOsraName(c),
                phone: c.childPhone || c.fatherPhone || c.motherPhone || c.phone || '',
                presentCount,
                absentCount,
                totalLiturgy,
                totalTasbeha,
                totalFridays,
                attendancePercentage,
                lastVisitDate,
                lastVisitType: c.lastVisitationType || null,
                lastVisitLabel,
                lastVisitBadgeClass: lastVisitTypeInfo ? lastVisitTypeInfo.badgeClass : 'bg-slate-100 text-slate-600 border-slate-200'
            };
        });
    }, [childrenData, attendanceRecords, elapsedFridays]);

    // Apply User Filters
    const filteredReport = useMemo(() => {
        return computedReport.filter(item => {
            if (selectedOsraFilter !== 'all' && item.osraName !== selectedOsraFilter) {
                return false;
            }
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchName = item.name.toLowerCase().includes(term);
                const matchPhone = item.phone.includes(term);
                if (!matchName && !matchPhone) return false;
            }
            return true;
        });
    }, [computedReport, selectedOsraFilter, searchTerm]);

    // 🌟 Summary Statistics
    const statsSummary = useMemo(() => {
        const totalKids = filteredReport.length;
        if (totalKids === 0) return { totalKids: 0, avgRate: 0, totalPresents: 0, totalAbsents: 0 };

        const totalPresents = filteredReport.reduce((sum, item) => sum + item.presentCount, 0);
        const totalAbsents = filteredReport.reduce((sum, item) => sum + item.absentCount, 0);
        const avgRate = Math.round(
            filteredReport.reduce((sum, item) => sum + item.attendancePercentage, 0) / totalKids
        );

        return { totalKids, avgRate, totalPresents, totalAbsents };
    }, [filteredReport]);

    // 📥 Excel Export Handler (Requirement #3)
    const handleExportExcel = () => {
        if (filteredReport.length === 0) {
            alert('لا توجد بيانات متاحة للتصدير! 🤷‍♂️');
            return;
        }

        const periodLabel = periodMode === 'monthly'
            ? `شهر_${selectedMonth}_${selectedYear}`
            : (periodMode === 'yearly' ? `سنة_${selectedYear}` : `فترة_${fromDate}_إلى_${toDate}`);

        const exportData = filteredReport.map(item => ({
            "م": item.index,
            "كود المخدوم": item.id,
            "اسم المخدوم": item.name,
            "الفصل / الأسرة": item.osraName,
            "إجمالي جُمع الفترة": item.totalFridays,
            "عدد أيام الحضور (الخدمة)": item.presentCount,
            "عدد أيام الغياب (الخدمة)": item.absentCount,
            "نسبة الحضور %": `${item.attendancePercentage}%`,
            "حضور القداسات": item.totalLiturgy,
            "تاريخ آخر افتقاد": item.lastVisitDate || 'لم يُفتقد',
            "نوع آخر افتقاد": item.lastVisitLabel || 'غير مسجل',
            "رقم التليفون": item.phone || 'لا يوجد'
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        worksheet['!cols'] = [
            { wch: 5 }, { wch: 14 }, { wch: 25 }, { wch: 20 },
            { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
            { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 16 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'حضور_وغياب_المخدومين');
        XLSX.writeFile(workbook, `تقرير_حضور_وغياب_المخدومين_${periodLabel}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
            {/* 🌟 Header & Period Switcher */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-indigo-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2">
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                                    title="رجوع"
                                >
                                    <ArrowRight size={18} />
                                </button>
                            )}
                            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                📊 تقرير حضور وغياب المخدومين
                            </h2>
                        </div>
                        <p className="text-xs font-bold text-slate-500 mt-1">
                            حساب دقيق لنسب الحضور والغياب لجميع جُمع الفترة المنقضية ومتابعة الافتقاد
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-black text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <Download size={15} /> تصدير Excel
                        </button>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-black text-xs shadow-md shadow-slate-800/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <Printer size={15} /> طباعة
                        </button>
                    </div>
                </div>

                {/* 🌟 أزرار اختيار وضع الفترة (شهري / سنوي / فترة مخصصة) */}
                <div className="bg-slate-100/80 p-1.5 rounded-2xl flex flex-wrap gap-1.5 mb-5">
                    <button
                        type="button"
                        onClick={() => setPeriodMode('monthly')}
                        className={`flex-1 min-w-[100px] py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            periodMode === 'monthly'
                                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        📅 تقرير شهري
                    </button>
                    <button
                        type="button"
                        onClick={() => setPeriodMode('yearly')}
                        className={`flex-1 min-w-[100px] py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            periodMode === 'yearly'
                                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        📆 تقرير سنوي
                    </button>
                    <button
                        type="button"
                        onClick={() => setPeriodMode('custom')}
                        className={`flex-1 min-w-[100px] py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            periodMode === 'custom'
                                ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        ⏱️ فترة مخصصة
                    </button>
                </div>

                {/* Filters Input Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    {periodMode === 'monthly' && (
                        <>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 mb-1">الشهر:</label>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {MONTHS_AR.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 mb-1">السنة:</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {periodMode === 'yearly' && (
                        <div className="sm:col-span-2">
                            <label className="block text-[11px] font-black text-slate-500 mb-1">اختر السنة الكاملة:</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => (
                                    <option key={y} value={y}>سنة {y}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {periodMode === 'custom' && (
                        <>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 mb-1">من تاريخ:</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 mb-1">إلى تاريخ:</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-[11px] font-black text-slate-500 mb-1">فلتر الفصل / الأسرة:</label>
                        <select
                            value={selectedOsraFilter}
                            onChange={(e) => setSelectedOsraFilter(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">كل الفصول ({childrenData.length})</option>
                            {availableOsras.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-black text-slate-500 mb-1">بحث بالاسم أو الهاتف:</label>
                        <div className="relative">
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="ابحث..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 pl-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 🌟 Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl shadow-xs border border-indigo-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Users size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400">إجمالي المخدومين</div>
                        <div className="text-lg font-black text-slate-800">{statsSummary.totalKids}</div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-xs border border-purple-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400">جُمع الفترة المنقضية</div>
                        <div className="text-lg font-black text-purple-700">{elapsedFridays.length} جمعة</div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-xs border border-emerald-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400">إجمالي الحضور</div>
                        <div className="text-lg font-black text-emerald-600">{statsSummary.totalPresents}</div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-xs border border-amber-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] font-black text-slate-400">متوسط المواظبة</div>
                        <div className="text-lg font-black text-amber-600">{statsSummary.avgRate}%</div>
                    </div>
                </div>
            </div>

            {/* 🌟 Report Data Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700">
                        كشف الحضور والغياب والافتقاد ({filteredReport.length} مخدوم)
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                        {elapsedFridays.length > 0 ? `الجُمع المحسوبة: ${elapsedFridays.join(' ، ')}` : 'لم تنقضِ أي جُمع بعد في هذه الفترة'}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-black">
                                <th className="p-3 w-10 text-center">#</th>
                                <th className="p-3">اسم المخدوم</th>
                                <th className="p-3">الفصل / الأسرة</th>
                                <th className="p-3 text-center">حضور الخدمة 🟢</th>
                                <th className="p-3 text-center">حضور القداس ⛪</th>
                                <th className="p-3 text-center">غياب الخدمة 🔴</th>
                                <th className="p-3 text-center">نسبة الحضور %</th>
                                <th className="p-3">آخر افتقاد ونوعه (Requirement #6)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold">
                            {filteredReport.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-400 font-black">
                                        لا توجد بيانات مطابقة للبحث أو الفلتر المحدد.
                                    </td>
                                </tr>
                            ) : (
                                filteredReport.map((child) => (
                                    <tr key={child.id} className="hover:bg-indigo-50/40 transition-colors">
                                        <td className="p-3 text-center text-slate-400 text-[11px]">{child.index}</td>
                                        <td className="p-3">
                                            <div className="font-black text-slate-800 flex items-center gap-1.5">
                                                {(!child.gender || child.gender !== 'بنت') && child.isOrdained && (
                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                        {child.ordinationRank || 'شماس'}
                                                    </span>
                                                )}
                                                {child.name}
                                            </div>
                                            {child.phone && (
                                                <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5" dir="ltr">
                                                    <Phone size={10} /> {child.phone}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-slate-600 text-xs">
                                            {child.osraName}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="inline-block px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                                                {child.presentCount} / {child.totalFridays}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-black">
                                                {child.totalLiturgy}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black border ${
                                                child.absentCount > 0 
                                                    ? 'bg-red-50 text-red-600 border-red-200' 
                                                    : 'bg-slate-50 text-slate-400 border-slate-200'
                                            }`}>
                                                {child.absentCount}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className={`text-xs font-black ${
                                                    child.attendancePercentage >= 75 ? 'text-emerald-600' :
                                                    child.attendancePercentage >= 50 ? 'text-amber-600' : 'text-red-500'
                                                }`}>
                                                    {child.attendancePercentage}%
                                                </span>
                                                <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full ${
                                                            child.attendancePercentage >= 75 ? 'bg-emerald-500' :
                                                            child.attendancePercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                                        }`}
                                                        style={{ width: `${child.attendancePercentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            {child.lastVisitDate ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[11px] font-black text-slate-700">
                                                        📅 {child.lastVisitDate}
                                                    </span>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border w-fit ${child.lastVisitBadgeClass}`}>
                                                        {child.lastVisitLabel}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-slate-400 font-bold">
                                                    لم يُفتقد
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
