import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Link } from 'react-router-dom';
import { Search, MapPin, ClipboardList, Navigation, MessageCircleWarning, CheckCircle2, Map, Crosshair, MapPinned, Loader2, AlertTriangle, Mic } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import useAutoSync from '../hooks/useAutoSync';

export default function Visitation() {
    const { triggerAutoSync } = useAutoSync();
    const [activeFilter, setActiveFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    // 🧠 حالة الطفل المحدد
    const [selectedChildId, setSelectedChildId] = useState(null);
    const [isLocating, setIsLocating] = useState(false);

    const today = new Date().toISOString().split('T')[0];

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

    const groupedByZone = filteredChildren.reduce((acc, child) => {
        const zone = child.address && child.address.trim() !== "" ? child.address : 'مناطق غير محددة';
        if (!acc[zone]) acc[zone] = [];
        acc[zone].push(child);
        return acc;
    }, {});

    // ==========================================
    // 📍 وظائف الافتقاد وتحديد رقم الواتساب الذكي
    // ==========================================
    const cleanPhoneNumber = (phone) => {
        let clean = String(phone || "").replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '2' + clean;
        else if (!clean.startsWith('20') && clean.length > 0) clean = '20' + clean;
        return clean;
    };

    // 🌟 الدالة السحرية لتحديد الرقم الصح
    const getTargetPhone = (child) => {
        if (child.whatsappTarget === 'child' && child.childPhone) return child.childPhone;
        if (child.whatsappTarget === 'father' && child.fatherPhone) return child.fatherPhone;
        if (child.whatsappTarget === 'mother' && child.motherPhone) return child.motherPhone;
        return child.childPhone || child.fatherPhone || child.motherPhone || child.phone;
    };

    const getDisplayPhone = (c) => {
        if (c.whatsappTarget === 'child' && c.childPhone) return `📱 ${c.childPhone}`;
        if (c.whatsappTarget === 'father' && c.fatherPhone) return `👨 ${c.fatherPhone}`;
        if (c.whatsappTarget === 'mother' && c.motherPhone) return `👩 ${c.motherPhone}`;
        
        if (c.childPhone) return `📱 ${c.childPhone}`;
        if (c.fatherPhone) return `👨 ${c.fatherPhone}`;
        if (c.motherPhone) return `👩 ${c.motherPhone}`;
        if (c.phone) return `📞 ${c.phone}`;
        return 'لا يوجد تليفون';
    };

    const markAsVisited = async (child) => {
        try {
            const now = new Date().toISOString();
            await db.children.update(child.id, { last_visited: today, isDirty: true, updatedAt: now });
            triggerAutoSync();
            alert("تم الافتقاد بنجاح! ✅");
            setSelectedChildId(null);
        } catch (error) {
            console.error("Error marking as visited:", error);
        }
    };

    const handleSaveGPS = (child) => {
        if (!navigator.geolocation) return alert("متصفحك لا يدعم تحديد الموقع!");
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const now = new Date().toISOString();
            await db.children.update(child.id, { gpsLink: googleMapsUrl, isDirty: true, updatedAt: now });
            triggerAutoSync();
            setIsLocating(false);
            alert("تم حفظ اللوكيشن بنجاح! 📍");
        }, () => {
            setIsLocating(false);
            alert("شغل الـ GPS في موبايلك وادي صلاحية للمتصفح.");
        }, { enableHighAccuracy: true });
    };

    const generateVisitationMsg = (child) => {
        const title = child.gender === 'بنت' ? 'بطلتنا الجميلة' : 'بطلنا الغالي';
        const namePart = child.name ? child.name.split(' ')[0] : '';
        let msg = `أزيك يا ${title} ${namePart ? `(${namePart})` : ''}! 🌟\nعامل إيه؟ افتقدناك جداً وحابين نطمن عليك..`;
        return `https://api.whatsapp.com/send?phone=${cleanPhoneNumber(getTargetPhone(child))}&text=${encodeURIComponent(msg)}`;
    };

    const generateOnMyWayMsg = (child) => {
        const namePart = child.name ? child.name.split(' ')[0] : '';
        let msg = `أزيك يا ${namePart ? `(${namePart})` : 'بطل'}! 🏃‍♂️\nأنا في طريقي ليك دلوقتي عشان أسلم عليك، جاهز؟`;
        return `https://api.whatsapp.com/send?phone=${cleanPhoneNumber(getTargetPhone(child))}&text=${encodeURIComponent(msg)}`;
    };

    return (
        <div className="min-h-screen bg-[#f4f7f6] pb-32 font-sans" dir="rtl">
            <div className="fixed inset-0 pointer-events-none opacity-5" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'#000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}></div>

            <header className="bg-white/90 backdrop-blur-md p-4 shadow-sm mb-6 rounded-b-[2.5rem] relative z-10">
                <div className="max-w-4xl mx-auto">
                    <div className="relative mb-4">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="ابحث عن بطل على الخريطة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pr-10 pl-4 py-3 rounded-full bg-slate-100 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
                    </div>
                    <div className="flex gap-2 justify-center">
                        {[{ id: "all", label: "الكل 🌟" }, { id: "boys", label: "ولاد 👦" }, { id: "girls", label: "بنات 👧" }].map(f => (
                            <button key={f.id} onClick={() => setActiveFilter(f.id)} className={`flex-1 px-4 py-2.5 rounded-full text-xs font-black transition-all ${activeFilter === f.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "bg-slate-100 text-slate-600"}`}>{f.label}</button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="px-4 max-w-2xl mx-auto relative z-10">
                <div className="bg-indigo-600 text-white p-5 rounded-[2.5rem] mb-8 flex items-center gap-4 shadow-xl shadow-indigo-600/20">
                    <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm"><MapPinned size={28} /></div>
                    <div>
                        <h1 className="font-black text-xl">خريطة الافتقاد التفاعلية</h1>
                        <p className="text-xs font-medium text-indigo-100 mt-1">اضغط على البطل لتسجيل الزيارة أو تحديد موقعه 📍</p>
                    </div>
                </div>

                <div className="space-y-10 pl-2">
                    {Object.entries(groupedByZone).map(([zone, zoneChildren], i) => (
                        <div key={i} className="relative border-r-4 border-dashed border-indigo-200 pr-6 pb-4">
                            <div className="absolute -right-3.5 top-0 w-6 h-6 bg-white border-4 border-indigo-500 rounded-full shadow-md"></div>

                            <h3 className="bg-white px-5 py-2.5 rounded-2xl shadow-sm font-black text-indigo-900 text-sm flex w-fit gap-2 mb-5 border border-indigo-50 -mt-2">
                                <MapPin size={18} className="text-indigo-500" /> {zone}
                                <span className="bg-indigo-100 text-indigo-700 px-2 rounded-lg text-[10px] flex items-center">{zoneChildren.length}</span>
                            </h3>

                            <div className="flex flex-wrap gap-4 mb-4 items-start">
                                {zoneChildren.map(child => {
                                    const isDanger = child.streak === 0;
                                    const isSelected = selectedChildId === child.id;
                                    const isVisitedRecently = child.last_visited === today;
                                    const latestNote = child.notes ? child.notes[child.notes.length - 1] : null;

                                    return (
                                        <React.Fragment key={child.id}>
                                            {/* الفقاعة (الدبوس) */}
                                            <div className="relative flex flex-col items-center">
                                                <button
                                                    onClick={() => setSelectedChildId(isSelected ? null : child.id)}
                                                    className={`group flex flex-col items-center transition-all duration-300 ${isSelected ? '-translate-y-2 scale-110' : 'hover:-translate-y-1'}`}
                                                >
                                                    {isDanger && <span className="absolute -top-1 -right-1 flex h-4 w-4 z-10"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white"></span></span>}
                                                    {isVisitedRecently && <span className="absolute -top-1 -left-1 z-10 bg-green-500 text-white rounded-full p-0.5 shadow-sm"><CheckCircle2 size={12} /></span>}

                                                    <div className={`w-14 h-14 rounded-full border-4 ${isSelected ? 'border-indigo-600 shadow-xl shadow-indigo-500/40' : (isVisitedRecently ? 'border-green-400 opacity-70' : 'border-white shadow-md')} overflow-hidden bg-slate-100 flex items-center justify-center text-xl`}>
                                                        {child.profilePic ? <img src={child.profilePic} width="56" height="56" loading="lazy" className="w-full h-full object-cover" alt={child.name} /> : (child.gender === 'بنت' ? '👧' : '👦')}
                                                    </div>
                                                    <div className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-8 ${isSelected ? 'border-t-indigo-600' : (isVisitedRecently ? 'border-t-green-400 opacity-70' : 'border-t-white')}`}></div>

                                                    <span className={`text-[10px] font-black mt-1 px-2.5 py-0.5 rounded-full shadow-sm transition-colors max-w-17.5 truncate ${isSelected ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 group-hover:bg-slate-100'}`}>
                                                        {child.name ? child.name.split(' ')[0] : 'بطل'}
                                                    </span>
                                                </button>
                                            </div>

                                            {/* 🗂️ كارت التفاصيل بعد إزالة المايك */}
                                            {isSelected && (
                                                <div className="w-full basis-full mt-1 mb-2 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="bg-white rounded-4xl p-5 border-2 border-indigo-100 shadow-xl relative overflow-hidden">
                                                        <div className="absolute top-0 right-0 w-full h-1.5 bg-indigo-500"></div>

                                                        <div className="flex justify-between items-start mb-4">
                                                            <div>
                                                                <h4 className="font-black text-lg text-slate-800">{child.name}</h4>
                                                                <p className="text-xs font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                                                                    رقم الواتس: <span dir="ltr">{getDisplayPhone(child)}</span>
                                                                </p>
                                                            </div>
                                                            {child.streak === 0 && <span className="text-[10px] text-red-600 bg-red-50 px-2.5 py-1 rounded-lg font-black border border-red-100 animate-pulse">🚨 خطر تسرب!</span>}
                                                        </div>

                                                        {/* 📍 زرار الـ GPS */}
                                                        <div className="bg-slate-50 p-3 rounded-2xl mb-4 border border-slate-100 flex items-center justify-between">
                                                            <div>
                                                                <span className="text-[10px] font-black text-slate-500 block">الموقع (GPS)</span>
                                                                {child.gpsLink ? (
                                                                    <span className="text-xs font-bold text-green-600 flex items-center gap-1 mt-0.5"><CheckCircle2 size={12} /> اللوكيشن محفوظ</span>
                                                                ) : (
                                                                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5"><AlertTriangle size={12} /> مش محفوظ لسه</span>
                                                                )}
                                                            </div>
                                                            {child.gpsLink ? (
                                                                <a href={child.gpsLink} target="_blank" rel="noreferrer" className="bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-xs font-black hover:bg-blue-100 transition-colors flex items-center gap-1 border border-blue-100">
                                                                    <Map size={14} /> الخريطة
                                                                </a>
                                                            ) : (
                                                                <button onClick={() => handleSaveGPS(child)} aria-label="حفظ الموقع الحالي له" disabled={isLocating} className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-md flex items-center gap-1">
                                                                    {isLocating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />} حفظ المكان
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* الملاحظة السابقة لو موجودة */}
                                                        {latestNote && (
                                                            <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100/50 mb-4">
                                                                <span className="font-black text-amber-700 mb-1 text-[10px] flex items-center gap-1"><ClipboardList size={12} /> أهم المهام (من الزيارة السابقة):</span>
                                                                <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{latestNote.text}</p>
                                                            </div>
                                                        )}

                                                        {/* 🌟 زراير الأكشن (ضفنا زرار للبروفايل عشان المايك) */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                                                            <a href={generateOnMyWayMsg(child)} target="_blank" rel="noreferrer" className="bg-yellow-400 text-yellow-900 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-sm hover:bg-yellow-500 transition-all">
                                                                <Navigation size={14} /> جايلك
                                                            </a>
                                                            <a href={generateVisitationMsg(child)} target="_blank" rel="noreferrer" className="bg-green-500 text-white py-3 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-md hover:bg-green-600 transition-all">
                                                                <MessageCircleWarning size={14} /> رسالة
                                                            </a>
                                                            <button onClick={() => markAsVisited(child)} disabled={isVisitedRecently} className={`py-3 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all ${isVisitedRecently ? 'bg-slate-200 text-slate-500' : 'bg-slate-800 text-white shadow-md hover:bg-slate-900'}`}>
                                                                <CheckCircle2 size={14} /> {isVisitedRecently ? 'تم الافتقاد' : 'تأكيد'}
                                                            </button>
                                                            {/* 🌟 الزرار الجديد اللي هيوديك للمايك الجبار */}
                                                            <Link to={`/profile/${child.id}`} className="bg-purple-100 text-purple-700 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-sm hover:bg-purple-200 transition-all border border-purple-200">
                                                                <Mic size={14} /> تلخيص بالمايك
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </main>
            <BottomNav />
        </div>
    );
}