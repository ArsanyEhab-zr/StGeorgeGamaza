import React, { useState } from 'react';
import { Calendar, CheckCircle2, Home, Clock, ChevronDown, ChevronUp, Sparkles, AlertCircle } from 'lucide-react';

export default function WeeklyClassActivitySummary({ classes = [], activityByClass = {}, onClassClick }) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    if (!classes || classes.length === 0) return null;

    let attendedCount = 0;
    let visitedCount = 0;

    classes.forEach(c => {
        const key = String(c.syncKey || '');
        const act = activityByClass[key];
        if (act?.hasRecordedAttendance) attendedCount++;
        if (act?.hasRecordedVisitation) visitedCount++;
    });

    const totalClasses = classes.length;
    const isAllAttended = attendedCount === totalClasses && totalClasses > 0;

    return (
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/90 mb-6 transition-all" dir="rtl">
            {/* Top Bar Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h3 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                            <span>إشعارات نشاط الفصول هذا الأسبوع</span>
                            {isAllAttended && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200 flex items-center gap-1">
                                    <Sparkles size={11} /> ممتاز! اكتمل الحضور
                                </span>
                            )}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400">
                            متابعة استمرارية دورة الجمعة للخميس الحالية
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Quick counter chips */}
                    <div className="flex items-center gap-1.5 text-[11px] font-black">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl">
                            ✅ حضور: {attendedCount}/{totalClasses}
                        </span>
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl">
                            🏡 افتقاد: {visitedCount}/{totalClasses}
                        </span>
                    </div>

                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                        title={isCollapsed ? 'عرض التفاصيل' : 'تصغير'}
                    >
                        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                </div>
            </div>

            {/* Class status pills list */}
            {!isCollapsed && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {classes.map((c) => {
                            const key = String(c.syncKey || '');
                            const act = activityByClass[key];
                            const hasAtt = act?.hasRecordedAttendance;
                            const hasVis = act?.hasRecordedVisitation;
                            const pCount = act?.presentCount || 0;
                            const vCount = act?.visitationCount || 0;

                            let pillBg = "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100";
                            if (hasAtt && hasVis) {
                                pillBg = "bg-emerald-50/80 border-emerald-300 text-emerald-900 hover:bg-emerald-100";
                            } else if (hasAtt) {
                                pillBg = "bg-green-50 border-green-200 text-green-900 hover:bg-green-100";
                            } else if (hasVis) {
                                pillBg = "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100";
                            }

                            return (
                                <button
                                    key={key}
                                    onClick={() => onClassClick && onClassClick(c)}
                                    className={`shrink-0 px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 ${pillBg}`}
                                >
                                    <span className="font-black">{c.name}</span>
                                    {hasAtt ? (
                                        <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold">
                                            ✓ {pCount}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 text-[10px]">
                                            ⏳
                                        </span>
                                    )}
                                    {hasVis && (
                                        <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold">
                                            🏡 {vCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
