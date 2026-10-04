import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';
import { ArrowRight, Phone, MapPin, ClipboardList, Briefcase, Calendar, Info, Map, AlertTriangle, PartyPopper } from 'lucide-react';

export default function ChildInfo() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { triggerAutoSync } = useAutoSync();

    // 🌟 نستخرج ID من الـ URL فقط ليكون المصدر الوحيد للحقيقة
    const childId = String(id);

    // 🌟 تحديث البيانات في الخلفية فور فتح البروفايل
    useEffect(() => {
        triggerAutoSync();
    }, [triggerAutoSync]);

    const child = useLiveQuery(() => {
        if (childId) return db.children.get(childId);
        return null;
    }, [childId]);

    // لو مفيش ID مبعوت من الأساس
    if (!childId) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-10 font-bold text-slate-500 font-sans" dir="rtl">
                <AlertTriangle size={40} className="text-red-400 mb-4" />
                <p>بيانات المخدوم غير متوفرة أو المسار غير صحيح.</p>
                <button onClick={() => navigate(-1)} className="mt-6 bg-slate-200 px-6 py-2 rounded-xl text-sm hover:bg-slate-300 transition-colors">رجوع</button>
            </div>
        );
    }

    if (!child) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-center p-10 font-bold text-slate-500 animate-pulse font-sans">جاري تحميل بيانات المخدوم...</div>;

    const isGirl = child.gender === 'بنت';
    const themeColor = isGirl ? 'pink' : 'blue';
    const primaryPhone = child.whatsappTarget === 'father' ? child.fatherPhone : child.whatsappTarget === 'child' ? child.childPhone : child.motherPhone || child.phone;

    // 🌟 فحص عيد الميلاد جوه الملف
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

    const isBday = isBirthdayToday(child.birthDate);

    return (
        <div className="min-h-screen bg-slate-50 relative pb-20 font-sans" dir="rtl">
            <div className="relative z-10 max-w-3xl mx-auto px-4 pt-6 animate-in fade-in duration-500">

                {/* 🥳 يافطة الاحتفال لو عيد ميلاده النهارده */}
                {isBday && (
                    <div className="bg-linear-to-r from-pink-500 via-purple-500 to-yellow-500 p-1 rounded-3xl mb-4 shadow-lg animate-pulse">
                        <div className="bg-white/20 backdrop-blur-sm px-4 py-3 rounded-[1.3rem] flex items-center justify-center gap-2 text-white font-black text-sm">
                            <PartyPopper size={20} /> كل سنة وأنت طيب! النهارده عيد ميلاد المخدوم 🎉
                        </div>
                    </div>
                )}

                {/* ─── Header ─── */}
                <div className="flex items-center justify-between mb-6 bg-white/90 backdrop-blur-md p-5 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className={`w-20 h-20 rounded-full bg-${themeColor}-100 flex items-center justify-center text-4xl shadow-inner overflow-hidden border-4 ${isBday ? 'border-yellow-400' : 'border-white'}`}>
                            {child.profilePic ? <img src={child.profilePic} className="w-full h-full object-cover" alt={child.name} /> : (isGirl ? '👧' : '👦')}
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-slate-800">{(!isGirl && child.isOrdained) ? (child.ordinationRank || 'شماس') + ' / ' : ''}{child.name}</h1>
                            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-[10px] font-black bg-${themeColor}-50 text-${themeColor}-700 border border-${themeColor}-100`}>
                                مواظبة: {child.streak || 0}
                            </span>
                        </div>
                    </div>
                    <button onClick={() => navigate(-1)} className="w-12 h-12 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-all shadow-sm flex items-center justify-center shrink-0">
                        <ArrowRight size={20} />
                    </button>
                </div>

                {/* ─── 📋 بطاقة البيانات الشاملة ─── */}
                <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 mb-6">
                    <h3 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Info className="text-blue-500" size={20} /> بيانات المخدوم
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Phone size={12} /> تليفون الأم</span>
                            <p className="font-black text-slate-700 text-sm" dir="ltr">{child.motherPhone || 'لا يوجد'}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Phone size={12} /> تليفون الأب</span>
                            <p className="font-black text-slate-700 text-sm" dir="ltr">{child.fatherPhone || 'لا يوجد'}</p>
                        </div>
                        {child.childPhone && (
                            <div className="md:col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Phone size={12} /> تليفون المخدوم</span>
                                <p className="font-black text-slate-700 text-sm" dir="ltr">{child.childPhone}</p>
                            </div>
                        )}
                        {child.phone && !child.motherPhone && !child.fatherPhone && !child.childPhone && (
                            <div className="md:col-span-2 bg-amber-50 p-4 rounded-2xl border border-amber-200">
                                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 mb-1"><Phone size={12} /> رقم مسجل سابقاً</span>
                                <p className="font-black text-amber-800 text-sm" dir="ltr">{child.phone}</p>
                            </div>
                        )}

                        <div className="md:col-span-2 bg-green-50 p-4 rounded-2xl border border-green-100 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] font-bold text-green-600 mb-1 block">رقم الواتس الأساسي (للافتقاد)</span>
                                <p className="font-black text-green-800 text-sm" dir="ltr">{primaryPhone || 'غير محدد'}</p>
                            </div>
                            {primaryPhone && (
                                <a href={`https://wa.me/2${primaryPhone}`} target="_blank" rel="noreferrer" className="bg-green-500 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md hover:bg-green-600 transition-all">
                                    مراسلة
                                </a>
                            )}
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><MapPin size={12} /> المنطقة</span>
                            <p className="font-black text-slate-700 text-sm">{child.address || 'غير محددة'}</p>
                        </div>

                        <div className={`p-4 rounded-2xl border ${isBday ? 'bg-pink-50 border-pink-200' : 'bg-slate-50 border-slate-100'}`}>
                            <span className={`text-[10px] font-bold flex items-center gap-1 mb-1 ${isBday ? 'text-pink-500' : 'text-slate-400'}`}><Calendar size={12} /> تاريخ الميلاد</span>
                            <p className={`font-black text-sm ${isBday ? 'text-pink-700' : 'text-slate-700'}`}>{child.birthDate || 'غير محدد'}</p>
                        </div>

                        <div className="md:col-span-2 bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                            <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1 mb-1"><MapPin size={12} /> العنوان التفصيلي (وصف البيت)</span>
                            <p className="font-black text-indigo-900 text-sm leading-relaxed">{child.detailedAddress || 'لا يوجد وصف للبيت'}</p>
                        </div>

                        <div className="md:col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Briefcase size={12} /> وظيفة الأب</span>
                            <p className="font-black text-slate-700 text-sm">{child.fatherJob || 'غير محددة'}</p>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Info size={12} /> أب الاعتراف</span>
                            <p className="font-black text-slate-700 text-sm">{child.fatherConfessor || 'غير مسجل'}</p>
                        </div>

                        {!isGirl && (
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 mb-1"><Info size={12} /> الرتبة الشماسية</span>
                                <p className="font-black text-slate-700 text-sm">{child.isOrdained ? (child.ordinationRank || 'شماس') : 'غير مرسوم'}</p>
                            </div>
                        )}

                        {child.gpsLink && (
                            <div className="md:col-span-2 bg-blue-50 p-4 rounded-2xl border border-blue-100 flex justify-between items-center">
                                <span className="text-xs font-black text-blue-800 flex items-center gap-1"><Map size={16} /> اللوكيشن</span>
                                <a href={child.gpsLink} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md">
                                    فتح الخريطة
                                </a>
                            </div>
                        )}

                        {child.specialNotes && (
                            <div className="md:col-span-2 bg-amber-50 p-4 rounded-2xl border border-amber-100">
                                <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 mb-1"><AlertTriangle size={12} /> ملاحظات هامة</span>
                                <p className="font-black text-amber-900 text-sm leading-relaxed whitespace-pre-wrap">{child.specialNotes}</p>
                            </div>
                        )}
                    </div>
                </section>


                {/* ─── 📝 سجل ملاحظات الافتقاد ─── */}
                <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                        <ClipboardList className="text-indigo-500" size={20} /> سجل الافتقاد السابق
                    </h3>
                    {child.notes && child.notes.length > 0 ? (
                        <div className="space-y-3">
                            {[...child.notes].reverse().map(note => (
                                <div key={note.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 relative">
                                    <span className="absolute top-4 left-4 w-2 h-2 rounded-full bg-indigo-400"></span>
                                    <p className="text-[10px] text-slate-400 font-bold mb-2">{new Date(note.date).toLocaleString('ar-EG')}</p>
                                    <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{note.text}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-sm font-bold text-slate-400 py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">مفيش ملاحظات افتقاد مسجلة.</p>
                    )}
                </section>

            </div>
        </div>
    );
}