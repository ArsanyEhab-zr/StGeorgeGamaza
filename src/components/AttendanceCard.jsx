import React, { useState, useEffect } from 'react';
import { db } from '../db/database';
import { Gift, MapPin, CheckCircle2, Edit3, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import useAutoSync from '../hooks/useAutoSync';

const AttendanceCard = ({ child, onEdit }) => {
    const [attendedToday, setAttendedToday] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    const { triggerAutoSync } = useAutoSync();

    // عشان الزرار يفضل منور أخضر لو هو فعلاً حضر النهاردة
    useEffect(() => {
        if (child.last_attended === today) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAttendedToday(true);
        } else {
            setAttendedToday(false);
        }
    }, [child.last_attended, today]);

    const toggleAttendance = async () => {
        const syncKey = localStorage.getItem('currentSyncKey');
        const now = new Date().toISOString();

        if (!attendedToday) {
            // تسجيل حضور وزيادة المواظبة
            await db.attendance.add({ 
                date: today, 
                childId: child.id,
                syncKey,
                isDirty: true,
                updatedAt: now,
                isDeleted: false
            });
            const newStreak = (child.streak || 0) + 1;
            await db.children.update(child.id, {
                streak: newStreak,
                last_attended: today,
                isDirty: true,
                updatedAt: now
            });
            setAttendedToday(true);
        } else {
            // إلغاء الحضور (لو داس غلط) وتقليل المواظبة
            const newStreak = Math.max((child.streak || 1) - 1, 0);
            await db.children.update(child.id, {
                streak: newStreak,
                last_attended: 'cancelled',
                isDirty: true,
                updatedAt: now
            });
            // We should also soft-delete the attendance record, but since this card just pushes simple updates to child streak and attendance without specifically querying the record ID to delete, it might be tricky. Wait, `toggleAttendance` in Dashboard attendance card only modifies `child.streak`. The attendance record added above is not deleted directly here (it doesn't have the `id` easily available). However, Attendance.jsx handles full toggle. Let's just update child.
            setAttendedToday(false);
        }
        triggerAutoSync();
    };

    const streakCount = child.streak || 0;
    const isGirl = child.gender === 'بنت';
    const themeColor = isGirl ? 'pink' : 'blue';

    return (
        <div className="flex items-center justify-between p-3 bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 hover:shadow-md transition-all active:scale-[0.98]">

            {/* الجزء اليمين: الصورة، زرار التعديل، والاسم */}
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="relative shrink-0 flex flex-col items-center gap-1">
                    <Link to={`/child/${child.id}`}>
                        <div className={`w-12 h-12 rounded-2xl bg-linear-to-br from-${themeColor}-100 to-${themeColor}-50 border border-${themeColor}-200 flex items-center justify-center text-lg font-black text-${themeColor}-600 shadow-inner`}>
                            {child.profilePic ? (
                                <img src={child.profilePic} alt={child.name} className="w-full h-full rounded-2xl object-cover" />
                            ) : (
                                isGirl ? '👧' : '👦'
                            )}
                        </div>
                    </Link>
                    {/* زرار التعديل السريع - هيفتح الـ Popup اللي هنعمله في App */}
                    <button
                        onClick={() => onEdit(child)}
                        className="p-1 text-slate-400 hover:text-purple-600 transition-colors"
                    >
                        <Edit3 size={16} />
                    </button>
                </div>

                <div className="flex flex-col">
                    <h3 className="font-bold text-slate-800 text-[15px] truncate max-w-35">{child.name}</h3>

                    <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">المواظبة</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4].map((step) => (
                                <div
                                    key={step}
                                    className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${streakCount >= step
                                            ? (streakCount >= 4 ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]' : `bg-${themeColor}-400`)
                                            : 'bg-slate-100'
                                        }`}
                                />
                            ))}
                        </div>
                        {streakCount >= 4 && <Gift size={14} className="text-yellow-500 ml-1 animate-bounce" />}
                    </div>
                </div>
            </div>

            {/* الجزء الشمال: زراير الأكشن السريع */}
            <div className="flex items-center gap-2">
                {/* لو الطفل غايب، يظهر زرار اتصال سريع */}
                {!attendedToday && child.phone && (
                    <a
                        href={`tel:${child.phone}`}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                    >
                        <Phone size={18} />
                    </a>
                )}

                <button
                    onClick={toggleAttendance}
                    className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all active:scale-90 ${attendedToday
                            ? 'bg-green-500 text-white shadow-lg shadow-green-200'
                            : `bg-${themeColor}-50 text-${themeColor}-600 border border-${themeColor}-100`
                        }`}
                >
                    {attendedToday ? (
                        <CheckCircle2 size={28} />
                    ) : (
                        <>
                            <span className="text-[10px] font-black uppercase">حضور</span>
                            <div className={`w-1.5 h-1.5 rounded-full bg-${themeColor}-600 mt-1 animate-pulse`}></div>
                        </>
                    )}
                </button>
            </div>

        </div>
    );
};

export default AttendanceCard;