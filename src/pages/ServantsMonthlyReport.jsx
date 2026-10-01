import React, { useState, useEffect } from 'react';
import { Printer, ArrowRight, Calendar, Filter, Loader2, Users, LayoutList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { firestore } from '../db/firebase';

export default function ServantsMonthlyReport() {
    const navigate = useNavigate();
    
    const getCurrentMonthYear = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const [viewMode, setViewMode] = useState('monthly'); // 'monthly' or 'yearly'
    const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [stageFilter, setStageFilter] = useState("الكل");
    const [osraFilter, setOsraFilter] = useState("الكل");
    
    const [reportData, setReportData] = useState([]);
    const [uniqueOsras, setUniqueOsras] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchReport = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch base servants
                let baseServants = [];
                const configSnap = await getDoc(doc(firestore, 'System', 'mainConfig'));
                if (configSnap.exists()) {
                    baseServants = configSnap.data().servants || [];
                }
                const servantsSnap = await getDocs(collection(firestore, "servants"));
                servantsSnap.forEach(doc => {
                    if (!baseServants.find(s => s.phone === doc.data().phone)) {
                        baseServants.push({ ...doc.data(), uid: doc.id });
                    }
                });

                // Extract Osras for dropdown
                const osras = new Set();
                baseServants.forEach(s => {
                    s.osraName = s.osraName || s.syncKey || "غير محدد";
                    if (s.osraName !== "MASTER_ACCESS" && s.osraName !== "ADMIN_MODE") {
                        osras.add(s.osraName);
                    }
                });
                setUniqueOsras(Array.from(osras));

                // Filter servants by Stage & Osra
                let filteredServants = baseServants;
                if (stageFilter !== "الكل") {
                    filteredServants = filteredServants.filter(s => s.stage === stageFilter);
                }
                if (osraFilter !== "الكل") {
                    filteredServants = filteredServants.filter(s => s.osraName === osraFilter);
                }

                // 2. Fetch attendance
                let attendanceSnap;
                if (viewMode === 'monthly') {
                    const q = query(collection(firestore, "ServantAttendance"), where("month", "==", monthYear));
                    attendanceSnap = await getDocs(q);
                } else {
                    // Yearly: fetch all months in the selected year
                    const startMonth = `${selectedYear}-01`;
                    const endMonth = `${selectedYear}-12`;
                    const q = query(collection(firestore, "ServantAttendance"), where("month", ">=", startMonth), where("month", "<=", endMonth));
                    attendanceSnap = await getDocs(q);
                }
                
                const attendanceByServant = {};
                attendanceSnap.forEach(d => {
                    const data = d.data();
                    const sId = data.uid || data.phone;
                    if (!attendanceByServant[sId]) attendanceByServant[sId] = [];
                    attendanceByServant[sId].push(data);
                });

                // 3. Aggregate data
                const allWeekDates = [...new Set(attendanceSnap.docs.map(d => d.data().weekDate))].sort();
                const totalWeeks = allWeekDates.length > 0 ? allWeekDates.length : (viewMode === 'monthly' ? 4 : 52);

                const aggregatedData = filteredServants.map((s, idx) => {
                    const sId = s.uid || s.phone;
                    const records = attendanceByServant[sId] || [];
                    records.sort((a, b) => a.weekDate.localeCompare(b.weekDate)); // Sort oldest to newest

                    let attendanceArr = ['-', '-', '-', '-', '-'];
                    if (viewMode === 'monthly') {
                        records.forEach(r => {
                            const wIdx = allWeekDates.indexOf(r.weekDate);
                            if (wIdx >= 0 && wIdx < 5) {
                                attendanceArr[wIdx] = r.attendance === 'حضور' ? '✅' : r.attendance === 'غياب' ? '❌' : '🟡';
                            }
                        });
                    }

                    const generalAttendanceCount = records.filter(r => r.attendance === 'حضور').length;
                    const liturgyCount = records.filter(r => r.liturgy).length;
                    const prepCount = records.filter(r => r.preparation).length;
                    const meetingCount = records.filter(r => r.meeting).length;
                    
                    const visitationCount = records.filter(r => r.visitation).length;
                    const serviceActivityCount = records.filter(r => r.activitiesService).length;
                    const dioceseActivityCount = records.filter(r => r.activitiesDiocese && r.activitiesDiocese.trim() !== "").length;

                    // Get latest values for text fields
                    let confessionDate = "";
                    let activitiesDiocese = "";
                    let tasks = "";
                    records.forEach(r => {
                        if (r.confessionDate) confessionDate = r.confessionDate;
                        if (r.activitiesDiocese) activitiesDiocese = r.activitiesDiocese;
                        if (r.tasks) tasks = r.tasks;
                    });

                    const weeklyNotes = records.filter(r => r.leaderNotes).map(r => ({
                        week: r.weekDate.substring(5), // Keep MM-DD
                        text: r.leaderNotes
                    }));

                    return {
                        id: sId,
                        index: idx + 1,
                        name: s.name,
                        osraName: s.osraName,
                        attendance: attendanceArr,
                        generalAttendanceCount,
                        liturgyCount,
                        prepCount,
                        meetingCount,
                        visitationCount,
                        serviceActivityCount,
                        dioceseActivityCount,
                        liturgy: `${liturgyCount}/${totalWeeks}`,
                        preparation: `${prepCount}/${totalWeeks}`,
                        meeting: `${meetingCount}/${totalWeeks}`,
                        visitation: viewMode === 'monthly' ? (records.some(r => r.visitation) ? '✅' : '❌') : visitationCount,
                        confessionDate,
                        activitiesService: viewMode === 'monthly' ? (records.some(r => r.activitiesService) ? '✅' : '❌') : serviceActivityCount,
                        activitiesDiocese: viewMode === 'monthly' ? activitiesDiocese : dioceseActivityCount,
                        tasks,
                        weeklyNotes,
                        totalWeeks
                    };
                });

                setReportData(aggregatedData);
            } catch (err) {
                console.error("Error fetching report data:", err);
            }
            setIsLoading(false);
        };

        fetchReport();
    }, [monthYear, selectedYear, viewMode, stageFilter, osraFilter]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20 print:pb-0 print:bg-white" dir="rtl">
            
            <style>
                {`
                @media print {
                    @page { 
                        size: A4 landscape; 
                        margin: 10mm; 
                    }
                    body { 
                        background-color: #fff !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        direction: rtl !important;
                    }
                    .no-print { display: none !important; }
                    
                    /* Hide sidebars and extra UI */
                    header, nav, .sidebar { display: none !important; }

                    .print-area { 
                        width: 100% !important; 
                        max-width: 100% !important;
                        margin: 0 !important; 
                        padding: 0 !important; 
                        box-shadow: none !important;
                        border: none !important;
                    }
                    
                    /* Remove overflow hiding on table wrapper */
                    .overflow-x-auto { 
                        overflow: visible !important; 
                    }

                    table { 
                        border-collapse: collapse !important; 
                        width: 100% !important; 
                        background: #fff !important;
                    }
                    th, td { 
                        border: 1px solid #000 !important; 
                        padding: 6px !important; 
                        text-align: center !important; 
                        font-size: 11px !important; 
                        color: #000 !important; 
                        vertical-align: middle !important;
                        background: #fff !important;
                        word-wrap: break-word !important;
                    }
                    th { 
                        background-color: #f3f4f6 !important; 
                        font-weight: bold !important; 
                    }
                    
                    .print-header { 
                        display: block !important; 
                        margin-bottom: 20px; 
                        text-align: center; 
                        color: #000 !important;
                    }
                    
                    ul, li {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .print-border-bottom {
                        border-bottom: 1px solid #ccc !important;
                    }
                }
                `}
            </style>

            {/* Print Header (Only visible on print) */}
            <div className="hidden print:block print-header">
                <h1 className="text-2xl font-black mb-2">
                    {viewMode === 'monthly' ? 'التقرير الشهري لمتابعة وتقييم الخدام' : `التقرير السنوي للخدام - لعام ${selectedYear}`}
                </h1>
                <h2 className="text-lg font-bold">
                    {viewMode === 'monthly' ? `عن شهر: ${monthYear}` : `الأسرة: ${osraFilter}`} | المرحلة: {stageFilter}
                </h2>
            </div>

            {/* App Navbar (Hidden on print) */}
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem] no-print">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black text-amber-400 flex items-center gap-2">
                                <Printer size={20} /> تقارير الخدام ({viewMode === 'monthly' ? 'شهري' : 'سنوي'})
                            </h1>
                            <p className="text-xs font-bold text-slate-300">
                                تجهيز للطباعة بصيغة إكسيل
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-[95%] mx-auto mt-6 print-area">
                
                {/* Control Bar (Hidden on print) */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between no-print animate-in slide-in-from-top-4">
                    
                    {/* View Switcher Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                        <button 
                            onClick={() => setViewMode('monthly')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all ${viewMode === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            شهري
                        </button>
                        <button 
                            onClick={() => setViewMode('yearly')}
                            className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-bold text-sm transition-all ${viewMode === 'yearly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            سنوي
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-4 w-full md:w-auto">
                        {/* Date Picker */}
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <Calendar className="text-slate-500" size={18} />
                            {viewMode === 'monthly' ? (
                                <input 
                                    type="month" 
                                    value={monthYear} 
                                    onChange={(e) => setMonthYear(e.target.value)} 
                                    className="bg-transparent border-none outline-none font-bold text-sm text-slate-700"
                                />
                            ) : (
                                <select 
                                    value={selectedYear} 
                                    onChange={(e) => setSelectedYear(e.target.value)} 
                                    className="bg-transparent border-none outline-none font-bold text-sm text-slate-700"
                                >
                                    {Array.from({length: 10}, (_, i) => new Date().getFullYear() - i).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        
                        {/* Stage Filter */}
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <Filter className="text-slate-500" size={18} />
                            <select 
                                value={stageFilter} 
                                onChange={(e) => setStageFilter(e.target.value)} 
                                className="bg-transparent border-none outline-none font-bold text-sm text-slate-700"
                            >
                                <option value="الكل">كل المراحل</option>
                                <option value="ابتدائي">ابتدائي</option>
                                <option value="اعدادي">اعدادي</option>
                                <option value="ثانوي">ثانوي</option>
                            </select>
                        </div>

                        {/* Osra Filter */}
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <Users className="text-slate-500" size={18} />
                            <select 
                                value={osraFilter} 
                                onChange={(e) => setOsraFilter(e.target.value)} 
                                className="bg-transparent border-none outline-none font-bold text-sm text-slate-700 max-w-[150px] truncate"
                            >
                                <option value="الكل">كل الأسر</option>
                                {uniqueOsras.map(osra => (
                                    <option key={osra} value={osra}>{osra}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button onClick={handlePrint} className="w-full md:w-auto bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-xl font-black transition-colors flex items-center justify-center gap-2 shadow-md hover:shadow-lg hover:scale-[1.02]">
                        <Printer size={20} /> طباعة التقرير (A4 Landscape)
                    </button>
                </div>

                {/* The Report Table */}
                <div className="bg-white rounded-3xl shadow-lg border border-slate-200 overflow-x-auto print-area animate-in zoom-in-95">
                    <table className="w-full text-center text-sm border-collapse">
                        <thead className="bg-slate-100 text-slate-800 font-black border-b-2 border-slate-300">
                            {viewMode === 'monthly' ? (
                                <>
                                    <tr>
                                        <th className="p-3 border border-slate-200" rowSpan="2">م</th>
                                        <th className="p-3 border border-slate-200 min-w-[150px]" rowSpan="2">الاسم</th>
                                        <th className="p-3 border border-slate-200 min-w-[120px]" rowSpan="2">الأسرة</th>
                                        <th className="p-3 border border-slate-200 bg-emerald-50 text-emerald-800" colSpan="5">حضور الخدمة</th>
                                        <th className="p-3 border border-slate-200 min-w-[80px]" rowSpan="2">قداس</th>
                                        <th className="p-3 border border-slate-200 min-w-[80px]" rowSpan="2">التحضير</th>
                                        <th className="p-3 border border-slate-200 min-w-[100px]" rowSpan="2">اجتماع الخدمة</th>
                                        <th className="p-3 border border-slate-200 min-w-[100px]" rowSpan="2">مشارك بالافتقاد</th>
                                        <th className="p-3 border border-slate-200 min-w-[110px]" rowSpan="2">تاريخ الاعتراف</th>
                                        <th className="p-3 border border-slate-200 bg-blue-50 text-blue-800" colSpan="2">مشارك بالانشطة</th>
                                        <th className="p-3 border border-slate-200" rowSpan="2">المهام / الخادم</th>
                                        <th className="p-3 border border-slate-200" rowSpan="2">ملاحظات أمين الخدمة</th>
                                    </tr>
                                    <tr className="bg-slate-50 text-[11px] text-slate-600">
                                        <th className="p-2 border border-slate-200 w-[30px] bg-emerald-50/50">1</th>
                                        <th className="p-2 border border-slate-200 w-[30px] bg-emerald-50/50">2</th>
                                        <th className="p-2 border border-slate-200 w-[30px] bg-emerald-50/50">3</th>
                                        <th className="p-2 border border-slate-200 w-[30px] bg-emerald-50/50">4</th>
                                        <th className="p-2 border border-slate-200 w-[30px] bg-emerald-50/50">5</th>
                                        
                                        <th className="p-2 border border-slate-200 w-[60px] bg-blue-50/50">الخدمة</th>
                                        <th className="p-2 border border-slate-200 w-[60px] bg-blue-50/50">الايبارشية</th>
                                    </tr>
                                </>
                            ) : (
                                <tr>
                                    <th className="p-3 border border-slate-200">م</th>
                                    <th className="p-3 border border-slate-200 min-w-[150px]">الاسم</th>
                                    <th className="p-3 border border-slate-200 min-w-[120px]">الأسرة</th>
                                    <th className="p-3 border border-slate-200 bg-emerald-50 text-emerald-800">إجمالي الحضور العامة</th>
                                    <th className="p-3 border border-slate-200 bg-emerald-50 text-emerald-800">إجمالي القداسات</th>
                                    <th className="p-3 border border-slate-200 bg-emerald-50 text-emerald-800">إجمالي التحضير</th>
                                    <th className="p-3 border border-slate-200 bg-emerald-50 text-emerald-800">إجمالي اجتماع الخدمة</th>
                                    <th className="p-3 border border-slate-200 text-blue-800">مشاركات الافتقاد</th>
                                    <th className="p-3 border border-slate-200 text-purple-800">مشاركات الأنشطة</th>
                                    <th className="p-3 border border-slate-200 min-w-[110px]">تاريخ آخر اعتراف</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={viewMode === 'monthly' ? 16 : 10} className="text-center p-8">
                                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-2" />
                                        <span className="text-sm font-bold text-slate-500">جاري تجميع التقرير...</span>
                                    </td>
                                </tr>
                            ) : reportData.length === 0 ? (
                                <tr>
                                    <td colSpan={viewMode === 'monthly' ? 16 : 10} className="text-center p-8 text-slate-500 font-bold">لا يوجد بيانات للعرض.</td>
                                </tr>
                            ) : (
                                reportData.map((s, index) => (
                                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 border border-slate-200 font-bold text-slate-500">{s.index || index + 1}</td>
                                        <td className="p-3 border border-slate-200 font-black text-slate-800 text-right">{s.name}</td>
                                        <td className="p-3 border border-slate-200 font-bold text-indigo-600 bg-indigo-50/30 text-xs">{s.osraName}</td>
                                        
                                        {viewMode === 'monthly' ? (
                                            <>
                                                {/* Attendance Weeks */}
                                                {s.attendance.map((att, i) => (
                                                    <td key={i} className="p-3 border border-slate-200 font-black text-[10px]">
                                                        {att}
                                                    </td>
                                                ))}

                                                <td className="p-3 border border-slate-200 font-bold text-slate-700">{s.liturgy}</td>
                                                <td className="p-3 border border-slate-200 font-bold text-slate-700">{s.preparation}</td>
                                                <td className="p-3 border border-slate-200 font-bold text-slate-700">{s.meeting}</td>
                                                <td className="p-3 border border-slate-200 font-bold text-slate-700">{s.visitation}</td>
                                                
                                                <td className="p-3 border border-slate-200 font-bold text-slate-600 text-xs" dir="ltr">{s.confessionDate}</td>
                                                
                                                <td className="p-3 border border-slate-200 font-black text-[10px]">{s.activitiesService}</td>
                                                <td className="p-3 border border-slate-200 font-bold text-slate-700 text-[10px]">{s.activitiesDiocese}</td>
                                                
                                                <td className="p-3 border border-slate-200 text-xs font-bold text-slate-600 text-right">{s.tasks}</td>
                                                
                                                <td className="p-3 border border-slate-200 text-[10px] font-bold text-slate-800 text-right leading-relaxed">
                                                    {s.weeklyNotes && s.weeklyNotes.length > 0 ? (
                                                        <ul className="space-y-1 list-none p-0 m-0">
                                                            {s.weeklyNotes.map((note, idx) => (
                                                                <li key={idx} className={`pb-1 ${idx !== s.weeklyNotes.length - 1 ? 'border-b border-slate-100 print:print-border-bottom' : ''}`}>
                                                                    <span className="text-amber-600 print:text-black font-black block text-[9px] mb-0.5">{note.week}:</span>
                                                                    <span className="block text-slate-700 print:text-black">{note.text}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-slate-400">-</span>
                                                    )}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                {/* Yearly Data Aggregation Columns */}
                                                <td className="p-3 border border-slate-200 font-black text-slate-800 bg-slate-50/50">{s.generalAttendanceCount} / {s.totalWeeks}</td>
                                                <td className="p-3 border border-slate-200 font-black text-emerald-700 bg-emerald-50/30">{s.liturgyCount}</td>
                                                <td className="p-3 border border-slate-200 font-black text-emerald-700 bg-emerald-50/30">{s.prepCount}</td>
                                                <td className="p-3 border border-slate-200 font-black text-emerald-700 bg-emerald-50/30">{s.meetingCount}</td>
                                                
                                                <td className="p-3 border border-slate-200 font-black text-blue-700 bg-blue-50/30">{s.visitationCount}</td>
                                                <td className="p-3 border border-slate-200 font-black text-purple-700 bg-purple-50/30">{s.serviceActivityCount + s.dioceseActivityCount}</td>
                                                
                                                <td className="p-3 border border-slate-200 font-bold text-slate-600 text-xs" dir="ltr">{s.confessionDate || '-'}</td>
                                            </>
                                        )}
                                    </tr>
                                )))}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
