import React, { useState, useEffect } from 'react';
import { ArrowRight, UserCheck, CheckCircle2, Check, Church, BookOpen, MapPin, Save, BellRing, Sparkles } from 'lucide-react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { useNavigate } from 'react-router-dom';

export default function ServantSelfCheckIn() {
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    
    // Helper to get current date as a string "YYYY-MM-DD"
    const getLocalYYYYMMDD = (d = new Date()) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    const today = new Date();
    const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    // Read current logged in servant
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{"name":"مينا مجدي"}');

    const weekDate = getLocalYYYYMMDD();
    const [year, month, dayStr] = weekDate.split('-');
    const displayDate = `${dayStr}/${month}/${year}`;
    const monthYear = todayMonth; // Ensure month reflects the actual check-in month
    const docId = `${weekDate}_${currentServant.uid || currentServant.phone}`; // fallback to phone if no uid yet

    const [record, setRecord] = useState({
        uid: currentServant.uid || currentServant.phone,
        name: currentServant.name || "خادم",
        weekDate,
        month: monthYear,
        attendance: "حضور",
        liturgy: false,
        preparation: false,
        meeting: false,
        visitation: false,
        confessionDate: "",
        activitiesService: false,
        activitiesDiocese: "",
        tasks: "",
        leaderNotes: ""
    });

    useEffect(() => {
        // 🌟 1. Real-Time Sync with Firebase!
        const docRef = doc(firestore, "ServantAttendance", docId);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setRecord({ ...record, ...snap.data() });
            }
        });
        return () => unsubscribe();
    }, [docId]);

    const handleUpdate = (field, value) => {
        setRecord(prev => {
            const updated = { ...prev, [field]: value };
            if (field === 'attendance' && value !== 'حضور') {
                updated.liturgy = false;
                updated.preparation = false;
                updated.meeting = false;
                updated.visitation = false;
            }
            return updated;
        });
    };

    const handleSave = async () => {
        if (!record.uid || record.uid === "undefined") {
            alert("خطأ: لم يتم العثور على بيانات الخادم. يرجى تسجيل الدخول مرة أخرى.");
            return;
        }

        setIsSaving(true);
        try {
            // 🌟 2. Write to unified Firebase path
            const docRef = doc(firestore, "ServantAttendance", docId);
            
            // Clean undefined values before sending to Firestore
            const cleanRecord = { ...record };
            Object.keys(cleanRecord).forEach(key => {
                if (cleanRecord[key] === undefined) {
                    cleanRecord[key] = "";
                }
            });

            await setDoc(docRef, cleanRecord, { merge: true });
            
            setIsSaving(false);
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                navigate(-1);
            }, 2000);
        } catch (error) {
            console.error("Error saving attendance:", error);
            alert("حدث خطأ أثناء حفظ التسجيل. تأكد من اتصالك بالإنترنت.");
            setIsSaving(false);
        }
    };

    const ToggleCard = ({ label, icon: Icon, field, activeColor = "bg-emerald-500", activeBg = "bg-emerald-500/10", activeBorder = "border-emerald-500/50" }) => {
        const isActive = record[field];
        const isDisabled = record.attendance !== 'حضور' && field !== 'attendance';

        return (
            <button 
                disabled={isDisabled}
                onClick={() => handleUpdate(field, !isActive)}
                className={`w-full p-4 rounded-3xl flex items-center justify-between border-2 transition-all duration-300 relative overflow-hidden group 
                    ${isDisabled ? 'opacity-40 cursor-not-allowed bg-slate-900 border-slate-800' : 
                      isActive ? `${activeBg} ${activeBorder}` : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
            >
                {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] animate-[shimmer_1.5s_infinite]" />
                )}
                
                <div className="flex items-center gap-4 relative z-10">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-300 ${isActive ? activeColor + ' text-white shadow-lg' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'}`}>
                        <Icon size={24} />
                    </div>
                    <span className={`text-lg font-black transition-colors ${isActive ? 'text-white' : 'text-slate-300'}`}>{label}</span>
                </div>
                
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 relative z-10 ${isActive ? `border-transparent ${activeColor} text-white` : 'border-slate-600'}`}>
                    {isActive && <Check size={16} strokeWidth={4} />}
                </div>
            </button>
        );
    };

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-200 pb-24" dir="rtl">
            <header className="bg-slate-900/80 backdrop-blur-xl p-6 sticky top-0 z-50 border-b border-slate-800/50 rounded-b-[2.5rem] shadow-xl">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-all border border-slate-700">
                        <ArrowRight size={24} />
                    </button>
                    <div className="text-center">
                        <h1 className="text-xl font-black text-emerald-400 flex items-center gap-2 justify-center">
                            <Sparkles size={20} /> تسجيلي اليوم
                        </h1>
                        <p className="text-xs font-bold text-slate-400 mt-1">يُسمع فوراً عند الإدارة</p>
                    </div>
                    <div className="w-12" /> {/* Spacer */}
                </div>
            </header>

            <main className="p-4 max-w-md mx-auto mt-6 animate-in slide-in-from-bottom-8 duration-500">
                {/* Greeting Card */}
                <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 rounded-[2.5rem] shadow-2xl border border-indigo-500/20 mb-8 relative overflow-hidden flex items-center justify-between">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                    <div>
                        <h2 className="text-sm font-bold text-indigo-300 mb-1">أهلاً بك يا،</h2>
                        <h1 className="text-2xl font-black text-white">{record.name}</h1>
                    </div>
                    {currentServant.profileImage ? (
                        <img src={currentServant.profileImage} alt={record.name} className="w-16 h-16 rounded-full object-cover border-2 border-indigo-400 shadow-md relative z-10" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-indigo-800 flex items-center justify-center text-indigo-300 relative z-10 border-2 border-indigo-500/30">
                            <span className="text-xl font-bold">{record.name.substring(0, 2)}</span>
                        </div>
                    )}
                </div>

                <div className="text-center mb-4">
                    <span className="inline-block bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm px-4 py-2 rounded-full">
                        تسجيل حضور يوم الجمعة: {displayDate}
                    </span>
                </div>

                {/* Main Attendance Toggle */}
                <div className="mb-8">
                    <button 
                        onClick={() => handleUpdate('attendance', record.attendance === 'حضور' ? 'غياب' : 'حضور')}
                        className={`w-full p-6 rounded-[2.5rem] flex items-center justify-between border-2 transition-all duration-300 shadow-xl
                            ${record.attendance === 'حضور' ? 'bg-gradient-to-l from-emerald-600 to-emerald-800 border-emerald-500/50 shadow-emerald-900/50' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${record.attendance === 'حضور' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                <UserCheck size={28} />
                            </div>
                            <div className="text-right">
                                <span className={`block text-xl font-black transition-colors ${record.attendance === 'حضور' ? 'text-white' : 'text-slate-300'}`}>أنا حاضر اليوم</span>
                                <span className={`text-xs font-bold ${record.attendance === 'حضور' ? 'text-emerald-100' : 'text-slate-500'}`}>متواجد بالخدمة</span>
                            </div>
                        </div>
                        <div className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${record.attendance === 'حضور' ? 'bg-emerald-400' : 'bg-slate-700'}`}>
                            <div className={`w-6 h-6 rounded-full bg-white transition-transform duration-300 shadow-sm ${record.attendance === 'حضور' ? 'translate-x-[-24px]' : 'translate-x-0'}`} />
                        </div>
                    </button>
                    
                    {record.attendance !== 'حضور' && (
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => handleUpdate('attendance', 'غياب')} className={`flex-1 p-3 rounded-2xl text-sm font-black border-2 transition-all ${record.attendance === 'غياب' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>غياب</button>
                            <button onClick={() => handleUpdate('attendance', 'اعتذار')} className={`flex-1 p-3 rounded-2xl text-sm font-black border-2 transition-all ${record.attendance === 'اعتذار' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>اعتذار مسبق</button>
                        </div>
                    )}
                </div>

                {/* Sub Activities */}
                <div className="space-y-4 mb-8">
                    <ToggleCard label="حضرت القداس" icon={Church} field="liturgy" activeColor="bg-blue-500" activeBg="bg-blue-500/10" activeBorder="border-blue-500/50" />
                    <ToggleCard label="حضرت اجتماع الخدمة" icon={BellRing} field="meeting" activeColor="bg-amber-500" activeBg="bg-amber-500/10" activeBorder="border-amber-500/50" />
                    <ToggleCard label="حضرت التحضير" icon={BookOpen} field="preparation" activeColor="bg-purple-500" activeBg="bg-purple-500/10" activeBorder="border-purple-500/50" />
                    <ToggleCard label="شاركت بالافتقاد" icon={MapPin} field="visitation" activeColor="bg-rose-500" activeBg="bg-rose-500/10" activeBorder="border-rose-500/50" />
                </div>

                {/* Eparchy Activities Section */}
                <div className="mb-4 bg-slate-900 p-5 rounded-3xl border border-slate-800">
                    <label className="block text-sm font-black text-slate-300 mb-3">نشاط الايبارشية</label>
                    <textarea 
                        value={record.activitiesDiocese}
                        onChange={e => handleUpdate('activitiesDiocese', e.target.value)}
                        placeholder="أدخل نشاط الايبارشية هنا..."
                        className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                </div>

                {/* Notes Section */}
                <div className="mb-8 bg-slate-900 p-5 rounded-3xl border border-slate-800">
                    <label className="block text-sm font-black text-slate-300 mb-3">المهام / الملاحظات (للإدارة)</label>
                    <textarea 
                        value={record.tasks}
                        onChange={e => handleUpdate('tasks', e.target.value)}
                        placeholder="لو عندك تعليق أو حاجة محتاج الإدارة تعرفها..."
                        className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                </div>

                {/* Submit Button */}
                <button 
                    onClick={handleSave} 
                    disabled={isSaving || showSuccess}
                    className={`w-full py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 transition-all duration-500 shadow-2xl
                        ${showSuccess ? 'bg-green-500 text-white shadow-green-500/50 scale-105' : 
                          'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50 hover:shadow-emerald-600/50 active:scale-95'}`}
                >
                    {isSaving ? (
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : showSuccess ? (
                        <><CheckCircle2 size={24} /> تم الحفظ بنجاح!</>
                    ) : (
                        <><Save size={24} /> حفظ تسجيلي</>
                    )}
                </button>
            </main>
        </div>
    );
}
