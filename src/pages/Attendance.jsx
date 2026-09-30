/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable no-unused-vars */
import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Search, Church, BookOpen, CheckCheck, X, MessageCircleWarning, History, UserMinus, UserCheck, Calendar } from 'lucide-react';
import useAutoSync from '../hooks/useAutoSync';
import BottomNav from '../components/BottomNav';

export default function Attendance() {
    const { triggerAutoSync } = useAutoSync();
    const location = useLocation();
    const navigate = useNavigate();
    const passedDate = location.state?.preselectedDate;

    const [activeFilter, setActiveFilter] = useState(sessionStorage.getItem('attendance_filter') || "all");
    const [searchQuery, setSearchQuery] = useState(sessionStorage.getItem('attendance_search') || "");
    const [modalState, setModalState] = useState({ isOpen: false, type: null });

    // Sync state with sessionStorage
    React.useEffect(() => sessionStorage.setItem('attendance_filter', activeFilter), [activeFilter]);
    React.useEffect(() => sessionStorage.setItem('attendance_search', searchQuery), [searchQuery]);

    const isFriday = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return !isNaN(d.getTime()) && d.getDay() === 5;
    };

    const targetDate = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day >= 5 ? day - 5 : day + 2;
        d.setDate(d.getDate() - diff);
        return d.toISOString().split('T')[0];
    }, []);

    const [selectedDate, setSelectedDate] = useState(() => {
        if (passedDate && isFriday(passedDate)) return passedDate;
        const saved = sessionStorage.getItem('attendance_date');
        if (saved && isFriday(saved)) return saved;
        return targetDate;
    });
    
    // Sync date selection with sessionStorage (ignoring initial passedDate resets after the fact)
    React.useEffect(() => sessionStorage.setItem('attendance_date', selectedDate), [selectedDate]);

    const handleDateChange = (e) => {
        const val = e.target.value;
        if (!val) return;
        if (isFriday(val)) {
            setSelectedDate(val);
        } else {
            alert("تنبيه: الغياب يقتصر على أيام الجمعة فقط ⛪");
        }
    };

    const handlePreviousFriday = () => {
        const d = new Date(selectedDate);
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() - 7);
            setSelectedDate(d.toISOString().split('T')[0]);
        }
    };

    // Dynamic attendance queries based on selectedDate
    const attendanceRecords = useLiveQuery(() => db.attendance.where('date').equals(selectedDate).toArray(), [selectedDate]);

    const getAttendanceStatus = (childId, type) => {
        const record = attendanceRecords?.find(a => a.childId === childId && a.type === type && !a.isDeleted);
        return record ? (record.status || 'present') : null;
    };

    // 🔐 عزل البيانات: كل أسرة تشوف أطفالها بس
    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
    const children = useLiveQuery(() => {
        if (isMaster) {
            return searchQuery
                ? db.children.where('name').startsWithIgnoreCase(searchQuery).toArray()
                : db.children.toArray();
        }
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).toArray()
            .then(arr => searchQuery
                ? arr.filter(c => c.name?.toLowerCase().startsWith(searchQuery.toLowerCase()))
                : arr);
    }, [searchQuery, currentSyncKey, isMaster]);

    const filteredChildren = children?.filter((c) => {
        if (activeFilter === "boys" && c.gender === "بنت") return false;
        if (activeFilter === "girls" && c.gender !== "بنت") return false;
        return true;
    }) || [];

    const liturgyCount = attendanceRecords?.filter(a => a.type === 'liturgy' && filteredChildren.some(c => c.id === a.childId)).length || 0;
    const serviceCount = attendanceRecords?.filter(a => a.type === 'service' && filteredChildren.some(c => c.id === a.childId)).length || 0;

    const getReportData = () => {
        let list = [];
        if (modalState.type === 'absent') {
            list = (children || []).filter(c => getAttendanceStatus(c.id, 'service') === 'absent');
        } else if (modalState.type === 'excused') {
            list = (children || []).filter(c => getAttendanceStatus(c.id, 'service') === 'excused');
        } else if (modalState.type === 'service') {
            list = (children || []).filter(c => getAttendanceStatus(c.id, 'service') === 'present');
        } else if (modalState.type === 'liturgy') {
            list = (children || []).filter(c => getAttendanceStatus(c.id, 'liturgy') === 'present');
        }

        return {
            boys: list.filter(c => c.gender !== 'بنت'),
            girls: list.filter(c => c.gender === 'بنت')
        };
    };

    const { boys: reportBoys, girls: reportGirls } = modalState.isOpen ? getReportData() : { boys: [], girls: [] };

    const setAttendanceStatus = async (child, type, status) => {
        try {
            const now = new Date().toISOString();
            const currentSyncKey = localStorage.getItem('currentSyncKey');

            const records = await db.attendance.where('date').equals(selectedDate).toArray();
            const activeRecords = records.filter(a => a.childId === child.id && !a.isDeleted);
            const currentRecord = activeRecords.find(r => r.type === type);
            
            const updates = { isDirty: true, updatedAt: now };

            if (currentRecord) {
                if (currentRecord.status === status) {
                    // Clicking the same status removes it
                    await db.attendance.update(currentRecord.id, { isDeleted: true, isDirty: true, updatedAt: now });
                    if (status === 'present') {
                        const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                        if (child[field] === selectedDate) updates[field] = null;
                        if (activeRecords.length === 1) updates.streak = Math.max((child.streak || 0) - 1, 0);
                    }
                } else {
                    // Update existing record
                    await db.attendance.update(currentRecord.id, { status, isDirty: true, updatedAt: now });
                    if (status === 'present') {
                        const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                        if (!child[field] || selectedDate >= child[field]) updates[field] = selectedDate;
                    }
                }
            } else {
                // Add new record
                await db.attendance.add({ 
                    date: selectedDate, 
                    childId: child.id, 
                    type: type, 
                    status: status,
                    syncKey: currentSyncKey, 
                    isDirty: true, 
                    updatedAt: now, 
                    isDeleted: false 
                });
                
                if (status === 'present') {
                    const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                    if (!child[field] || selectedDate >= child[field]) updates[field] = selectedDate;
                    if (activeRecords.length === 0) updates.streak = (child.streak || 0) + 1;
                }
            }
            
            await db.children.update(child.id, updates);
            triggerAutoSync();
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

    const generateMissedFridayMsg = (child) => {
        const title = child.gender === 'بنت' ? 'بطلتنا' : 'بطلنا';
        const namePart = child.name ? child.name.split(' ')[0] : 'يا بطل';
        let msg = `وحشتنا يا ${title} (${namePart})! 🥺💔\nمجتش ليه يوم ${selectedDate}؟ مكانك كان فاضي، مستنيينك في الكنيسة!`;
        const phone = cleanPhoneNumber(getTargetPhone(child));
        return {
            whatsapp: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
            sms: `sms:${phone}?body=${encodeURIComponent(msg)}`
        };
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-32 font-sans" dir="rtl">
            <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm mb-6 rounded-b-4xl">
                <div className="max-w-4xl mx-auto">
                    {/* Date Picker UI Wrapper */}
                    <div className="flex items-center gap-2 mb-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                        <Calendar className="text-blue-500 w-5 h-5 mr-2" />
                        <input type="date" value={selectedDate} onChange={handleDateChange} className="flex-1 bg-slate-50 text-slate-700 font-bold py-2 px-3 rounded-xl outline-none border border-slate-200 focus:border-blue-400 focus:bg-white transition-all text-sm" />
                        <button onClick={handlePreviousFriday} className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-100 transition-all shrink-0 border border-blue-100">
                            الجمعة الماضية
                        </button>
                    </div>

                    <div className="relative mb-4">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="ابحث عن بطل..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pr-10 pl-4 py-2.5 rounded-full bg-slate-100 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div className="flex gap-2 justify-center">
                        {[{ id: "all", label: "الكل 🌟" }, { id: "boys", label: "ولاد 👦" }, { id: "girls", label: "بنات 👧" }].map(f => (
                            <button key={f.id} onClick={() => setActiveFilter(f.id)} aria-label={`تصفية حسب ${f.label}`} className={`flex-1 px-4 py-2 rounded-full text-xs font-black transition-all ${activeFilter === f.id ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600"}`}>{f.label}</button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="px-4 max-w-4xl mx-auto">
                <div className="bg-white border border-slate-200 p-4 rounded-3xl mb-6 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center px-1">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><History size={16} className="text-indigo-500" /> تقارير يوم ({selectedDate})</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                        <button onClick={() => setModalState({ isOpen: true, type: 'absent' })} className="bg-red-700 text-red-50 border border-red-800 py-2.5 rounded-xl text-[11px] font-black hover:bg-red-800 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <UserMinus size={16} /> المتبقين / غياب
                        </button>
                        <button onClick={() => setModalState({ isOpen: true, type: 'service' })} className="bg-green-700 text-green-50 border border-green-800 py-2.5 rounded-xl text-[11px] font-black hover:bg-green-800 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <UserCheck size={16} /> حضور الخدمة
                        </button>
                        <button onClick={() => setModalState({ isOpen: true, type: 'liturgy' })} className="bg-yellow-600 text-yellow-50 border border-yellow-700 py-2.5 rounded-xl text-[11px] font-black hover:bg-yellow-700 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                            <Church size={16} /> حضور القداس
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 mb-6">
                    <div className="flex-1 bg-blue-50 p-3 rounded-2xl border border-blue-100 flex justify-between items-center"><span className="text-blue-700 font-black text-sm flex gap-1"><Church size={18} /> قداس</span><span className="bg-blue-500 text-white px-2 py-0.5 rounded-md text-xs">{liturgyCount}</span></div>
                    <div className="flex-1 bg-green-50 p-3 rounded-2xl border border-green-100 flex justify-between items-center"><span className="text-green-700 font-black text-sm flex gap-1"><BookOpen size={18} /> خدمة</span><span className="bg-green-500 text-white px-2 py-0.5 rounded-md text-xs">{serviceCount}</span></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredChildren.map(child => (
                        <div key={child.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col gap-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl overflow-hidden ring-2 ring-slate-50">{child.profilePic ? <img src={child.profilePic} className="object-cover w-full h-full" /> : (child.gender === 'بنت' ? '👧' : '👦')}</div>
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
                                {modalState.type === 'absent' && <><UserMinus size={20} /> تقرير غياب</>}
                                {modalState.type === 'service' && <><BookOpen size={20} /> تقرير حضور الخدمة</>}
                                {modalState.type === 'liturgy' && <><Church size={20} /> تقرير حضور القداس</>}
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
                                                        <a href={generateMissedFridayMsg(child).whatsapp} aria-label={`واتساب لـ ${child.name}`} target="_blank" rel="noreferrer" className="bg-green-700 text-green-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-800">
                                                            <MessageCircleWarning size={12} /> واتساب
                                                        </a>
                                                        <a href={generateMissedFridayMsg(child).sms} aria-label={`رسالة لـ ${child.name}`} className="bg-blue-600 text-blue-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">
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
                                                        <a href={generateMissedFridayMsg(child).whatsapp} aria-label={`واتساب لـ ${child.name}`} target="_blank" rel="noreferrer" className="bg-green-700 text-green-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-green-800">
                                                            <MessageCircleWarning size={12} /> واتساب
                                                        </a>
                                                        <a href={generateMissedFridayMsg(child).sms} aria-label={`رسالة لـ ${child.name}`} className="bg-blue-600 text-blue-50 px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-700">
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