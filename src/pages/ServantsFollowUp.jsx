import React, { useState, useEffect, useMemo } from 'react';
import { 
    ArrowRight, 
    ClipboardList, 
    Search, 
    Save, 
    CheckCircle2, 
    Calendar, 
    Users, 
    UserX, 
    UserMinus, 
    BarChart3, 
    Church, 
    BookOpen, 
    HandHelping, 
    Eye,
    TrendingUp,
    Sparkles,
    Award,
    HelpCircle,
    Edit3,
    Printer
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, onSnapshot, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import ServantProfile from '../components/ServantProfile';
import EditServantModal from '../components/EditServantModal';

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const cleanName = (n) => String(n || '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

// 🌟 Requirement #7: Filter out Priests (الآباء الكهنة) from servants meeting roster
const isPriestRecord = (s) => {
    if (!s) return false;
    if (s.role === 'priest' || s.isPriest === true || s.role === 'كاهن' || s.role === 'الاب الكاهن') return true;
    const name = String(s.name || '').trim();
    return name.startsWith('أبونا') || name.startsWith('ابونا') || name.startsWith('القمص') || name.startsWith('القس');
};

export default function ServantsFollowUp() {
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [selectedServantForProfile, setSelectedServantForProfile] = useState(null);
    const [editingServant, setEditingServant] = useState(null);

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

    const getArabicDateText = (dateString) => {
        try {
            const d = new Date(dateString);
            const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const dayName = days[d.getDay()];
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${dayName}، ${dd}/${mm}/${yyyy}`;
        } catch(e) {
            return dateString;
        }
    };

    const getSelectedDate = (date = new Date()) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Helper: get the Saturday→Friday week range around a given date
    const getWeekRange = (dateStr) => {
        const d = new Date(dateStr + 'T12:00:00');
        const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
        // Saturday is day 6. Go back to the most recent Saturday.
        const diffToSaturday = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
        const saturday = new Date(d);
        saturday.setDate(d.getDate() - diffToSaturday);
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(saturday);
            day.setDate(saturday.getDate() + i);
            dates.push(getSelectedDate(day));
        }
        return dates; // [Sat, Sun, Mon, Tue, Wed, Thu, Fri]
    };

    const [weekDate, setWeekDate] = useState(() => getSelectedDate());

    const handleDateChange = (val) => {
        if (!val) return;
        setWeekDate(getSelectedDate(val));
    };

    const weekRange = useMemo(() => getWeekRange(weekDate), [weekDate]);
    const weekLabel = useMemo(() => {
        if (weekRange.length < 7) return '';
        return `${getArabicDateText(weekRange[0])}  ←  ${getArabicDateText(weekRange[6])}`;
    }, [weekRange]);

    const [servantsData, setServantsData] = useState([]);
    const [weeklyRecords, setWeeklyRecords] = useState([]);
    const [totalServantCount, setTotalServantCount] = useState(0);
    const [profileUpdateCount, setProfileUpdateCount] = useState(0);

    // 🔄 Live Listener: Re-sync servant roster when a profile is updated anywhere
    useEffect(() => {
        const handleUpdate = () => setProfileUpdateCount(c => c + 1);
        window.addEventListener('servant-profile-updated', handleUpdate);
        window.addEventListener('storage', handleUpdate);
        return () => {
            window.removeEventListener('servant-profile-updated', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
        };
    }, []);
    
    // 🌟 1. Fetch Servants & Listen to Attendance in Real-Time
    useEffect(() => {
        let unsubscribe = () => {};
        let unsubWeekly = () => {};

        const fetchAndListen = async () => {
            let baseServants = [];
            const aliasMap = {}; // Maps docIds/self-check-in uids to servant phone/id

            try {
                // 1. Authoritative church roster: System/mainConfig
                const configSnap = await getDoc(doc(firestore, 'System', 'mainConfig'));
                if (configSnap.exists() && Array.isArray(configSnap.data().servants) && configSnap.data().servants.length > 0) {
                    baseServants = configSnap.data().servants;
                } else {
                    // Fallback only if mainConfig has no servants
                    const servantsSnap = await getDocs(collection(firestore, "servants"));
                    const seen = new Set();
                    servantsSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        const p = cleanPhone(d.phone) || docSnap.id;
                        if (!seen.has(p)) {
                            seen.add(p);
                            baseServants.push({ ...d, uid: docSnap.id, id: docSnap.id });
                        }
                    });
                }

                // 2. Fetch servants collection to map docIds/self-check-in uids to canonical servant profiles
                try {
                    const servantsSnap = await getDocs(collection(firestore, "servants"));
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
            } catch (err) {
                console.error("Error fetching base servants:", err);
            }

            // Exclude deleted servants if appSettings exists in localStorage
            try {
                const appSettingsStr = localStorage.getItem('appSettings');
                if (appSettingsStr) {
                    const appSettings = JSON.parse(appSettingsStr);
                    const activeServants = appSettings.servants || [];
                    if (activeServants.length > 0) {
                        baseServants = baseServants.filter(s => 
                            activeServants.some(active => 
                                String(active.id) === String(s.id) || 
                                (active.phone && s.phone && cleanPhone(active.phone) === cleanPhone(s.phone)) || 
                                active.name === s.name
                            )
                        );
                    }
                }
            } catch (err) {
                console.error("Error filtering active servants:", err);
            }

            // 🚨 Requirement #7: Strictly exclude Priests (الآباء الكهنة) from servants meeting roster
            baseServants = baseServants.filter(s => !isPriestRecord(s));

            setTotalServantCount(baseServants.length);

            // Prepare base servants map with strictly EMPTY attendance by default (NO "حضور" assumption!)
            const servantsMap = {};
            baseServants.forEach(s => {
                const sId = String(s.id || s.uid || s.phone);
                servantsMap[sId] = {
                    id: sId,
                    uid: s.uid || sId,
                    phone: s.phone ? String(s.phone).trim() : "",
                    name: s.name,
                    role: s.role || 'خادم',
                    assignedOsra: s.assignedOsra || s.osraName || '',
                    syncKey: s.syncKey || '',
                    birthDate: s.birthDate || s.birthdate || '',
                    confessionFather: s.confessionFather || s.fatherConfessor || '',
                    osraName: s.osraName || s.assignedOsra || s.syncKey || "غير محدد",
                    weekDate,
                    month: weekDate.substring(0, 7),
                    attendance: "", // 🚨 STRICT: NO default "حضور" assumption! Empty by default.
                    excuseNote: "",
                    hasExplicitRecord: false,
                    liturgy: false, 
                    preparation: false, 
                    meeting: false, 
                    visitation: false,
                    confessionDate: "", 
                    activitiesService: false, 
                    activitiesDiocese: "", 
                    tasks: "", 
                    leaderNotes: "",
                    profileImage: s.profileImage || s.photoURL || s.profilePic || ""
                };
            });

            // 🌟 Listen to attendance data for the selected day in real-time
            const q = query(collection(firestore, "ServantAttendance"), where("weekDate", "==", weekDate));
            
            unsubscribe = onSnapshot(q, (snapshot) => {
                const currentData = {};
                Object.keys(servantsMap).forEach(k => {
                    currentData[k] = { ...servantsMap[k] };
                });

                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (!data) return;

                    const docIdSuffix = docSnap.id.includes('_') ? docSnap.id.split('_').slice(1).join('_') : docSnap.id;
                    const cleanDPhone = cleanPhone(data.phone || data.uid || docIdSuffix);
                    const cleanDName = cleanName(data.name);
                    const aliasPhone = aliasMap[data.uid] || aliasMap[docIdSuffix];

                    const matchedId = Object.keys(currentData).find(sId => {
                        const s = currentData[sId];
                        if (s.uid && (data.uid === s.uid || docIdSuffix === s.uid)) return true;
                        if (s.id && (String(data.id) === String(s.id) || String(data.uid) === String(s.id))) return true;
                        const sPhone = cleanPhone(s.phone);
                        if (sPhone && (cleanDPhone === sPhone || (aliasPhone && sPhone === aliasPhone))) return true;
                        if (s.name && data.name && cleanName(s.name) === cleanDName) return true;
                        return false;
                    });

                    if (matchedId) {
                        const isExplicit = !!(data.attendance && ['حضور', 'غياب', 'اعتذار'].includes(data.attendance));
                        currentData[matchedId] = { 
                            ...currentData[matchedId], 
                            ...data,
                            id: matchedId,
                            attendance: isExplicit ? data.attendance : "",
                            excuseNote: data.excuseNote || "",
                            hasExplicitRecord: isExplicit
                        };
                    }
                });

                setServantsData(Object.values(currentData));
            });

            // 🌟 Listen to weekly records in real-time across the whole Sat→Fri range
            try {
                const weekQ = query(
                    collection(firestore, "ServantAttendance"),
                    where("weekDate", "in", weekRange)
                );
                unsubWeekly = onSnapshot(weekQ, (snapshot) => {
                    const records = [];
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        // Strict check: only count documents with an explicit status
                        if (data && data.weekDate && ['حضور', 'غياب', 'اعتذار'].includes(data.attendance)) {
                            records.push({ ...data, docId: docSnap.id });
                        }
                    });
                    setWeeklyRecords(records);
                }, (err) => {
                    console.warn("[ServantsFollowUp] Weekly stats listener error:", err);
                });
            } catch (err) {
                console.warn("[ServantsFollowUp] Setup weekly listener error:", err);
            }
        };

        fetchAndListen();
        return () => {
            unsubscribe();
            unsubWeekly();
        };
    }, [weekDate, profileUpdateCount]);

    const handleUpdate = async (id, field, value) => {
        // Optimistic UI update for current day
        const updatedServants = servantsData.map(s => {
            if (s.id === id) {
                const updated = { ...s, [field]: value };
                if (field === 'attendance') {
                    const isExplicit = !!(value && ['حضور', 'غياب', 'اعتذار'].includes(value));
                    updated.hasExplicitRecord = isExplicit;
                    if (value !== 'حضور') {
                        updated.liturgy = false;
                        updated.preparation = false;
                        updated.meeting = false;
                        updated.visitation = false;
                    }
                    if (value !== 'اعتذار') {
                        updated.excuseNote = '';
                    }
                }
                return updated;
            }
            return s;
        });
        setServantsData(updatedServants);

        const target = updatedServants.find(s => s.id === id);
        if (!target) return;

        // Optimistic update for weekly records so stats cards reflect changes instantly
        const recordUid = target.uid || target.phone || target.id;
        const docId = `${weekDate}_${recordUid}`;

        setWeeklyRecords(prev => {
            const filtered = prev.filter(r => !(r.docId === docId || (r.uid === recordUid && r.weekDate === target.weekDate)));
            if (target.hasExplicitRecord) {
                return [...filtered, { ...target, uid: recordUid, docId }];
            }
            return filtered;
        });

        // Instant save / delete to Firebase
        try {
            if (field === 'attendance' && !target.hasExplicitRecord) {
                // If reset to unrecorded / empty, delete document from ServantAttendance
                await deleteDoc(doc(firestore, "ServantAttendance", docId));
            } else if (target.hasExplicitRecord) {
                const statusVal = target.attendance === 'حضور' ? 'present' : target.attendance === 'اعتذار' ? 'excused' : target.attendance === 'غياب' ? 'absent' : target.attendance;
                await setDoc(doc(firestore, "ServantAttendance", docId), {
                    id: target.id,
                    uid: recordUid,
                    phone: target.phone || "",
                    name: target.name,
                    osraName: target.osraName,
                    weekDate,
                    month: weekDate.substring(0, 7),
                    attendance: target.attendance,
                    status: statusVal,
                    excuseNote: target.excuseNote || "",
                    liturgy: target.liturgy || false,
                    preparation: target.preparation || false,
                    meeting: target.meeting || false,
                    visitation: target.visitation || false,
                    confessionDate: target.confessionDate || "",
                    activitiesService: target.activitiesService || false,
                    activitiesDiocese: target.activitiesDiocese || "",
                    tasks: target.tasks || "",
                    leaderNotes: target.leaderNotes || "",
                    profileImage: target.profileImage || ""
                }, { merge: true });
            }
        } catch (err) {
            console.error("Error updating firebase:", err);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            let savedCount = 0;
            for (const s of servantsData) {
                if (s.hasExplicitRecord) {
                    const recordUid = s.uid || s.phone || s.id;
                    const docId = `${weekDate}_${recordUid}`;
                    const statusVal = s.attendance === 'حضور' ? 'present' : s.attendance === 'اعتذار' ? 'excused' : s.attendance === 'غياب' ? 'absent' : s.attendance;
                    await setDoc(doc(firestore, "ServantAttendance", docId), {
                        id: s.id,
                        uid: recordUid,
                        phone: s.phone || "",
                        name: s.name,
                        osraName: s.osraName,
                        weekDate,
                        month: weekDate.substring(0, 7),
                        attendance: s.attendance,
                        status: statusVal,
                        excuseNote: s.excuseNote || "",
                        liturgy: s.liturgy || false,
                        preparation: s.preparation || false,
                        meeting: s.meeting || false,
                        visitation: s.visitation || false,
                        confessionDate: s.confessionDate || "",
                        activitiesService: s.activitiesService || false,
                        activitiesDiocese: s.activitiesDiocese || "",
                        tasks: s.tasks || "",
                        leaderNotes: s.leaderNotes || "",
                        profileImage: s.profileImage || ""
                    }, { merge: true });
                    savedCount++;
                }
            }
            alert(`تم حفظ ${savedCount} تقييم بنجاح للسحابة!`);
        } catch (err) {
            console.error("Error saving evaluations:", err);
            alert("حدث خطأ أثناء حفظ التقييمات");
        } finally {
            setIsSaving(false);
        }
    };

    const filteredServants = servantsData.filter(s => s.name.includes(search));

    // ────────────────────────────────────────────────
    // 📅 Selected Day Quick Breakdown
    // ────────────────────────────────────────────────
    const dayStats = useMemo(() => {
        let present = 0;
        let excused = 0;
        let absent = 0;
        let unrecorded = 0;

        servantsData.forEach(s => {
            if (s.attendance === 'حضور') present++;
            else if (s.attendance === 'اعتذار') excused++;
            else if (s.attendance === 'غياب') absent++;
            else unrecorded++;
        });

        return { present, excused, absent, unrecorded, total: servantsData.length };
    }, [servantsData]);

    // ────────────────────────────────────────────────
    // 📊 Comprehensive Weekly Stats Computation (Strict Verification)
    // ────────────────────────────────────────────────
    const weeklyStats = useMemo(() => {
        const findServantId = (rec) => {
            const docIdSuffix = rec.docId && rec.docId.includes('_') ? rec.docId.split('_').slice(1).join('_') : rec.docId;
            const recPhone = cleanPhone(rec.phone || rec.uid || docIdSuffix);
            const recName = cleanName(rec.name);

            for (const s of servantsData) {
                if (s.uid && (rec.uid === s.uid || docIdSuffix === s.uid)) return s.id;
                if (s.id && (String(rec.id) === String(s.id) || String(rec.uid) === String(s.id))) return s.id;
                const sPhone = cleanPhone(s.phone);
                if (sPhone && (recPhone === sPhone || recPhone.endsWith(sPhone) || sPhone.endsWith(recPhone))) return s.id;
                if (s.name && rec.name && cleanName(s.name) === recName) return s.id;
            }
            return null;
        };

        // Key: `${weekDate}_${canonicalServantId}` -> record
        const recordMap = new Map();

        // 1. Add records from Firestore weekly listener (already verified explicit)
        weeklyRecords.forEach(r => {
            if (r.weekDate && ['حضور', 'غياب', 'اعتذار'].includes(r.attendance)) {
                const servantId = findServantId(r);
                if (servantId) {
                    recordMap.set(`${r.weekDate}_${servantId}`, { ...r, canonicalId: servantId });
                }
            }
        });

        // 2. Overlay live servantsData for the currently selected weekDate ONLY if explicit
        servantsData.forEach(s => {
            if (s.weekDate) {
                const key = `${s.weekDate}_${s.id}`;
                if (s.hasExplicitRecord && ['حضور', 'غياب', 'اعتذار'].includes(s.attendance)) {
                    recordMap.set(key, { ...s, canonicalId: s.id });
                } else {
                    recordMap.delete(key);
                }
            }
        });

        const explicitRecords = Array.from(recordMap.values());

        // Group explicit records strictly by canonical servant id
        const servantMap = new Map();
        explicitRecords.forEach(r => {
            if (!servantMap.has(r.canonicalId)) {
                servantMap.set(r.canonicalId, []);
            }
            servantMap.get(r.canonicalId).push(r);
        });

        // Categorize each unique servant strictly across the week:
        const uniquePresentServants = new Set();
        const uniqueExcusedServants = new Set();
        const uniqueAbsentServants = new Set();

        servantsData.forEach(s => {
            const records = servantMap.get(s.id) || [];
            if (records.length === 0) return; // Unrecorded across the week

            const hasPresent = records.some(r => r.attendance === 'حضور');
            const hasExcused = records.some(r => r.attendance === 'اعتذار');
            const hasAbsent = records.some(r => r.attendance === 'غياب');

            if (hasPresent) {
                uniquePresentServants.add(s.id);
            } else if (hasExcused) {
                uniqueExcusedServants.add(s.id);
            } else if (hasAbsent) {
                uniqueAbsentServants.add(s.id);
            }
        });

        // Unrecorded servants: church servants with ZERO explicit records anywhere this week
        const recordedUniqueTotal = uniquePresentServants.size + uniqueExcusedServants.size + uniqueAbsentServants.size;
        const totalServants = servantsData.length;
        const unrecordedCount = Math.max(0, totalServants - recordedUniqueTotal);

        // Total log counts across all sessions/days
        const totalPresentRecords = explicitRecords.filter(r => r.attendance === 'حضور').length;
        const totalExcusedRecords = explicitRecords.filter(r => r.attendance === 'اعتذار').length;
        const totalAbsentRecords = explicitRecords.filter(r => r.attendance === 'غياب').length;
        const totalRecords = explicitRecords.length;

        // Activities & Meetings breakdown (from explicit records only)
        const liturgyCount = explicitRecords.filter(r => r.liturgy === true).length;
        const preparationCount = explicitRecords.filter(r => r.preparation === true).length;
        const meetingCount = explicitRecords.filter(r => r.meeting === true).length;
        const visitationCount = explicitRecords.filter(r => r.visitation === true).length;
        const activitiesServiceCount = explicitRecords.filter(r => r.activitiesService === true).length;
        const activitiesDioceseCount = explicitRecords.filter(r => r.activitiesDiocese && String(r.activitiesDiocese).trim() !== '').length;

        const totalActivityEngagements = liturgyCount + preparationCount + meetingCount + visitationCount + activitiesServiceCount + activitiesDioceseCount;
        const uniqueActivityServants = new Set(
            explicitRecords
                .filter(r => r.liturgy || r.preparation || r.meeting || r.visitation || r.activitiesService || (r.activitiesDiocese && String(r.activitiesDiocese).trim() !== ''))
                .map(r => r.canonicalId)
        );

        const uniqueDays = new Set(explicitRecords.map(r => r.weekDate).filter(Boolean));
        const daysWithData = uniqueDays.size;

        // Attendance Rate strictly out of total church servants
        const rate = totalServants > 0 ? Math.round((uniquePresentServants.size / totalServants) * 100) : 0;
        const recordedRate = recordedUniqueTotal > 0 ? Math.round((uniquePresentServants.size / recordedUniqueTotal) * 100) : 0;

        return {
            totalRecords,
            totalPresentRecords,
            totalExcusedRecords,
            totalAbsentRecords,
            uniquePresentCount: uniquePresentServants.size,
            uniqueExcusedCount: uniqueExcusedServants.size,
            uniqueAbsentCount: uniqueAbsentServants.size,
            unrecordedCount,
            recordedUniqueTotal,
            totalServants,
            liturgyCount,
            preparationCount,
            meetingCount,
            visitationCount,
            activitiesServiceCount,
            activitiesDioceseCount,
            totalActivityEngagements,
            uniqueActivityServantsCount: uniqueActivityServants.size,
            daysWithData,
            rate,
            recordedRate
        };
    }, [weeklyRecords, servantsData]);

    return (
        <div className="min-h-screen bg-slate-900 font-sans pb-24 text-slate-200" dir="rtl">
            {/* Header Bar */}
            <header className="bg-slate-950 p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem] border-b border-slate-800">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="w-10 h-10 bg-slate-800 text-slate-300 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0" title="رجوع">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black text-emerald-400 flex items-center gap-2">
                                <ClipboardList size={20} /> متابعة اجتماع الخدام
                            </h1>
                            <p className="text-xs font-bold text-slate-400">
                                تسجيل ومتابعة حضور اجتماع الخدام الأسبوعي
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => navigate('/servants-report')} 
                            className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-md cursor-pointer"
                            title="فتح التقرير الشامل لاجتماع الخدام"
                        >
                            <Printer size={16} />
                            <span className="hidden sm:inline">تقرير الخدام</span>
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-2 shadow-md cursor-pointer">
                            {isSaving ? "جاري الحفظ..." : <><Save size={16} /> حفظ التقييم</>}
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-7xl mx-auto mt-6">
                <div className="bg-slate-800 p-6 rounded-[2.5rem] shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
                    {/* Filters Row */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                        <div className="relative w-full md:w-1/3">
                            <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="date" 
                                value={weekDate}
                                onChange={e => handleDateChange(e.target.value)}
                                className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-sm focus:border-emerald-500 outline-none text-white transition-all cursor-pointer"
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

                    <div className="mb-6 bg-slate-900 border border-slate-700/80 p-4 rounded-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                            <span className="text-base">📅</span>
                            <span>اجتماع الخدام: <strong className="text-white">{getArabicDateText(weekDate)}</strong></span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-xl">
                                حضور: {dayStats.present}
                            </span>
                            <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-3 py-1 rounded-xl">
                                اعتذار: {dayStats.excused}
                            </span>
                            <span className="bg-rose-500/20 text-rose-400 border border-rose-500/40 px-3 py-1 rounded-xl">
                                غياب: {dayStats.absent}
                            </span>
                            <span className="bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1 rounded-xl">
                                لم يُسجل: {dayStats.unrecorded}
                            </span>
                        </div>
                    </div>

                    {/* Desktop Table View */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/50 hidden md:block">
                        <table className="w-full min-w-[1200px] text-sm text-right">
                            <thead className="bg-slate-900 text-slate-300 font-black border-b border-slate-700">
                                <tr>
                                    <th className="p-4 text-center border-r border-slate-700 w-12">الصورة</th>
                                    <th className="p-4 min-w-[170px]">اسم الخادم</th>
                                    <th className="p-4 min-w-[120px]">الأسرة</th>
                                    <th className="p-4 text-center min-w-[150px]">حضور اجتماع الخدام</th>
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
                                            <button
                                                type="button"
                                                onClick={() => setSelectedServantForProfile(s)}
                                                className="cursor-pointer hover:opacity-80 transition-opacity mx-auto block group"
                                                title="عرض وتعديل بروفايل الخادم"
                                            >
                                                {s.profileImage ? (
                                                    <img 
                                                        src={s.profileImage} 
                                                        alt={s.name} 
                                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                        className="w-10 h-10 rounded-full mx-auto object-cover border-2 border-slate-600 group-hover:border-emerald-400 transition-colors" 
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full mx-auto bg-slate-700 flex items-center justify-center text-slate-400 group-hover:border group-hover:border-emerald-400 transition-colors">
                                                        <span className="text-xs">{s.name.substring(0, 2)}</span>
                                                    </div>
                                                )}
                                            </button>
                                        </td>
                                        <td className="p-4 font-black text-emerald-400">
                                            <div className="flex items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedServantForProfile(s)}
                                                    className="text-right hover:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1.5 group"
                                                    title="عرض بروفايل الخادم"
                                                >
                                                    <span>{s.name}</span>
                                                    <Eye size={14} className="opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingServant(s)}
                                                    className="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
                                                    title="تعديل بيانات الخادم"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                                                {getOsraName(s.osraName)}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <select 
                                                value={s.attendance || ''} 
                                                onChange={e => handleUpdate(s.id, 'attendance', e.target.value)}
                                                className={`w-full p-2 rounded-lg text-xs font-black text-center outline-none border transition-colors ${
                                                    s.attendance === 'حضور' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' 
                                                        : s.attendance === 'غياب' 
                                                            ? 'bg-red-500/10 text-red-400 border-red-500/30 font-bold' 
                                                            : s.attendance === 'اعتذار' 
                                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold' 
                                                                : 'bg-slate-900/90 text-slate-400 border-slate-700 hover:border-slate-500'
                                                }`}
                                            >
                                                <option value="" className="bg-slate-900 text-slate-400">-- لم يُسجل --</option>
                                                <option value="حضور" className="bg-slate-800 text-emerald-400">حاضر</option>
                                                <option value="اعتذار" className="bg-slate-800 text-amber-400">معتذر</option>
                                                <option value="غياب" className="bg-slate-800 text-red-400">غائب</option>
                                            </select>
                                            {s.attendance === 'اعتذار' && (
                                                <input 
                                                    type="text" 
                                                    placeholder="سبب الاعتذار (اختياري)..." 
                                                    value={s.excuseNote || ''} 
                                                    onChange={e => handleUpdate(s.id, 'excuseNote', e.target.value)} 
                                                    className="mt-1.5 w-full bg-slate-950 border border-amber-500/40 text-amber-300 placeholder-amber-500/50 rounded-lg p-1.5 text-[11px] font-bold outline-none focus:border-amber-400"
                                                />
                                            )}
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
                                            <input type="date" value={s.confessionDate || ''} onChange={e => handleUpdate(s.id, 'confessionDate', e.target.value)} className="bg-slate-800 border border-slate-600 text-slate-300 rounded-lg p-2 text-xs font-bold w-full outline-none focus:border-emerald-500" />
                                        </td>
                                        <td className="p-4 text-center border-r border-slate-700 bg-slate-800/30">
                                            <input type="checkbox" checked={s.activitiesService} onChange={e => handleUpdate(s.id, 'activitiesService', e.target.checked)} className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 cursor-pointer accent-blue-500" />
                                        </td>
                                        <td className="p-4 text-center border-l border-slate-700 bg-slate-800/30">
                                            <textarea value={s.activitiesDiocese || ''} onChange={e => handleUpdate(s.id, 'activitiesDiocese', e.target.value)} placeholder="نشاط ايبارشية..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-800 border border-slate-600 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                                        </td>
                                        <td className="p-4">
                                            <textarea value={s.tasks || ''} onChange={e => handleUpdate(s.id, 'tasks', e.target.value)} placeholder="ملاحظات الخادم..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-800 border border-slate-600 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                                        </td>
                                        <td className="p-4">
                                            <textarea value={s.leaderNotes || ''} onChange={e => handleUpdate(s.id, 'leaderNotes', e.target.value)} placeholder="ملاحظات أمين الخدمة..." className="resize-y min-h-[60px] min-w-[120px] p-2 w-full rounded bg-slate-700 border border-amber-600/30 text-xs text-white placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" />
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
                                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3 gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedServantForProfile(s)}
                                            className="font-black text-emerald-400 text-base hover:underline text-right flex items-center gap-1.5"
                                            title="عرض بروفايل الخادم"
                                        >
                                            <span>{s.name}</span>
                                            <Eye size={15} className="text-slate-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditingServant(s)}
                                            className="text-amber-400 hover:text-amber-300 p-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                                            title="تعديل بيانات الخادم"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <select 
                                            value={s.attendance || ''} 
                                            onChange={e => handleUpdate(s.id, 'attendance', e.target.value)}
                                            className={`p-1.5 rounded-lg text-xs font-black text-center outline-none border transition-colors ${
                                                s.attendance === 'حضور' 
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold' 
                                                    : s.attendance === 'غياب' 
                                                        ? 'bg-red-500/10 text-red-400 border-red-500/30 font-bold' 
                                                        : s.attendance === 'اعتذار' 
                                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold' 
                                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                            }`}
                                        >
                                            <option value="" className="bg-slate-800 text-slate-400">-- لم يُسجل --</option>
                                            <option value="حضور" className="bg-slate-800 text-emerald-400">حاضر</option>
                                            <option value="اعتذار" className="bg-slate-800 text-amber-400">معتذر</option>
                                            <option value="غياب" className="bg-slate-800 text-red-400">غائب</option>
                                        </select>
                                        {s.attendance === 'اعتذار' && (
                                            <input 
                                                type="text" 
                                                placeholder="سبب الاعتذار..." 
                                                value={s.excuseNote || ''} 
                                                onChange={e => handleUpdate(s.id, 'excuseNote', e.target.value)} 
                                                className="w-full bg-slate-950 border border-amber-500/40 text-amber-300 placeholder-amber-500/50 rounded-lg p-1 text-[10px] font-bold outline-none"
                                            />
                                        )}
                                    </div>
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
                                    <input type="date" value={s.confessionDate || ''} onChange={e => handleUpdate(s.id, 'confessionDate', e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm outline-none" />
                                </div>
                                <div className="mb-4 bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                                    <label className="block text-xs text-slate-400 mb-2 border-b border-slate-700 pb-1">مشارك بالأنشطة</label>
                                    <div className="flex flex-col gap-3 mt-2">
                                        <label className="flex items-center gap-2 text-sm text-slate-300 flex-1">
                                            <input type="checkbox" checked={s.activitiesService} onChange={e => handleUpdate(s.id, 'activitiesService', e.target.checked)} className="w-5 h-5 accent-blue-500" /> الخدمة
                                        </label>
                                        <div className="flex-1">
                                            <textarea value={s.activitiesDiocese || ''} onChange={e => handleUpdate(s.id, 'activitiesDiocese', e.target.value)} placeholder="نشاط الايبارشية..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-800 border border-slate-700 text-sm text-white outline-none focus:border-purple-500" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">المهام / ملاحظات الخادم</label>
                                    <textarea value={s.tasks || ''} onChange={e => handleUpdate(s.id, 'tasks', e.target.value)} placeholder="اكتب ملاحظة..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-800 border border-slate-700 text-sm text-white outline-none mb-3" />
                                </div>
                                <div className="bg-slate-800/80 p-3 rounded-xl border border-amber-500/20">
                                    <label className="block text-xs text-amber-500/80 font-bold mb-1">ملاحظات أمين الخدمة</label>
                                    <textarea value={s.leaderNotes || ''} onChange={e => handleUpdate(s.id, 'leaderNotes', e.target.value)} placeholder="ملاحظات خاصة بك كأمين أسرة..." className="resize-y min-h-[60px] p-2 w-full rounded bg-slate-900 border border-amber-500/30 text-sm text-amber-100 placeholder-slate-500 outline-none focus:border-amber-500" />
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

                {/* ────────────────────────────────────────────────────────── */}
                {/* 📊 Comprehensive Weekly Attendance & Activity Statistics   */}
                {/* ────────────────────────────────────────────────────────── */}
                <div className="mt-8 bg-slate-900/90 backdrop-blur-xl p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-slate-700/80 relative overflow-hidden animate-in fade-in slide-in-from-bottom-6">
                    {/* Glowing Neo-Brutalism Ambient Effects */}
                    <div className="absolute -top-24 -left-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    {/* Section Header */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/30 to-emerald-700/10 rounded-2xl flex items-center justify-center border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                <BarChart3 size={24} className="text-emerald-400" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg md:text-xl font-black text-white">إحصائيات الحضور والأنشطة الأسبوعية</h2>
                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                        <Sparkles size={11} /> تقرير موثق بدقة
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-1.5">
                                    <Calendar size={13} className="text-emerald-400" />
                                    نطاق الأسبوع: <span className="text-slate-300 font-black">{weekLabel}</span>
                                </p>
                            </div>
                        </div>

                        {/* Top Meta Badges */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                            <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-slate-400 shadow-inner">
                                إجمالي الخدام: <span className="text-emerald-400 font-black">{totalServantCount}</span>
                            </div>
                            <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-slate-400 shadow-inner">
                                أيام مسجلة: <span className="text-amber-400 font-black">{weeklyStats.daysWithData}</span>
                            </div>
                            <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-slate-400 shadow-inner">
                                الخدام المسجلون: <span className="text-indigo-400 font-black">{weeklyStats.recordedUniqueTotal}</span> / {totalServantCount}
                            </div>
                        </div>
                    </div>

                    {/* ── Row 1: Strict Status Breakdown Counters ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6 relative z-10">
                        {/* 1. Total Present (Green Badge) */}
                        <div className="bg-slate-950/70 border-2 border-emerald-500/30 hover:border-emerald-500/60 rounded-3xl p-4.5 transition-all shadow-[0_0_25px_rgba(16,185,129,0.08)] group hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                    <CheckCircle2 size={13} className="text-emerald-400" />
                                    حاضر (حضور مؤكد)
                                </span>
                                <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                </div>
                            </div>
                            <div className="text-3xl md:text-4xl font-black text-emerald-400 tracking-tight">
                                {weeklyStats.uniquePresentCount}
                            </div>
                            <div className="text-xs font-black text-slate-200 mt-1.5">إجمالي الخدام الحاضرين</div>
                            <div className="mt-2 text-[10px] font-bold text-emerald-400/90 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 inline-block">
                                {weeklyStats.uniquePresentCount} من أصل {totalServantCount} خادم ({weeklyStats.totalPresentRecords} تسجيل)
                            </div>
                        </div>

                        {/* 2. Total Excused (Yellow/Orange Badge) */}
                        <div className="bg-slate-950/70 border-2 border-amber-500/30 hover:border-amber-500/60 rounded-3xl p-4.5 transition-all shadow-[0_0_25px_rgba(245,158,11,0.08)] group hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                    <UserMinus size={13} className="text-amber-400" />
                                    معتذر (اعتذار مسبق)
                                </span>
                                <div className="w-8 h-8 bg-amber-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <UserMinus size={16} className="text-amber-400" />
                                </div>
                            </div>
                            <div className="text-3xl md:text-4xl font-black text-amber-400 tracking-tight">
                                {weeklyStats.uniqueExcusedCount}
                            </div>
                            <div className="text-xs font-black text-slate-200 mt-1.5">إجمالي المعتذرين</div>
                            <div className="mt-2 text-[10px] font-bold text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 inline-block">
                                {weeklyStats.uniqueExcusedCount} خادم قدّم اعتذاراً موثقاً
                            </div>
                        </div>

                        {/* 3. Total Absent (Red Badge) */}
                        <div className="bg-slate-950/70 border-2 border-rose-500/30 hover:border-rose-500/60 rounded-3xl p-4.5 transition-all shadow-[0_0_25px_rgba(244,63,94,0.08)] group hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                    <UserX size={13} className="text-rose-400" />
                                    غائب (غياب صريح)
                                </span>
                                <div className="w-8 h-8 bg-rose-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <UserX size={16} className="text-rose-400" />
                                </div>
                            </div>
                            <div className="text-3xl md:text-4xl font-black text-rose-400 tracking-tight">
                                {weeklyStats.uniqueAbsentCount}
                            </div>
                            <div className="text-xs font-black text-slate-200 mt-1.5">إجمالي الغائبين</div>
                            <div className="mt-2 text-[10px] font-bold text-rose-400/90 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 inline-block">
                                {weeklyStats.uniqueAbsentCount} خادم مسجل غياب
                            </div>
                        </div>

                        {/* 4. Unrecorded / Pending (Neutral Slate Badge) */}
                        <div className="bg-slate-950/70 border-2 border-slate-700/50 hover:border-slate-500/60 rounded-3xl p-4.5 transition-all shadow-[0_0_20px_rgba(100,116,139,0.06)] group hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                    <HelpCircle size={13} className="text-slate-400" />
                                    لم يُسجل بعد
                                </span>
                                <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <HelpCircle size={16} className="text-slate-400" />
                                </div>
                            </div>
                            <div className="text-3xl md:text-4xl font-black text-slate-300 tracking-tight">
                                {weeklyStats.unrecordedCount}
                            </div>
                            <div className="text-xs font-black text-slate-300 mt-1.5">بدون تسجيل أسبوعي</div>
                            <div className="mt-2 text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 inline-block">
                                غير محسوبين في الحضور
                            </div>
                        </div>

                        {/* 5. Weekly Attendance Rate (Progress & Badge) */}
                        <div className="bg-slate-950/70 border-2 border-indigo-500/30 hover:border-indigo-500/60 rounded-3xl p-4.5 transition-all shadow-[0_0_25px_rgba(99,102,241,0.08)] group hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className={`text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 border shadow-sm ${
                                    weeklyStats.rate >= 75 
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                                        : weeklyStats.rate >= 50 
                                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                }`}>
                                    <TrendingUp size={13} />
                                    {weeklyStats.rate >= 75 ? 'ممتاز 🌟' : weeklyStats.rate >= 50 ? 'متوسط ⚡' : 'متابعة ⚠️'}
                                </span>
                                <div className="w-8 h-8 bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <BarChart3 size={16} className="text-indigo-400" />
                                </div>
                            </div>
                            <div className={`text-3xl md:text-4xl font-black tracking-tight ${
                                weeklyStats.rate >= 75 ? 'text-emerald-400' : weeklyStats.rate >= 50 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                                {weeklyStats.rate}%
                            </div>
                            <div className="text-xs font-black text-slate-200 mt-1.5">نسبة الحضور الأسبوعية</div>
                            {/* Visual Progress Bar */}
                            <div className="mt-2.5 h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                                <div 
                                    className={`h-full rounded-full transition-all duration-700 ${
                                        weeklyStats.rate >= 75 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : weeklyStats.rate >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-rose-500 to-red-400'
                                    }`}
                                    style={{ width: `${weeklyStats.rate}%` }}
                                ></div>
                            </div>
                            <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-400">
                                <span>حضور: {weeklyStats.uniquePresentCount}</span>
                                <span>إجمالي: {totalServantCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Row 2: Servant Activities & Meetings Counters ── */}
                    <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5 relative z-10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Award size={18} className="text-indigo-400" />
                                <h3 className="text-sm font-black text-slate-200">
                                    مشاركة الخدام في الاجتماعات والأنشطة الأسبوعية
                                </h3>
                                <span className="text-[10px] font-bold text-slate-400 hidden sm:inline">(سجلات موثقة للالتزامات الأسبوعية)</span>
                            </div>
                            <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-black px-3 py-1 rounded-xl w-fit">
                                {weeklyStats.totalActivityEngagements} مشاركة إجمالية · {weeklyStats.uniqueActivityServantsCount} خادم مشارك
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {/* 1. Meeting (اجتماع الخدمة) */}
                            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 text-center hover:border-emerald-500/50 transition-all group">
                                <div className="w-9 h-9 mx-auto bg-emerald-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Users size={18} className="text-emerald-400" />
                                </div>
                                <span className="text-2xl font-black text-emerald-400 block">{weeklyStats.meetingCount}</span>
                                <div className="text-xs font-black text-slate-300 mt-1">اجتماع الخدمة</div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">حضور الاجتماع الأسبوعي</p>
                            </div>

                            {/* 2. Visitation (الافتقاد) */}
                            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 text-center hover:border-sky-500/50 transition-all group">
                                <div className="w-9 h-9 mx-auto bg-sky-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Eye size={18} className="text-sky-400" />
                                </div>
                                <span className="text-2xl font-black text-sky-400 block">{weeklyStats.visitationCount}</span>
                                <div className="text-xs font-black text-slate-300 mt-1">مشارك بالافتقاد</div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">افتقاد أولاد وأسر الأسرة</p>
                            </div>

                            {/* 3. Liturgy (القداس الإلهي) */}
                            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 text-center hover:border-purple-500/50 transition-all group">
                                <div className="w-9 h-9 mx-auto bg-purple-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <Church size={18} className="text-purple-400" />
                                </div>
                                <span className="text-2xl font-black text-purple-400 block">{weeklyStats.liturgyCount}</span>
                                <div className="text-xs font-black text-slate-300 mt-1">القداس الإلهي</div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">حضور الذبيحة والمناولة</p>
                            </div>

                            {/* 4. Preparation (التحضير) */}
                            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 text-center hover:border-amber-500/50 transition-all group">
                                <div className="w-9 h-9 mx-auto bg-amber-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <BookOpen size={18} className="text-amber-400" />
                                </div>
                                <span className="text-2xl font-black text-amber-400 block">{weeklyStats.preparationCount}</span>
                                <div className="text-xs font-black text-slate-300 mt-1">التحضير الأسبوعي</div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">تحضير الدروس والأنشطة</p>
                            </div>

                            {/* 5. Activities (أنشطة الخدمة والإيبارشية) */}
                            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 text-center hover:border-blue-500/50 transition-all col-span-2 sm:col-span-1 group">
                                <div className="w-9 h-9 mx-auto bg-blue-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <HandHelping size={18} className="text-blue-400" />
                                </div>
                                <span className="text-2xl font-black text-blue-400 block">
                                    {weeklyStats.activitiesServiceCount + weeklyStats.activitiesDioceseCount}
                                </span>
                                <div className="text-xs font-black text-slate-300 mt-1">أنشطة الخدمة والإيبارشية</div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                    {weeklyStats.activitiesServiceCount} خدمة · {weeklyStats.activitiesDioceseCount} إيبارشية
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </main>

            {/* 🌟 بروفايل الخادم (معاينة إدارية لأبونا / السوبر أدمن) 🌟 */}
            {selectedServantForProfile && (
                <ServantProfile 
                    servantData={selectedServantForProfile}
                    servant={selectedServantForProfile}
                    isOpen={true}
                    onClose={() => setSelectedServantForProfile(null)}
                    isModal={true}
                />
            )}

            {/* 🌟 تعديل بيانات الخادم مباشرة (Requirement #5) 🌟 */}
            {editingServant && (
                <EditServantModal
                    isOpen={!!editingServant}
                    servant={editingServant}
                    onClose={() => setEditingServant(null)}
                    onSaved={(updated) => {
                        setServantsData(prev => prev.map(item => (item.id === updated.id || (item.phone && item.phone === updated.phone)) ? { ...item, ...updated } : item));
                        setEditingServant(null);
                    }}
                />
            )}
        </div>
    );
}
