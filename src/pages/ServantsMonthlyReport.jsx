import React, { useState, useEffect, useMemo } from 'react';
import { 
    Printer, 
    ArrowRight, 
    Calendar, 
    Filter, 
    Loader2, 
    Users, 
    Download, 
    CheckCircle2, 
    UserMinus, 
    UserX, 
    TrendingUp,
    FileSpreadsheet,
    CalendarRange,
    RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import * as XLSX from 'xlsx';

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const cleanName = (n) => String(n || '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

// 🌟 Requirement #7: Helper to strictly exclude Priests (الآباء الكهنة) from servants attendance roster
const isPriestRecord = (s) => {
    if (!s) return false;
    if (s.role === 'priest' || s.isPriest === true || s.role === 'كاهن' || s.role === 'الاب الكاهن') return true;
    const name = String(s.name || '').trim();
    return name.startsWith('أبونا') || name.startsWith('ابونا') || name.startsWith('القمص') || name.startsWith('القس');
};

export default function ServantsMonthlyReport() {
    const navigate = useNavigate();
    
    const getCurrentMonthYear = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const getTodayDate = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const getFirstDayOfMonth = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    };

    // Filter states
    const [periodMode, setPeriodMode] = useState('monthly'); // 'monthly' | 'custom' | 'yearly'
    const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
    const [fromDate, setFromDate] = useState(getFirstDayOfMonth());
    const [toDate, setToDate] = useState(getTodayDate());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [osraFilter, setOsraFilter] = useState("الكل");

    const getOsraName = (key) => {
        if (!key || key === 'الكل') return key || "غير محدد";
        try {
            const settings = JSON.parse(localStorage.getItem('appSettings')) || {};
            const services = settings.services || [];
            let foundName = key;
            services.forEach(service => {
                const foundOsra = (service.osras || []).find(o => String(o.syncKey).trim() === String(key).trim());
                if (foundOsra) foundName = foundOsra.name;
            });
            return foundName;
        } catch(e) {
            return key;
        }
    };
    
    const [reportData, setReportData] = useState([]);
    const [uniqueMeetingDates, setUniqueMeetingDates] = useState([]);
    const [uniqueOsras, setUniqueOsras] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);

    // Human readable active period description
    const activePeriodLabel = useMemo(() => {
        if (periodMode === 'monthly') {
            const [y, m] = monthYear.split('-');
            const monthsAr = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
            const mName = monthsAr[parseInt(m, 10) - 1] || m;
            return `شهر ${mName} ${y}`;
        }
        if (periodMode === 'custom') {
            return `الفترة من ${fromDate} إلى ${toDate}`;
        }
        return `عام ${selectedYear}`;
    }, [periodMode, monthYear, fromDate, toDate, selectedYear]);

    useEffect(() => {
        const fetchReport = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch base servants from church roster
                let baseServants = [];
                const configSnap = await getDoc(doc(firestore, 'System', 'mainConfig'));
                if (configSnap.exists()) {
                    baseServants = configSnap.data().servants || [];
                }
                const servantsSnap = await getDocs(collection(firestore, "servants"));
                servantsSnap.forEach(docSnap => {
                    if (!baseServants.find(s => s.phone === docSnap.data().phone)) {
                        baseServants.push({ ...docSnap.data(), uid: docSnap.id });
                    }
                });

                // 🚨 CRITICAL REQUIREMENT #7: Exclude Priests (الآباء الكهنة)
                baseServants = baseServants.filter(s => !isPriestRecord(s));

                // 🚨 Exclude deleted servants if appSettings exists in localStorage
                try {
                    const appSettingsStr = localStorage.getItem('appSettings');
                    if (appSettingsStr) {
                        const appSettings = JSON.parse(appSettingsStr);
                        const activeServants = appSettings.servants || [];
                        
                        if (activeServants.length > 0) {
                            baseServants = baseServants.filter(s => 
                                activeServants.some(active => 
                                    (active.id && s.id && String(active.id) === String(s.id)) || 
                                    (active.phone && s.phone && cleanPhone(active.phone) === cleanPhone(s.phone)) || 
                                    active.name === s.name
                                )
                            );
                        }
                    }
                } catch (err) {
                    console.error("Error filtering active servants:", err);
                }

                // Extract Osras for dropdown
                const osras = new Set();
                baseServants.forEach(s => {
                    s.osraName = s.osraName || s.assignedOsra || s.syncKey || "غير محدد";
                    if (s.osraName !== "MASTER_ACCESS" && s.osraName !== "ADMIN_MODE") {
                        osras.add(s.osraName);
                    }
                });
                setUniqueOsras(Array.from(osras));

                // Filter servants by Osra
                let filteredServants = baseServants;
                if (osraFilter !== "الكل") {
                    filteredServants = filteredServants.filter(s => (s.osraName === osraFilter || s.assignedOsra === osraFilter));
                }

                // Build aliasMap to resolve self-check-ins and alternative IDs
                const aliasMap = {};
                try {
                    servantsSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        const p = cleanPhone(d.phone);
                        if (p) {
                            aliasMap[docSnap.id] = p;
                            if (d.uid) aliasMap[d.uid] = p;
                        }
                    });
                } catch (e) {
                    console.warn("Error fetching servants aliases:", e);
                }

                // 2. Fetch Attendance according to Flexible Period Filter (Requirement #7)
                let attendanceSnap;
                if (periodMode === 'monthly') {
                    // Query by month or date range within the selected month
                    const startOfMonth = `${monthYear}-01`;
                    const endOfMonth = `${monthYear}-31`;
                    const q = query(
                        collection(firestore, "ServantAttendance"),
                        where("weekDate", ">=", startOfMonth),
                        where("weekDate", "<=", endOfMonth)
                    );
                    attendanceSnap = await getDocs(q);
                } else if (periodMode === 'custom') {
                    const start = fromDate || getFirstDayOfMonth();
                    const end = toDate || getTodayDate();
                    const q = query(
                        collection(firestore, "ServantAttendance"),
                        where("weekDate", ">=", start),
                        where("weekDate", "<=", end)
                    );
                    attendanceSnap = await getDocs(q);
                } else {
                    // Yearly
                    const startYear = `${selectedYear}-01-01`;
                    const endYear = `${selectedYear}-12-31`;
                    const q = query(
                        collection(firestore, "ServantAttendance"),
                        where("weekDate", ">=", startYear),
                        where("weekDate", "<=", endYear)
                    );
                    attendanceSnap = await getDocs(q);
                }
                
                // Group attendance by servant key
                const attendanceByServant = {};
                const meetingDatesSet = new Set();

                attendanceSnap.forEach(d => {
                    const data = d.data();
                    if (!data) return;

                    // Collect meeting dates where attendance was recorded
                    if (data.weekDate) {
                        meetingDatesSet.add(data.weekDate);
                    }

                    const docIdSuffix = d.id.includes('_') ? d.id.split('_').slice(1).join('_') : d.id;
                    const cleanDPhone = cleanPhone(data.phone || data.uid || docIdSuffix);
                    const cleanDName = cleanName(data.name);
                    const aliasPhone = aliasMap[data.uid] || aliasMap[docIdSuffix];

                    const matchedServant = filteredServants.find(s => {
                        if (s.uid && (data.uid === s.uid || docIdSuffix === s.uid)) return true;
                        if (s.id && (String(data.id) === String(s.id) || String(data.uid) === String(s.id))) return true;
                        const sPhone = cleanPhone(s.phone);
                        if (sPhone && (cleanDPhone === sPhone || (aliasPhone && sPhone === aliasPhone))) return true;
                        if (s.name && data.name && cleanName(s.name) === cleanDName) return true;
                        return false;
                    });

                    if (matchedServant) {
                        const sKey = String(matchedServant.id || matchedServant.uid || matchedServant.phone || matchedServant.name);
                        if (!attendanceByServant[sKey]) attendanceByServant[sKey] = [];
                        attendanceByServant[sKey].push(data);
                    }
                });

                const sortedMeetingDates = Array.from(meetingDatesSet).sort();
                setUniqueMeetingDates(sortedMeetingDates);

                // 3. Aggregate data with distinct counters (Requirement #7 & #4)
                const aggregatedData = filteredServants.map((s, idx) => {
                    const sKey = String(s.id || s.uid || s.phone || s.name);
                    const records = attendanceByServant[sKey] || [];
                    records.sort((a, b) => (a.weekDate || '').localeCompare(b.weekDate || ''));

                    // Map attendance per meeting date
                    const datesMap = {};
                    records.forEach(r => {
                        if (r.weekDate) {
                            const val = r.attendance || r.status;
                            datesMap[r.weekDate] = (val === 'present' ? 'حضور' : val === 'excused' ? 'اعتذار' : val === 'absent' ? 'غياب' : val);
                        }
                    });

                    // 🌟 3 Distinct Counters for Servants' Meeting (اجتماع الخدام)
                    const presentCount = records.filter(r => r.attendance === 'حضور' || r.attendance === 'حاضر' || r.attendance === 'present' || r.status === 'present' || r.status === 'حضور').length;
                    const excusedCount = records.filter(r => r.attendance === 'اعتذار' || r.attendance === 'معتذر' || r.attendance === 'excused' || r.status === 'excused' || r.status === 'اعتذار').length;
                    const absentCount = records.filter(r => r.attendance === 'غياب' || r.attendance === 'غائب' || r.attendance === 'absent' || r.status === 'absent' || r.status === 'غياب').length;

                    // Attendance rate calculation
                    const totalTrackedMeetings = sortedMeetingDates.length > 0 ? sortedMeetingDates.length : (presentCount + excusedCount + absentCount);
                    const attendancePercentage = totalTrackedMeetings > 0
                        ? Math.round((presentCount / totalTrackedMeetings) * 100)
                        : 0;

                    // Spiritual & other commitments
                    const liturgyCount = records.filter(r => r.liturgy).length;
                    const prepCount = records.filter(r => r.preparation).length;
                    const serviceMeetingCommitmentCount = records.filter(r => r.meeting).length;
                    const visitationCount = records.filter(r => r.visitation).length;
                    const serviceActivityCount = records.filter(r => r.activitiesService).length;
                    const dioceseActivityCount = records.filter(r => r.activitiesDiocese && r.activitiesDiocese.trim() !== "").length;

                    // Latest values for text fields
                    let confessionDate = s.confessionDate || "";
                    let activitiesDiocese = "";
                    let tasks = "";
                    records.forEach(r => {
                        if (r.confessionDate) confessionDate = r.confessionDate;
                        if (r.activitiesDiocese) activitiesDiocese = r.activitiesDiocese;
                        if (r.tasks) tasks = r.tasks;
                    });

                    // Collect excuse notes & leader notes
                    const notesList = [];
                    records.forEach(r => {
                        if (r.excuseNote) {
                            notesList.push({ date: r.weekDate, label: 'اعتذار', text: r.excuseNote });
                        }
                        if (r.leaderNotes) {
                            notesList.push({ date: r.weekDate, label: 'أمين الخدمة', text: r.leaderNotes });
                        }
                    });

                    // Safe fallback ID (Fix for Bug #9 where sId was undefined)
                    const canonicalId = s.id || s.uid || sKey || `servant-${idx}`;

                    return {
                        id: canonicalId,
                        index: idx + 1,
                        name: s.name,
                        phone: s.phone || '',
                        osraName: s.osraName || s.assignedOsra || 'غير محدد',
                        datesMap,
                        presentCount,
                        excusedCount,
                        absentCount,
                        attendancePercentage,
                        totalTrackedMeetings,
                        liturgyCount,
                        prepCount,
                        serviceMeetingCommitmentCount,
                        visitationCount,
                        visitationText: records.some(r => r.visitation) ? '✅' : '❌',
                        serviceActivityCount,
                        activitiesServiceText: records.some(r => r.activitiesService) ? '✅' : '❌',
                        dioceseActivityCount,
                        activitiesDiocese: activitiesDiocese || (dioceseActivityCount > 0 ? `${dioceseActivityCount} مشاركة` : '-'),
                        confessionDate: confessionDate || '-',
                        tasks: tasks || '-',
                        notesList,
                        allNotesText: notesList.map(n => `[${n.date} ${n.label}]: ${n.text}`).join(' | ')
                    };
                });

                setReportData(aggregatedData);
            } catch (err) {
                console.error("Error fetching report data:", err);
            }
            setIsLoading(false);
        };

        fetchReport();
    }, [monthYear, fromDate, toDate, selectedYear, periodMode, osraFilter]);

    // Print handler
    const handlePrint = () => {
        window.print();
    };

    // Excel export handler
    const handleExportExcel = () => {
        setIsExportingExcel(true);
        try {
            const dataToExport = reportData.map((s, idx) => {
                const row = {
                    'م': s.index || idx + 1,
                    'اسم الخادم': s.name,
                    'الأسرة / الخدمة': getOsraName(s.osraName),
                    'عدد الحضور (اجتماع الخدام)': s.presentCount,
                    'عدد الاعتذار': s.excusedCount,
                    'عدد الغياب': s.absentCount,
                    'نسبة الحضور': `${s.attendancePercentage}%`
                };

                // Add meeting dates columns if in month or custom mode
                if (periodMode !== 'yearly' && uniqueMeetingDates.length > 0) {
                    uniqueMeetingDates.forEach((dStr) => {
                        const status = s.datesMap[dStr];
                        row[`اجتماع ${dStr}`] = status === 'حضور' ? 'حاضر' : status === 'اعتذار' ? 'معتذر' : status === 'غياب' ? 'غائب' : '-';
                    });
                }

                row['القداسات'] = s.liturgyCount;
                row['التحضير الأسبوعي'] = s.prepCount;
                row['مشارك بالافتقاد'] = s.visitationCount;
                row['تاريخ آخر اعتراف'] = s.confessionDate;
                row['مشاركات الأنشطة'] = s.serviceActivityCount + s.dioceseActivityCount;
                row['أنشطة الإيبارشية'] = s.activitiesDiocese;
                row['ملاحظات وأسباب الاعتذار'] = s.allNotesText || '-';

                return row;
            });

            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "تقرير اجتماع الخدام");
            
            // Clean filename
            const cleanPeriodName = activePeriodLabel.replace(/[/\\?%*:|"<>]/g, '_');
            XLSX.writeFile(wb, `تقرير_اجتماع_الخدام_${cleanPeriodName}.xlsx`);
        } catch (err) {
            console.error("Excel export error:", err);
            alert("حدث خطأ أثناء تصدير ملف الإكسيل.");
        } finally {
            setIsExportingExcel(false);
        }
    };

    // Overall summary metrics across all servants
    const overallSummary = useMemo(() => {
        const totalServants = reportData.length;
        const totalPresents = reportData.reduce((acc, s) => acc + s.presentCount, 0);
        const totalExcuses = reportData.reduce((acc, s) => acc + s.excusedCount, 0);
        const totalAbsents = reportData.reduce((acc, s) => acc + s.absentCount, 0);
        const avgPercentage = totalServants > 0 
            ? Math.round(reportData.reduce((acc, s) => acc + s.attendancePercentage, 0) / totalServants)
            : 0;
        return { totalServants, totalPresents, totalExcuses, totalAbsents, avgPercentage };
    }, [reportData]);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20 print:pb-0 print:bg-white" dir="rtl">
            
            <style>
                {`
                @media print {
                    @page { 
                        size: A4 landscape; 
                        margin: 8mm; 
                    }
                    body { 
                        background-color: #fff !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        direction: rtl !important;
                    }
                    .no-print { display: none !important; }
                    
                    header, nav, .sidebar { display: none !important; }

                    .print-area { 
                        width: 100% !important; 
                        max-width: 100% !important;
                        margin: 0 !important; 
                        padding: 0 !important; 
                        box-shadow: none !important;
                        border: none !important;
                    }
                    
                    .overflow-x-auto { 
                        overflow: visible !important; 
                    }

                    table { 
                        border-collapse: collapse !important; 
                        width: 100% !important; 
                        background: #fff !important;
                    }
                    th, td { 
                        border: 1px solid #333 !important; 
                        padding: 4px 6px !important; 
                        text-align: center !important; 
                        font-size: 10px !important; 
                        color: #000 !important; 
                        vertical-align: middle !important;
                        background: #fff !important;
                        word-wrap: break-word !important;
                    }
                    th { 
                        background-color: #f1f5f9 !important; 
                        font-weight: bold !important; 
                    }
                    
                    .print-header { 
                        display: block !important; 
                        margin-bottom: 15px; 
                        text-align: center; 
                        color: #000 !important;
                    }
                    
                    .badge-print-present { background-color: #d1fae5 !important; color: #065f46 !important; font-weight: bold; }
                    .badge-print-excused { background-color: #fef3c7 !important; color: #92400e !important; font-weight: bold; }
                    .badge-print-absent { background-color: #ffe4e6 !important; color: #9f1239 !important; font-weight: bold; }
                }
                `}
            </style>

            {/* Print Header (Only visible on print) */}
            <div className="hidden print:block print-header">
                <h1 className="text-xl font-black mb-1">
                    ⛪ تقرير متابعة اجتماع الخدام - كنيسة الشهيد العظيم مارجرجس
                </h1>
                <h2 className="text-sm font-bold text-slate-700">
                    {activePeriodLabel} | الأسرة: {osraFilter === 'الكل' ? 'جميع الأسر والخدمات' : getOsraName(osraFilter)} (مستبعد منه الآباء الكهنة)
                </h2>
                <div className="flex justify-center gap-6 mt-2 text-xs font-bold">
                    <span>إجمالي الخدام: {overallSummary.totalServants}</span>
                    <span>إجمالي الحضور: {overallSummary.totalPresents}</span>
                    <span>إجمالي الاعتذارات: {overallSummary.totalExcuses}</span>
                    <span>إجمالي الغياب: {overallSummary.totalAbsents}</span>
                    <span>متوسط الحضور: {overallSummary.avgPercentage}%</span>
                </div>
            </div>

            {/* App Navbar (Hidden on print) */}
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem] no-print border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0"
                            title="رجوع"
                        >
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black text-amber-400 flex items-center gap-2">
                                <Users size={20} /> تقرير اجتماع الخدام
                            </h1>
                            <p className="text-xs font-bold text-slate-300">
                                متابعة الحضور والاعتذار والغياب لاجتماع الخدام الأسبوعي
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleExportExcel} 
                            disabled={isExportingExcel || reportData.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                        >
                            <FileSpreadsheet size={16} />
                            <span className="hidden sm:inline">تصدير إكسيل</span>
                        </button>
                        <button 
                            onClick={handlePrint} 
                            disabled={reportData.length === 0}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md hover:shadow-lg cursor-pointer"
                        >
                            <Printer size={16} />
                            <span>طباعة (A4)</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-[98%] mx-auto mt-4 print-area">
                
                {/* Control Bar (Hidden on print) */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 mb-6 flex flex-col lg:flex-row gap-4 items-center justify-between no-print animate-in slide-in-from-top-4">
                    
                    {/* View Switcher Tabs (Requirement #7: Flexible Period Filter) */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl w-full lg:w-auto">
                        <button 
                            onClick={() => setPeriodMode('monthly')}
                            className={`flex-1 lg:flex-none px-5 py-2 rounded-xl font-black text-xs transition-all ${periodMode === 'monthly' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            شهري 📅
                        </button>
                        <button 
                            onClick={() => setPeriodMode('custom')}
                            className={`flex-1 lg:flex-none px-5 py-2 rounded-xl font-black text-xs transition-all ${periodMode === 'custom' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            فترة مخصصة 🗓️
                        </button>
                        <button 
                            onClick={() => setPeriodMode('yearly')}
                            className={`flex-1 lg:flex-none px-5 py-2 rounded-xl font-black text-xs transition-all ${periodMode === 'yearly' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            سنوي 📊
                        </button>
                    </div>

                    {/* Inputs for Dates */}
                    <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                        {periodMode === 'monthly' && (
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                <Calendar className="text-indigo-600" size={16} />
                                <span className="text-xs font-bold text-slate-500">الشهر:</span>
                                <input 
                                    type="month" 
                                    value={monthYear} 
                                    onChange={(e) => setMonthYear(e.target.value)} 
                                    className="bg-transparent border-none outline-none font-bold text-xs text-slate-800 cursor-pointer"
                                />
                            </div>
                        )}

                        {periodMode === 'custom' && (
                            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                <CalendarRange className="text-indigo-600" size={16} />
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-500">من:</span>
                                    <input 
                                        type="date" 
                                        value={fromDate} 
                                        onChange={(e) => setFromDate(e.target.value)} 
                                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-xs text-slate-700 outline-none cursor-pointer"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-500">إلى:</span>
                                    <input 
                                        type="date" 
                                        value={toDate} 
                                        onChange={(e) => setToDate(e.target.value)} 
                                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-xs text-slate-700 outline-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}

                        {periodMode === 'yearly' && (
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                                <Calendar className="text-indigo-600" size={16} />
                                <span className="text-xs font-bold text-slate-500">السنة:</span>
                                <select 
                                    value={selectedYear} 
                                    onChange={(e) => setSelectedYear(e.target.value)} 
                                    className="bg-transparent border-none outline-none font-bold text-xs text-slate-800 cursor-pointer"
                                >
                                    {Array.from({length: 8}, (_, i) => new Date().getFullYear() - i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        
                        {/* Osra Filter */}
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                            <Users className="text-slate-500" size={16} />
                            <select 
                                value={osraFilter} 
                                onChange={(e) => setOsraFilter(e.target.value)} 
                                className="bg-transparent border-none outline-none font-bold text-xs text-slate-700 max-w-[150px] truncate cursor-pointer"
                            >
                                <option value="الكل">كل الأسر والخدمات</option>
                                {uniqueOsras.map(osra => (
                                    <option key={osra} value={osra}>{getOsraName(osra)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* KPI Summary Cards (Hidden on print) */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 mb-6 no-print">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-xs font-bold text-slate-400 block mb-1">الخدام المشمولين</span>
                            <span className="text-2xl font-black text-slate-800">{overallSummary.totalServants}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                            <Users size={18} />
                        </div>
                    </div>

                    <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-xs font-black text-emerald-800 block mb-1">إجمالي الحضور</span>
                            <span className="text-2xl font-black text-emerald-600">{overallSummary.totalPresents}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 size={18} />
                        </div>
                    </div>

                    <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-xs font-black text-amber-800 block mb-1">إجمالي الاعتذارات</span>
                            <span className="text-2xl font-black text-amber-600">{overallSummary.totalExcuses}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                            <UserMinus size={18} />
                        </div>
                    </div>

                    <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-between">
                        <div>
                            <span className="text-xs font-black text-rose-800 block mb-1">إجمالي الغياب</span>
                            <span className="text-2xl font-black text-rose-600">{overallSummary.totalAbsents}</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                            <UserX size={18} />
                        </div>
                    </div>

                    <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-200 shadow-sm flex items-center justify-between col-span-2 sm:col-span-1">
                        <div>
                            <span className="text-xs font-black text-indigo-800 block mb-1">متوسط نسبة الحضور</span>
                            <span className="text-2xl font-black text-indigo-600">{overallSummary.avgPercentage}%</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <TrendingUp size={18} />
                        </div>
                    </div>
                </div>

                {/* The Main Report Table */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-x-auto print-area animate-in zoom-in-95">
                    <table className="w-full text-center text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-800 font-black border-b-2 border-slate-300">
                            <tr>
                                <th className="p-3 border border-slate-200 w-10" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>م</th>
                                <th className="p-3 border border-slate-200 min-w-[140px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>اسم الخادم</th>
                                <th className="p-3 border border-slate-200 min-w-[110px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>الأسرة / الخدمة</th>
                                
                                {/* 🌟 Requirement #7: Clear Summary Counters */}
                                <th className="p-2 border border-slate-200 bg-emerald-100/70 text-emerald-900 min-w-[75px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>
                                    عدد الحضور ✅
                                </th>
                                <th className="p-2 border border-slate-200 bg-amber-100/70 text-amber-900 min-w-[75px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>
                                    عدد الاعتذار 🟡
                                </th>
                                <th className="p-2 border border-slate-200 bg-rose-100/70 text-rose-900 min-w-[75px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>
                                    عدد الغياب ❌
                                </th>
                                <th className="p-2 border border-slate-200 bg-indigo-100/70 text-indigo-900 min-w-[70px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>
                                    نسبة الحضور %
                                </th>

                                {/* Meeting Dates Detail columns */}
                                {periodMode !== 'yearly' && uniqueMeetingDates.length > 0 && (
                                    <th className="p-2 border border-slate-200 bg-blue-50 text-blue-900" colSpan={uniqueMeetingDates.length}>
                                        سجل حضور مواعيد اجتماع الخدام ({uniqueMeetingDates.length} اجتماع)
                                    </th>
                                )}

                                <th className="p-3 border border-slate-200 min-w-[65px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>قداس</th>
                                <th className="p-3 border border-slate-200 min-w-[65px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>تحضير</th>
                                <th className="p-3 border border-slate-200 min-w-[70px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>افتقاد</th>
                                <th className="p-3 border border-slate-200 min-w-[95px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>تاريخ الاعتراف</th>
                                <th className="p-3 border border-slate-200 min-w-[75px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>أنشطة الخدمة</th>
                                <th className="p-3 border border-slate-200 min-w-[100px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>أنشطة الإيبارشية</th>
                                <th className="p-3 border border-slate-200 min-w-[180px]" rowSpan={periodMode !== 'yearly' && uniqueMeetingDates.length > 0 ? 2 : 1}>ملاحظات أمين الخدمة وأسباب الاعتذار</th>
                            </tr>

                            {/* Second row of headers for meeting dates */}
                            {periodMode !== 'yearly' && uniqueMeetingDates.length > 0 && (
                                <tr className="bg-slate-50 text-[10px] text-slate-700">
                                    {uniqueMeetingDates.map((dateStr, idx) => (
                                        <th key={dateStr} className="p-1 border border-slate-200 min-w-[42px] bg-blue-50/50" title={dateStr}>
                                            {dateStr.substring(5)} {/* MM-DD */}
                                        </th>
                                    ))}
                                </tr>
                            )}
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={13 + (periodMode !== 'yearly' ? uniqueMeetingDates.length : 0)} className="text-center p-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-2" />
                                        <span className="text-xs font-bold text-slate-500">جاري تجميع تقرير اجتماع الخدام...</span>
                                    </td>
                                </tr>
                            ) : reportData.length === 0 ? (
                                <tr>
                                    <td colSpan={13 + (periodMode !== 'yearly' ? uniqueMeetingDates.length : 0)} className="text-center p-12 text-slate-500 font-bold">
                                        لا توجد بيانات للاجتماع مسجلة في هذه الفترة المحددة.
                                    </td>
                                </tr>
                            ) : (
                                reportData.map((s, index) => (
                                    <tr key={s.id || index} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="p-2 border border-slate-200 font-bold text-slate-500">{s.index || index + 1}</td>
                                        <td className="p-2 border border-slate-200 font-black text-slate-800 text-right">
                                            {s.name}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-bold text-indigo-700 bg-indigo-50/30 text-[11px]">
                                            {getOsraName(s.osraName)}
                                        </td>

                                        {/* 🌟 Requirement #7: The 3 Distinct Summary Counters */}
                                        <td className="p-2 border border-slate-200 font-black text-emerald-700 bg-emerald-50/50 badge-print-present">
                                            {s.presentCount}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-black text-amber-700 bg-amber-50/50 badge-print-excused">
                                            {s.excusedCount}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-black text-rose-700 bg-rose-50/50 badge-print-absent">
                                            {s.absentCount}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-black text-indigo-700 bg-indigo-50/50">
                                            {s.attendancePercentage}%
                                        </td>

                                        {/* Specific Meeting Dates Statuses */}
                                        {periodMode !== 'yearly' && uniqueMeetingDates.length > 0 && (
                                            uniqueMeetingDates.map(dateStr => {
                                                const status = s.datesMap[dateStr];
                                                return (
                                                    <td key={dateStr} className="p-1 border border-slate-200 text-xs font-black">
                                                        {status === 'حضور' ? (
                                                            <span className="text-emerald-600" title="حاضر">✅</span>
                                                        ) : status === 'اعتذار' ? (
                                                            <span className="text-amber-600" title="معتذر">🟡</span>
                                                        ) : status === 'غياب' ? (
                                                            <span className="text-rose-600" title="غائب">❌</span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })
                                        )}

                                        {/* Spiritual & Commitments */}
                                        <td className="p-2 border border-slate-200 font-bold text-slate-700">{s.liturgyCount}</td>
                                        <td className="p-2 border border-slate-200 font-bold text-slate-700">{s.prepCount}</td>
                                        <td className="p-2 border border-slate-200 font-bold text-slate-700">
                                            {periodMode === 'yearly' ? s.visitationCount : s.visitationText}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-bold text-slate-600 text-[11px]" dir="ltr">
                                            {s.confessionDate}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-black text-slate-700 text-[11px]">
                                            {periodMode === 'yearly' ? s.serviceActivityCount : s.activitiesServiceText}
                                        </td>
                                        <td className="p-2 border border-slate-200 font-bold text-slate-700 text-[10px]">
                                            {s.activitiesDiocese}
                                        </td>
                                        
                                        {/* Notes & Excuses */}
                                        <td className="p-2 border border-slate-200 text-[10px] font-bold text-slate-700 text-right leading-relaxed max-w-[220px]">
                                            {s.notesList && s.notesList.length > 0 ? (
                                                <ul className="space-y-1 list-none p-0 m-0">
                                                    {s.notesList.map((item, nIdx) => (
                                                        <li key={nIdx} className="border-b border-slate-100 last:border-b-0 pb-0.5">
                                                            <span className={`text-[9px] font-black block ${item.label === 'اعتذار' ? 'text-amber-600' : 'text-indigo-600'}`}>
                                                                {item.date} ({item.label}):
                                                            </span>
                                                            <span className="text-slate-800">{item.text}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
