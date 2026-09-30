/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Plus, ChevronRight, ChevronLeft, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import { db } from '../db/database';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function CalendarPage() {
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');

    const [holidays, setHolidays] = useState({ fixed: {}, dynamic: {} });



    // 1️⃣ جلب الأحداث من الداتابيز المحلية
    const fetchEvents = async () => {
        if (!currentSyncKey) return;
        const allEvents = await db.events.where('syncKey').equals(currentSyncKey).toArray();
        setEvents(allEvents.filter(e => !e.isDeleted));
    };

    useEffect(() => {
        fetchEvents();
    }, [currentSyncKey]);

    useEffect(() => {
        const loadHolidays = async () => {
            const currentYear = currentDate.getFullYear();
            const cacheKey = `holidays_${currentYear}`;

            const fixedHolidays = {
                '01-07': 'عيد الميلاد المجيد 🌟',
                '01-19': 'عيد الغطاس المجيد 🌊',
                '01-25': 'عيد الشرطة / ثورة 25 يناير 🇪🇬',
                '03-19': 'عيد الصليب ✝️',
                '04-25': 'عيد تحرير سيناء 🇪🇬',
                '05-01': 'عيد العمال 👷‍♂️',
                '06-01': 'دخول العائلة المقدسة مصر 🇪🇬',
                '06-30': 'ثورة 30 يونيو 🇪🇬',
                '07-12': 'عيد الرسل 👑',
                '07-23': 'ثورة 23 يوليو 🇪🇬',
                '08-22': 'صعود جسد العذراء مريم 🕊️',
                '09-11': 'عيد النيروز 🌴',
                '09-27': 'عيد الصليب ✝️',
                '10-06': 'انتصارات أكتوبر 🪖'
            };

            let dynamicHolidays = {};
            const cachedDynamic = localStorage.getItem(cacheKey);

            if (cachedDynamic) {
                dynamicHolidays = JSON.parse(cachedDynamic);
            } else if (navigator.onLine) {
                try {
                    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/EG`);
                    const data = await res.json();
                    data.forEach(h => {
                        dynamicHolidays[h.date] = h.localName + ' 🎈';
                    });
                    localStorage.setItem(cacheKey, JSON.stringify(dynamicHolidays));
                } catch (error) {
                    console.log("الإنترنت ضعيف أو الـ API فيه مشكلة، هنعتمد على الثوابت.");
                }
            }

            setHolidays({ fixed: fixedHolidays, dynamic: dynamicHolidays });
        };

        loadHolidays();
    }, [currentDate.getFullYear()]);

    const getHolidayInfo = (dateObj) => {
        const mmdd = format(dateObj, 'MM-dd');
        const yyyymmdd = format(dateObj, 'yyyy-MM-dd');
        return holidays.fixed[mmdd] || holidays.dynamic[yyyymmdd] || null;
    };

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const selectedDateEvents = events.filter(event => isSameDay(new Date(event.date), selectedDate));
    const selectedHoliday = getHolidayInfo(selectedDate);



    return (
        <div className="min-h-screen bg-slate-900 pb-32 text-white font-sans relative" dir="rtl">

            {/* Header */}
            <div className="bg-slate-800/50 backdrop-blur-lg border-b border-white/10 sticky top-0 z-40 px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* 🌟 زرار العودة للرئيسية */}
                    <button onClick={() => navigate(-1)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors text-slate-300">
                        <ArrowRight size={20} />
                    </button>
                    <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/30">
                        <CalendarIcon className="text-indigo-400" size={24} />
                    </div>
                    <h1 className="text-xl font-black text-white">أجندة الخدمة</h1>
                </div>
                <button
                    onClick={() => navigate('/add-event')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                    <Plus size={18} /> حدث جديد
                </button>
            </div>

            <div className="p-4 max-w-md mx-auto space-y-6">

                {/* Calendar UI */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-5 shadow-xl">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={prevMonth} className="p-2 bg-slate-700/50 hover:bg-slate-600 rounded-full transition-colors"><ChevronRight size={20} /></button>
                        <h2 className="text-lg font-bold text-indigo-100">
                            {format(currentDate, 'MMMM yyyy', { locale: ar })}
                        </h2>
                        <button onClick={nextMonth} className="p-2 bg-slate-700/50 hover:bg-slate-600 rounded-full transition-colors"><ChevronLeft size={20} /></button>
                    </div>

                    <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 mb-2">
                        {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(day => <div key={day}>{day}</div>)}
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {daysInMonth.map(day => {
                            const hasEvent = events.some(e => isSameDay(new Date(e.date), day));
                            const isSelected = isSameDay(day, selectedDate);
                            const isCurrentDay = isToday(day);
                            const holidayName = getHolidayInfo(day);

                            return (
                                <button
                                    key={day.toString()}
                                    onClick={() => setSelectedDate(day)}
                                    title={holidayName || ''}
                                    className={`
                                        aspect-square flex flex-col items-center justify-center rounded-2xl text-sm font-bold transition-all relative
                                        ${isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'hover:bg-slate-700 text-slate-300'}
                                        ${isCurrentDay && !isSelected ? 'border border-indigo-500 text-indigo-400' : ''}
                                        ${holidayName && !isSelected ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : ''}
                                    `}
                                >
                                    {format(day, 'd')}
                                    <div className="flex gap-1 mt-1">
                                        {hasEvent && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-400'}`}></span>}
                                        {holidayName && !hasEvent && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-rose-200' : 'bg-rose-500'}`}></span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Selected Date Events */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 mb-4 px-2">
                        أحداث يوم {format(selectedDate, 'EEEE، d MMMM', { locale: ar })}
                    </h3>

                    {selectedHoliday && (
                        <div className="mb-4 bg-linear-to-r from-rose-500/20 to-orange-500/20 border border-rose-500/30 p-4 rounded-2xl flex items-center gap-4 shadow-lg">
                            <div className="bg-rose-500/30 p-2.5 rounded-xl text-rose-200 text-xl">🎉</div>
                            <div>
                                <p className="text-[10px] text-rose-300 font-bold tracking-wider mb-0.5">إجازة / مناسبة</p>
                                <p className="text-sm text-white font-black">{selectedHoliday}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        {selectedDateEvents.length === 0 ? (
                            <div className="text-center py-8 bg-slate-800/30 border border-slate-700 border-dashed rounded-3xl text-slate-500 text-sm font-bold">
                                لا توجد مهام أو أحداث للأسرة في هذا اليوم
                            </div>
                        ) : (
                            selectedDateEvents.map(event => {
                                const totalTasks = event.tasks?.length || 0;
                                const completedTasks = event.tasks?.filter(t => t.isCompleted).length || 0;
                                const isAllCompleted = totalTasks > 0 && completedTasks === totalTasks;

                                return (
                                    <div
                                        key={event.id}
                                        onClick={() => navigate(`/event/${event.id}`)}
                                        className="bg-slate-800 border border-slate-700 rounded-2xl p-4 cursor-pointer hover:border-indigo-500/50 transition-all flex items-center justify-between shadow-md"
                                    >
                                        <div>
                                            <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                                {event.title}
                                                {/* 🌟 نقطة صفرا صغيرة بتدل إن الحدث ده لسه مترفعش للسحابة */}
                                                {!event.isSynced && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="يحتاج لمزامنة"></span>}
                                            </h4>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${isAllCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-500/10 text-indigo-300'
                                                    }`}>
                                                    {isAllCompleted ? <CheckCircle2 size={12} /> : <MapPin size={12} />}
                                                    {totalTasks > 0 ? `${completedTasks} / ${totalTasks} مهام` : 'لا توجد مهام'}
                                                </div>

                                                <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">
                                                    <span className="text-sm leading-none">💰</span> {event.price || 'مجانًا'}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronLeft className="text-slate-500 group-hover:text-indigo-400 transition-colors" size={20} />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}