import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';
import { ArrowRight, Phone, Save, History, CheckCircle2, AlertTriangle } from 'lucide-react';

const ChildProfile = () => {
    const { triggerAutoSync } = useAutoSync();
    const { id } = useParams();
    const navigate = useNavigate();
    const childId = String(id);
    const child = useLiveQuery(() => db.children.get(childId));

    const [isSaving, setIsSaving] = useState(false);
    const [aiSummary, setAiSummary] = useState('');
    const [isInterventionRequired, setIsInterventionRequired] = useState(false);

    const saveNote = async () => {
        if (!aiSummary || isSaving) return;
        setIsSaving(true);
        
        const now = new Date().toISOString();
        const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');
        const newNote = {
            id: Date.now(),
            text: aiSummary,
            date: now,
            requiresIntervention: isInterventionRequired,
            interventionStatus: isInterventionRequired ? 'pending' : 'resolved',
            servantName: currentServant.name || 'خادم غير معروف',
            childName: child.name || 'مخدوم',
            osraName: currentServant.assignedOsra || child.stage || 'غير محدد'
        };
        
        const updatedNotes = child.notes ? [...child.notes, newNote] : [newNote];
        await db.children.update(childId, { 
            notes: updatedNotes, 
            last_visited: now.split('T')[0],
            isDirty: true,
            updatedAt: now
        });

        setIsSaving(false);
        setAiSummary('');
        setIsInterventionRequired(false);
        
        triggerAutoSync();
        alert('تم حفظ تقرير الافتقاد في ملف المخدوم بنجاح! ✅');
    };

    if (!child) return <div className="text-center p-10 font-bold text-slate-500 animate-pulse">جاري تحميل ملف المخدوم...</div>;

    const isGirl = child.gender === 'بنت';
    const themeBg = isGirl ? 'bg-pink-100' : 'bg-blue-100';
    const themeText = isGirl ? 'text-pink-600' : 'text-blue-600';
    const themeBorder = isGirl ? 'border-pink-100' : 'border-blue-100';
    const badgeBg = isGirl ? 'bg-pink-50' : 'bg-blue-50';

    return (
        <main className="min-h-screen bg-slate-50 relative overflow-x-hidden font-sans pb-20" dir="rtl">
            <div className="relative z-10 max-w-3xl mx-auto px-4 pt-6">

                {/* ─── Header ─── */}
                <div className="flex items-center justify-between mb-8 bg-white/80 backdrop-blur-md p-4 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full ${themeBg} flex items-center justify-center text-3xl shadow-inner overflow-hidden`}>
                            {child.profilePic ? <img src={child.profilePic} width="56" height="56" loading="eager" className="w-full h-full object-cover" alt={child.name} /> : (isGirl ? '👧' : '👦')}
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2 flex-wrap">
                                {(!isGirl && child.isOrdained) ? (child.ordinationRank || 'شماس') + ' / ' : ''}{child.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 mt-1">
                                <span className={`px-2 py-0.5 rounded-full ${badgeBg} ${themeText} border ${themeBorder}`}>
                                    مواظبة: {child.streak} / 4
                                </span>
                                {child.fatherPhone && <span className="flex items-center gap-1" title="تليفون الأب">👨 {child.fatherPhone}</span>}
                                {child.motherPhone && <span className="flex items-center gap-1" title="تليفون الأم">👩 {child.motherPhone}</span>}
                                {child.childPhone && <span className="flex items-center gap-1" title="تليفون المخدوم">👦 {child.childPhone}</span>}
                                {!child.fatherPhone && !child.motherPhone && !child.childPhone && child.phone && <span className="flex items-center gap-1"><Phone size={12} /> {child.phone}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => navigate(-1)} aria-label="الرجوع للخلف" className="flex items-center justify-center w-12 h-12 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                        <ArrowRight size={20} />
                    </button>
                </div>


                {/* ─── 🎙️ المساعد الصوتي للافتقاد تم استبداله بمربع نص ─── */}
                <section className="bg-linear-to-br from-indigo-900 to-purple-900 p-6 md:p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group mb-8">
                    <div className="absolute -left-10 -top-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>

                    <div className="relative z-10 flex flex-col items-center text-center">
                        <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
                             إضافة تقرير افتقاد
                        </h2>

                        <div className="mt-8 w-full bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/20 text-right">
                                <div className="animate-in fade-in slide-in-from-bottom-2 border-t border-white/10 pt-4">
                                    <textarea
                                        value={aiSummary}
                                        onChange={(e) => setAiSummary(e.target.value)}
                                        className="w-full bg-black/20 text-white p-3 rounded-xl border border-white/10 text-sm focus:ring-2 focus:ring-purple-400 outline-none min-h-[150px] mb-4"
                                        placeholder="اكتب تفاصيل الافتقاد هنا..."
                                    />
                                    <div className="flex items-center gap-2 mb-4 bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
                                        <input 
                                            type="checkbox" 
                                            id="intervention" 
                                            checked={isInterventionRequired} 
                                            onChange={(e) => setIsInterventionRequired(e.target.checked)}
                                            className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                                        />
                                        <label htmlFor="intervention" className="text-amber-200 font-bold text-sm cursor-pointer flex items-center gap-1">
                                            <AlertTriangle size={16} /> طلب تدخل أبوي (تصعيد المشكلة لأبونا أو أمين الخدمة)
                                        </label>
                                    </div>
                                    <button onClick={saveNote} className="w-full bg-green-500 text-white py-3 rounded-2xl font-black flex justify-center items-center gap-2 hover:bg-green-600 active:scale-95 transition-all shadow-lg">
                                        <Save size={18} /> حفظ التقرير في ملف المخدوم
                                    </button>
                                </div>
                        </div>
                    </div>
                </section>

                {/* ─── 📝 سجل الملاحظات السابقة ─── */}
                <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                        <History className="text-indigo-500" size={20} /> سجل الافتقاد السابق
                    </h3>

                    {child.notes && child.notes.length > 0 ? (
                        <div className="space-y-4">
                            {[...child.notes].reverse().map(note => (
                                <div key={note.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold mb-2 flex justify-between">
                                        <span>{new Date(note.date).toLocaleString('ar-EG')}</span>
                                        {note.requiresIntervention && (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${note.interventionStatus === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {note.interventionStatus === 'resolved' ? 'تم حل المشكلة' : 'تدخل أبوي عاجل'}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                                        {note.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                            <p className="text-sm font-bold text-slate-400">مفيش أي تقارير افتقاد متسجلة للمخدوم ده لسه.</p>
                        </div>
                    )}
                </section>

            </div>
        </main>
    );
};

export default ChildProfile;
