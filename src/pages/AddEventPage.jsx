import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, Trash2, ArrowRight, MapPin, Globe } from 'lucide-react';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';

export default function AddEventPage() {
    const { triggerAutoSync } = useAutoSync();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [tasks, setTasks] = useState([]);
    const [manualTask, setManualTask] = useState('');
    const [price, setPrice] = useState(''); // 🌟 السعر

    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const servantData = JSON.parse(localStorage.getItem('currentServant') || '{}');
    
    const isLeader = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || ['أدمن مساعد', 'كاهن', 'أمين خدمة'].includes(servantData.role);
    const [isGlobal, setIsGlobal] = useState(false);

    const addManualTask = () => {
        if (!manualTask.trim()) return;
        setTasks([...tasks, {
            id: Date.now().toString(),
            title: manualTask,
            isCompleted: false,
            completedByName: '',
            note: ''
        }]);
        setManualTask('');
    };

    const removeTask = (id) => {
        setTasks(tasks.filter(t => t.id !== id));
    };

    const saveEvent = async () => {
        if (!title || !date) return alert("من فضلك اكتب اسم الحدث والتاريخ أولاً");

        const now = new Date().toISOString();
        const newEvent = {
            id: `ev_${Date.now()}`,
            syncKey: (isLeader && isGlobal) ? 'global' : currentSyncKey,
            isGlobal: isLeader ? isGlobal : false,
            createdAt: Date.now(),
            title,
            date,
            price: price || 'مجانًا', // 🌟 حفظ السعر
            createdBy: servantData.name || 'خادم',
            tasks: tasks,
            isDirty: true,
            updatedAt: now,
            isDeleted: false
        };

        await db.events.add(newEvent);
        triggerAutoSync();
        navigate('/calendar');
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24" dir="rtl">
            <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
                        <ArrowRight size={20} />
                    </button>
                    <h1 className="text-xl font-black text-slate-800">إضافة حدث / رحلة</h1>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-4 mt-6 space-y-6">

                {/* 1. بيانات الحدث الأساسية */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">اسم الحدث</label>
                        <input
                            className="w-full mt-1 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-bold"
                            placeholder="مثال: رحلة دير مارمينا..."
                            value={title} onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">التاريخ</label>
                        <input
                            type="date"
                            className="w-full mt-1 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-bold"
                            value={date} onChange={e => setDate(e.target.value)}
                        />
                    </div>
                    {/* 🌟 مربع السعر الجديد */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">تكلفة الفرد (السعر)</label>
                        <input
                            type="text"
                            className="w-full mt-1 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-bold"
                            placeholder="مثال: 150 جنيه / أو سيبها فاضية لو مجانًا"
                            value={price} onChange={e => setPrice(e.target.value)}
                        />
                    </div>
                    
                    {/* 🌟 حدث عام (للقادة فقط) */}
                    {isLeader && (
                        <div className="flex items-center gap-3 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 mt-2">
                            <input 
                                type="checkbox" 
                                id="globalEvent" 
                                checked={isGlobal} 
                                onChange={(e) => setIsGlobal(e.target.checked)}
                                className="w-6 h-6 accent-indigo-600 rounded cursor-pointer"
                            />
                            <label htmlFor="globalEvent" className="text-indigo-900 font-black text-sm cursor-pointer flex items-center gap-2">
                                <Globe size={18} className="text-indigo-500" />
                                حدث عام (يظهر لجميع الأسر والخدام)
                            </label>
                        </div>
                    )}
                </div>

                {/* 2. قسم المساعد الصوتي تم إزالته */}

                {/* 3. قائمة المهام المستخرجة واليدوية */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2">
                        <MapPin className="text-emerald-500" size={20} /> قائمة المهام المطلوبة
                    </h3>

                    <div className="flex gap-2 mb-5">
                        <input
                            className="flex-1 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:border-indigo-500 font-bold text-slate-700"
                            placeholder="إضافة مهمة يدوياً..."
                            value={manualTask} onChange={e => setManualTask(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && addManualTask()}
                        />
                        <button onClick={addManualTask} className="bg-slate-800 text-white p-3 rounded-xl hover:bg-slate-700 transition-colors"><Plus size={20} /></button>
                    </div>

                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {tasks.map(task => (
                            <div key={task.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span> {task.title}
                                </span>
                                <button onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-red-500 transition-colors bg-white p-1.5 rounded-lg shadow-sm border border-slate-100">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {tasks.length === 0 && (
                            <p className="text-center text-xs font-bold text-slate-400 py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                لم يتم إضافة أي مهام للحدث بعد.
                            </p>
                        )}
                    </div>
                </div>

                {/* 4. زرار الحفظ النهائي */}
                <button
                    onClick={saveEvent}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-2xl font-black text-lg flex justify-center items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 mt-8"
                >
                    <Check size={24} /> إنشاء الحدث والمزامنة
                </button>
            </div>
        </div>
    );
}