import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Link } from 'react-router-dom';
import { Search, Phone, Info, ChevronLeft, Gift, Cake } from 'lucide-react';
import BottomNav from '../components/BottomNav';

export default function InfoDirectory() {
    const [activeFilter, setActiveFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedMonthFilter, setSelectedMonthFilter] = useState("all");

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

    // 🌟 دالة لاستخراج شهر الميلاد للفلترة
    const getBirthMonth = (child) => {
        if (child.birthMonth) return child.birthMonth;
        if (!child.birthDate) return null;
        const bDateStr = String(child.birthDate);
        const arabicMonths = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "إبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
        for (const [arMonth, num] of Object.entries(arabicMonths)) {
            if (bDateStr.includes(arMonth)) return num;
        }
        const d = new Date(bDateStr);
        if (!isNaN(d.getTime())) return d.getMonth() + 1;
        return null;
    };

    // 🌟 دالة لاكتشاف لو عيد ميلاد البطل النهارده!
    const isBirthdayToday = (birthDateStr) => {
        if (!birthDateStr) return false;
        const str = String(birthDateStr);
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;

        const dayMatch = str.match(/\d+/);
        const day = dayMatch ? parseInt(dayMatch[0], 10) : null;

        const arabicMonths = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "إبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
        let month = null;
        for (const [arMonth, num] of Object.entries(arabicMonths)) {
            if (str.includes(arMonth)) { month = num; break; }
        }

        if (!month) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                month = d.getMonth() + 1;
                if (!day) return d.getDate() === currentDay && month === currentMonth;
            }
        }
        return day === currentDay && month === currentMonth;
    };

    const filteredChildren = children?.filter((c) => {
        // فلتر النوع
        if (activeFilter === "boys" && c.gender === "بنت") return false;
        if (activeFilter === "girls" && c.gender !== "بنت") return false;
        // فلتر شهر الميلاد
        if (selectedMonthFilter !== "all") {
            const bMonth = getBirthMonth(c);
            if (bMonth !== Number(selectedMonthFilter)) return false;
        }
        return true;
    }) || [];

    const getDisplayPhone = (child) => {
        if (child.whatsappTarget === 'child' && child.childPhone) return `📱 ${child.childPhone}`;
        if (child.whatsappTarget === 'father' && child.fatherPhone) return `👨 ${child.fatherPhone}`;
        if (child.whatsappTarget === 'mother' && child.motherPhone) return `👩 ${child.motherPhone}`;
        
        if (child.childPhone) return `📱 ${child.childPhone}`;
        if (child.fatherPhone) return `👨 ${child.fatherPhone}`;
        if (child.motherPhone) return `👩 ${child.motherPhone}`;
        if (child.phone) return `📞 ${child.phone}`;
        return 'لا يوجد تليفون';
    };

    const monthsOptions = [
        { id: "all", label: "كل الشهور" },
        { id: 1, label: "يناير" }, { id: 2, label: "فبراير" }, { id: 3, label: "مارس" },
        { id: 4, label: "أبريل" }, { id: 5, label: "مايو" }, { id: 6, label: "يونيو" },
        { id: 7, label: "يوليو" }, { id: 8, label: "أغسطس" }, { id: 9, label: "سبتمبر" },
        { id: 10, label: "أكتوبر" }, { id: 11, label: "نوفمبر" }, { id: 12, label: "ديسمبر" }
    ];

    return (
        <div className="min-h-screen bg-slate-50 pb-32 font-sans" dir="rtl">
            <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm mb-6 rounded-b-4xl">
                <div className="max-w-4xl mx-auto">
                    {/* 🔍 البحث بالاسم */}
                    <div className="relative mb-4">
                        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="ابحث في الدليل بالاسم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pr-10 pl-4 py-2.5 rounded-full bg-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                    </div>

                    {/* 👦👧 فلتر النوع */}
                    <div className="flex gap-2 justify-center mb-3">
                        {[{ id: "all", label: "الكل 🌟" }, { id: "boys", label: "ولاد 👦" }, { id: "girls", label: "بنات 👧" }].map(f => (
                            <button key={f.id} onClick={() => setActiveFilter(f.id)} className={`flex-1 px-4 py-2 rounded-full text-xs font-black transition-all ${activeFilter === f.id ? "bg-emerald-600 text-white shadow-md" : "bg-slate-100 text-slate-600"}`}>{f.label}</button>
                        ))}
                    </div>

                    {/* 🎂 فلتر شهور أعياد الميلاد */}
                    <div className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
                        {monthsOptions.map(m => (
                            <button key={m.id} onClick={() => setSelectedMonthFilter(m.id)} className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${selectedMonthFilter === m.id ? 'bg-amber-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {m.id !== "all" && <Gift size={10} className="inline ml-1 mb-0.5" />} {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="px-4 max-w-4xl mx-auto">
                <div className="bg-emerald-50 p-4 rounded-3xl mb-6 flex items-center gap-3">
                    <Info className="text-emerald-600" size={24} />
                    <div>
                        <h2 className="font-black text-emerald-800">دليل الأبطال</h2>
                        <p className="text-xs font-bold text-emerald-600/80">اضغط لفتح الملف والصور</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredChildren.length === 0 ? (
                        <div className="col-span-full text-center py-10 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-3xl">لا يوجد أبطال مطابقين للبحث.</div>
                    ) : (
                        filteredChildren.map(child => {
                            const isBday = isBirthdayToday(child.birthDate); // 🥳 فحص عيد الميلاد

                            return (
                                <Link key={child.id} to={`/info/${child.id}`} className={`p-4 rounded-3xl shadow-sm border flex items-center gap-4 transition-all relative overflow-hidden ${isBday ? 'bg-linear-to-l from-yellow-50 to-amber-100 border-yellow-400 shadow-yellow-200/50 scale-[1.02]' : 'bg-white border-slate-100 hover:border-emerald-200'}`}>
                                    {/* شريط الإضاءة لو عيد ميلاده */}
                                    {isBday && <div className="absolute top-0 left-0 w-full h-1.5 bg-linear-to-r from-yellow-400 via-pink-500 to-yellow-400 animate-pulse"></div>}

                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl overflow-hidden shadow-inner ${isBday ? 'bg-yellow-200 border-2 border-yellow-400' : 'bg-slate-100'}`}>
                                        {child.profilePic ? <img src={child.profilePic} className="object-cover w-full h-full" alt={child.name} /> : (child.gender === 'بنت' ? '👧' : '👦')}
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="font-black text-slate-800 text-sm flex items-center gap-1">
                                            {child.name}
                                            {isBday && <Cake size={16} className="text-pink-500 animate-bounce" />}
                                        </h3>
                                        <p className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1" dir="ltr">
                                            <Phone size={10} /> {getDisplayPhone(child)}
                                        </p>

                                        {/* 🌟 إظهار تاريخ الميلاد وتنويره لو النهارده */}
                                        {child.birthDate && (
                                            <p className={`text-[10px] font-black mt-1.5 flex items-center gap-1 w-fit px-2 py-0.5 rounded-lg ${isBday ? 'bg-pink-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                                                <Gift size={10} /> {child.birthDate} {isBday && ' (النهارده!)'}
                                            </p>
                                        )}
                                    </div>
                                    <ChevronLeft size={20} className={isBday ? "text-pink-500" : "text-slate-400"} />
                                </Link>
                            );
                        })
                    )}
                </div>
            </main>
            <BottomNav />
        </div>
    );
}