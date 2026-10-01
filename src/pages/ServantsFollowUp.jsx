import React, { useState, useEffect } from 'react';
import { ArrowRight, ClipboardList, Search, Save, CheckCircle2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, onSnapshot, query, where, setDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function ServantsFollowUp() {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const getOsraName = (key) => {
        if (!key || key === 'الكل') return key;
        const osra = TENANT_CONFIG.osras.find(o => o.syncKey === key);
        return osra ? osra.name : key;
    };

    const getServiceFriday = (date = new Date()) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 6 ? -1 : 5);
        d.setDate(diff);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const [weekDate, setWeekDate] = useState(() => getServiceFriday());

    const handleDateChange = (val) => {
        if (!val) return;
        setWeekDate(getServiceFriday(val));
    };

    const [servantsData, setServantsData] = useState([]);
    
    // 🌟 1. Fetch Servants & Listen to Attendance in Real-Time
    useEffect(() => {
        let unsubscribe = () => {};

        const fetchAndListen = async () => {
            // First fetch the servants from either the old mainConfig or the new servants collection
            let baseServants = [];
            try {
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
            } catch (err) {
                console.error("Error fetching base servants:", err);
            }

            // Prepare a map with default values
            const servantsMap = {};
            baseServants.forEach(s => {
                const sId = s.uid || s.phone; // fallback to phone if no uid
                servantsMap[sId] = {
                    id: sId,
                    uid: sId,
                    name: s.name,
                    osraName: s.osraName || s.syncKey || "غير محدد",
                    weekDate,
                    month: weekDate.substring(0, 7),
                    attendance: "حضور",
                    liturgy: false, preparation: false, meeting: false, visitation: false,
                    confessionDate: "", activitiesService: false, activitiesDiocese: "", tasks: "", leaderNotes: "",
                    profileImage: s.profileImage || ""
                };
            });

            // Listen to attendance data for the selected week
            const q = query(collection(firestore, "ServantAttendance"), where("weekDate", "==", weekDate));
            
            unsubscribe = onSnapshot(q, (snapshot) => {
                const currentData = { ...servantsMap }; // Reset to base map
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (currentData[data.uid]) {
                        currentData[data.uid] = { ...currentData[data.uid], ...data };
                    }
                });
                setServantsData(Object.values(currentData));
            });
        };

        fetchAndListen();
        return () => unsubscribe();
    }, [weekDate]);

    const handleUpdate = async (id, field, value) => {
        // Optimistic UI update
        const updatedServants = servantsData.map(s => {
            if (s.id === id) {
                const updated = { ...s, [field]: value };
                if (field === 'attendance' && value !== 'حضور') {
                    updated.liturgy = false;
                    updated.preparation = false;
                    updated.meeting = false;
                    updated.visitation = false;
                }
                return updated;
            }
            return s;
        });
        setServantsData(updatedServants);

        // Instant save to Firebase to keep sync loop 100% connected
        const target = updatedServants.find(s => s.id === id);
        if (target) {
            const docId = `${weekDate}_${target.uid}`;
            try {
                await setDoc(doc(firestore, "ServantAttendance", docId), target, { merge: true });
            } catch (err) {
                console.error("Error updating firebase:", err);
            }
        }
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            alert("تم حفظ التقييمات بنجاح للسحابة!");
        }, 1000);
    };

    const filteredServants = servantsData.filter(s => s.name.includes(search));

    return (
        <div className="min-h-screen bg-slate-900 font-sans pb-20 text-slate-200" dir="rtl">
            <header className="bg-slate-950 p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem] border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="w-10 h-10 bg-slate-800 text-slate-300 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black text-emerald-400 flex items-center gap-2">
                                <ClipboardList size={20} /> متابعة وتقييم الخدام
                            </h1>
                            <p className="text-xs font-bold text-slate-400">
                                لوحة الإدارة المركزية (Super Admin)
                            </p>
                        </div>
                    </div>
                    <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-black transition-colors flex items-center gap-2 shadow-md">
                        {isSaving ? "جاري الحفظ..." : <><Save size={16} /> حفظ التقييم</>}
                    </button>
                </div>
            </header>

            <main className="p-4 max-w-7xl mx-auto mt-6">
                <div className="bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                        <div className="relative w-full md:w-1/3">
                            <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="date" 
                                value={weekDate}
                                onChange={e => handleDateChange(e.target.value)}
                                className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none text-white transition-all"
                            />
                        </div>
                        <div className="relative w-full md:w-1/3">
                            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="ابحث باسم الخادم..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-white placeholder-slate-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/50 hidden md:block">
                        <table className="w-full min-w-[1200px] text-sm text-right">
                            <thead className="bg-slate-900 text-slate-300 font-black border-b border-slate-700">
                                <tr>
                                    <th className="p-4 text-center border-r border-slate-700 w-12">الصورة</th>
                                    <th className="p-4 min-w-[150px]">اسم الخادم</th>
                                    <th className="p-4 min-w-[120px]">الأسرة</th>
                                    <th className="p-4 text-center min-w-[120px]">الحضور العام</th>
                                    <th className="p-4 text-center">قداس</th>
                                    <th className="p-4 text-center">التحضير</th>
                                    <th className="p-4 text-center">اجتماع الخدمة</th>
                                    <th className="p-4 text-center">مشارك بالافتقاد</th>
                                    <th className="p-4 text-center min-w-[140px]">تاريخ الاعتراف</th>
                                    <th className="p-4 text-center border-r border-slate-700" colSpan="2">مشارك بالانشطة</th>
                                    <th className="p-4 min-w-[200px]">المهام / الملاحظات</th>
                                    <th className="p-4 min-w-[200px]">ملاحظات أمين الخدمة</th>
                                </tr>
                                <tr className="bg-slate-800/50 text-[10px] text-slate-400 border-b border-slate-700">
                                    <th colSpan="9"></th>
                                    <th className="p-2 text-center border-r border-slate-700 min-w-[100px]">الخدمة</th>
                                    <th className="p-2 text-center border-l border-slate-700 min-w-[140px]">الايبارشية</th>
                                    <th></th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {filteredServants.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-800/80 transition-colors">
                                        <td className="p-2 text-center border-r border-slate-700">
                                            {s.profileImage ? (
                                                <img src={s.profileImage} alt={s.name} className="w-10 h-10 rounded-full mx-auto object-cover border-2 border-slate-600" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full mx-auto bg-slate-700 flex items-center justify-center text-slate-400">
                                                    <span className="text-xs">{s.name.substring(0, 2)}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-black text-emerald-400">{s.name}</td>
                                        <td className="p-4 text-center">
                                            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                                                {getOsraName(s.osraName)}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <select 
                                                value={s.attendance} 
                                                onChange={e => handleUpdate(s.id, 'attendance', e.target.value)}
                                                className={`w-full p-2 rounded-lg text-xs font-black text-center outline-none border ${s.attendance === 'حضور' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : s.attendance === 'غياب' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                                            >
                                                <option value="حضور" className="bg-slate-800 text-emerald-400">حضور</option>
                                                <option value="غياب" className="bg-slate-800 text-red-400">غياب</option>
                                                <option value="اعتذار" className="bg-slate-800 text-amber-400">اعتذار</option>
                                            </select>
                                        </td>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.liturgy} onChange={e => handleUpdate(s.id, 'liturgy', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed" />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.preparation} onChange={e => handleUpdate(s.id, 'preparation', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed" />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.meeting} onChange={e => handleUpdate(s.id, 'meeting', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed" />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.visitation} onChange={e => handleUpdate(s.id, 'visitation', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 cursor-pointer accent-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed" />
                                        </td>
                                        <td className="p-4 text-center">
                                            <input type="date" value={s.confessionDate} onChange={e => handleUpdate(s.id, 'confessionDate', e.target.value)} className="bg-slate-800 border border-slate-600 text-slate-300 rounded-lg p-2 text-xs font-bold w-full outline-none focus:border-emerald-500" />
                                        </td>
                                        <td className="p-4 text-center border-r border-slate-700 bg-slate-800/30">
                                            <input type="checkbox" checked={s.activitiesService} onChange={e => handleUpdate(s.id, 'activitiesService', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer accent-blue-500" />
                                        </td>
                                        <td className="p-4 text-center border-l border-slate-700 bg-slate-800/30">
                                            <textarea value={s.activitiesDiocese} onChange={e => handleUpdate(s.id, 'activitiesDiocese', e.target.value)} placeholder="نشاط ايبارشية..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-800 border border-slate-600 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                                        </td>
                                        <td className="p-4">
                                            <textarea value={s.tasks} onChange={e => handleUpdate(s.id, 'tasks', e.target.value)} placeholder="ملاحظات الخادم..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-800 border border-slate-600 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                                        </td>
                                        <td className="p-4">
                                            <textarea value={s.leaderNotes} onChange={e => handleUpdate(s.id, 'leaderNotes', e.target.value)} placeholder="ملاحظات أمين الخدمة..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-700 border border-amber-600/30 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredServants.length === 0 && (
                            <div className="text-center py-8 text-slate-500 font-bold">لا يوجد بيانات لعرضها.</div>
                        )}
                    </div>

                    {/* Mobile View Cards */}
                    <div className="md:hidden space-y-4 mt-4">
                        {filteredServants.map(s => (
                            <div key={s.id} className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-sm">
                                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                                    <h3 className="font-black text-emerald-400 text-lg">{s.name}</h3>
                                    <select 
                                        value={s.attendance} 
                                        onChange={e => handleUpdate(s.id, 'attendance', e.target.value)}
                                        className={`p-1.5 rounded-lg text-xs font-black text-center outline-none border ${s.attendance === 'حضور' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : s.attendance === 'غياب' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}
                                    >
                                        <option value="حضور" className="bg-slate-800 text-emerald-400">حضور</option>
                                        <option value="غياب" className="bg-slate-800 text-red-400">غياب</option>
                                        <option value="اعتذار" className="bg-slate-800 text-amber-400">اعتذار</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-4 text-sm text-slate-300 font-bold">
                                    <label className={`flex items-center gap-2 justify-between p-2 rounded-lg ${s.attendance === 'حضور' ? 'bg-slate-800' : 'bg-slate-800/50 opacity-50'}`}>
                                        <span>قداس</span>
                                        <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.liturgy} onChange={e => handleUpdate(s.id, 'liturgy', e.target.checked)} className="w-5 h-5 accent-emerald-500" />
                                    </label>
                                    <label className={`flex items-center gap-2 justify-between p-2 rounded-lg ${s.attendance === 'حضور' ? 'bg-slate-800' : 'bg-slate-800/50 opacity-50'}`}>
                                        <span>التحضير</span>
                                        <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.preparation} onChange={e => handleUpdate(s.id, 'preparation', e.target.checked)} className="w-5 h-5 accent-emerald-500" />
                                    </label>
                                    <label className={`flex items-center gap-2 justify-between p-2 rounded-lg ${s.attendance === 'حضور' ? 'bg-slate-800' : 'bg-slate-800/50 opacity-50'}`}>
                                        <span>الاجتماع</span>
                                        <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.meeting} onChange={e => handleUpdate(s.id, 'meeting', e.target.checked)} className="w-5 h-5 accent-emerald-500" />
                                    </label>
                                    <label className={`flex items-center gap-2 justify-between p-2 rounded-lg ${s.attendance === 'حضور' ? 'bg-slate-800' : 'bg-slate-800/50 opacity-50'}`}>
                                        <span>الافتقاد</span>
                                        <input type="checkbox" disabled={s.attendance !== 'حضور'} checked={s.visitation} onChange={e => handleUpdate(s.id, 'visitation', e.target.checked)} className="w-5 h-5 accent-emerald-500" />
                                    </label>
                                </div>
                                <div className="mb-4">
                                    <label className="block text-xs text-slate-400 mb-1">تاريخ الاعتراف</label>
                                    <input type="date" value={s.confessionDate} onChange={e => handleUpdate(s.id, 'confessionDate', e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm outline-none" />
                                </div>
                                <div className="mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                    <label className="block text-xs text-slate-400 mb-2 border-b border-slate-700 pb-1">مشارك بالأنشطة</label>
                                    <div className="flex flex-col gap-3 mt-2">
                                        <label className="flex items-center gap-2 text-sm text-slate-300 flex-1">
                                            <input type="checkbox" checked={s.activitiesService} onChange={e => handleUpdate(s.id, 'activitiesService', e.target.checked)} className="w-5 h-5 accent-blue-500" /> الخدمة
                                        </label>
                                        <div className="flex-1">
                                            <textarea value={s.activitiesDiocese} onChange={e => handleUpdate(s.id, 'activitiesDiocese', e.target.value)} placeholder="نشاط الايبارشية..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-800 border border-slate-700 text-sm text-white outline-none focus:border-purple-500" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">المهام / ملاحظات الخادم</label>
                                    <textarea value={s.tasks} onChange={e => handleUpdate(s.id, 'tasks', e.target.value)} placeholder="اكتب ملاحظة..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-800 border border-slate-700 text-sm text-white outline-none mb-3" />
                                </div>
                                <div className="bg-slate-800/80 p-3 rounded-xl border border-amber-500/20">
                                    <label className="block text-xs text-amber-500/80 font-bold mb-1">ملاحظات أمين الخدمة</label>
                                    <textarea value={s.leaderNotes} onChange={e => handleUpdate(s.id, 'leaderNotes', e.target.value)} placeholder="ملاحظات خاصة بك كأمين أسرة..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-900 border border-amber-500/30 text-sm text-amber-100 placeholder-slate-500 outline-none focus:border-amber-500" />
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </main>
        </div>
    );
}
