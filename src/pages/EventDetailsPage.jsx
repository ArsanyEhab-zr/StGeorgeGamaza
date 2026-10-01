import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
// 🌟 ضفنا أيقونة Plus عشان زرار إضافة المهمة الجديدة
import { ArrowRight, Check, Square, Calendar, CalendarDays, Plus, Edit, Trash2, X, PlusCircle, Link, MapPin, SearchCheck, MessageCircleWarning, ShieldAlert, BadgeCent } from 'lucide-react';
import useAutoSync from '../hooks/useAutoSync';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function EventDetailsPage() {
    const { triggerAutoSync } = useAutoSync();
    const { id } = useParams();
    const navigate = useNavigate();
    const [event, setEvent] = useState(null);
    const servantData = JSON.parse(localStorage.getItem('currentServant') || '{}');

    // 🌟 حالات التعديل 
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ title: '', date: '', price: '', tasks: [] });
    const [newTaskTitle, setNewTaskTitle] = useState(''); // للمهمة الجديدة

    useEffect(() => {
        const loadEvent = async () => {
            const ev = await db.events.get(id);
            setEvent(ev);
            if (ev) {
                // سحبنا المهام كمان جوه الـ editData عشان نعدل فيها براحتنا
                setEditData({ title: ev.title, date: ev.date, price: ev.price || '', tasks: ev.tasks || [] });
            }
        };
        loadEvent();
    }, [id]);

    const toggleTask = async (taskId) => {
        if (!event || isEditing) return;

        const updatedTasks = event.tasks.map(task => {
            if (task.id === taskId) {
                const isNowCompleted = !task.isCompleted;
                let note = task.note;

                // لو الخادم بيعلم صح
                if (isNowCompleted) {
                    const userNote = prompt("أضف ملاحظة (اختياري): \nمثال: تم شراء الكمية بزيادة ٢ كيلو");

                    // 🌟🔥 حل المشكلة: لو داس "إلغاء"، هنوقف الدالة فوراً ونرجع المهمة زي ما هي من غير أي تغيير
                    if (userNote === null) return task;

                    note = userNote.trim(); // لو داس موافق من غير ما يكتب، هتبقا فاضية عادي
                } else {
                    // لو بيلغي الصح، نفضي الملاحظة القديمة
                    note = '';
                }

                return {
                    ...task,
                    isCompleted: isNowCompleted,
                    completedByName: isNowCompleted ? servantData.name : '',
                    note: isNowCompleted ? note : ''
                };
            }
            return task;
        });

        const now = new Date().toISOString();
        const updatedEvent = { ...event, tasks: updatedTasks, isDirty: true, updatedAt: now };
        await db.events.put(updatedEvent);
        triggerAutoSync();
        setEvent(updatedEvent);
    };

    // 🌟 دوال إدارة المهام في وضع التعديل 
    const handleUpdateEditTask = (taskId, newTitle) => {
        const updatedTasks = editData.tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t);
        setEditData({ ...editData, tasks: updatedTasks });
    };

    const handleRemoveEditTask = (taskId) => {
        const updatedTasks = editData.tasks.filter(t => t.id !== taskId);
        setEditData({ ...editData, tasks: updatedTasks });
    };

    const handleAddNewTask = () => {
        if (!newTaskTitle.trim()) return;
        const newTask = {
            id: Date.now().toString(),
            title: newTaskTitle.trim(),
            isCompleted: false,
            completedByName: '',
            note: ''
        };
        setEditData({ ...editData, tasks: [...editData.tasks, newTask] });
        setNewTaskTitle('');
    };

    const handleDeleteEvent = async () => {
        if (window.confirm("⚠️ متأكد إنك عايز تلغي الحدث ده وتمسحه نهائياً؟ مفيش تراجع!")) {
            const now = new Date().toISOString();
            await db.events.update(id, { isDeleted: true, isDirty: true, updatedAt: now });
            triggerAutoSync();
            alert("تم إلغاء الحدث بنجاح");
            navigate(-1);
        }
    };

    const handleSaveEdit = async () => {
        if (!editData.title || !editData.date) return alert("الاسم والتاريخ مطلوبين");
        const now = new Date().toISOString();
        // 🌟 بنحفظ كل حاجة، شاملة المهام بعد التعديل
        const updatedEvent = {
            ...event,
            title: editData.title,
            date: editData.date,
            price: editData.price,
            tasks: editData.tasks, // المهام الجديدة
            isDirty: true,
            updatedAt: now
        };
        await db.events.put(updatedEvent);
        triggerAutoSync();
        setEvent(updatedEvent);
        setIsEditing(false);
    };

    if (!event) return <div className="min-h-screen bg-slate-900 text-white flex justify-center items-center">جاري التحميل...</div>;

    const completedCount = event.tasks.filter(t => t.isCompleted).length;
    const progress = event.tasks.length === 0 ? 0 : (completedCount / event.tasks.length) * 100;

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans pb-24" dir="rtl">
            <div className="bg-slate-800/50 border-b border-white/10 px-4 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full"><ArrowRight size={20} /></button>
                    <h1 className="text-xl font-black truncate max-w-50">{event.title}</h1>
                </div>

                {!isEditing ? (
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(true)} className="p-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-xl transition-all"><Edit size={18} /></button>
                        <button onClick={handleDeleteEvent} className="p-2 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all"><Trash2 size={18} /></button>
                    </div>
                ) : (
                    <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl"><X size={18} /></button>
                )}
            </div>

            <div className="p-4 max-w-md mx-auto space-y-6 mt-2">
                <div className="bg-linear-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-3xl p-5 shadow-xl transition-all">
                    {!isEditing ? (
                        <>
                            <h2 className="text-2xl font-black text-white mb-4">{event.title}</h2>
                            <div className="space-y-3 text-sm font-bold text-indigo-200">
                                <p className="flex items-center gap-2"><CalendarDays size={16} className="text-indigo-400" /> {format(new Date(event.date), 'EEEE، d MMMM yyyy', { locale: ar })}</p>
                                <p className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 p-2 rounded-xl w-fit"><span className="text-lg leading-none">💰</span> السعر: {event.price || 'مجانًا'}</p>
                                <p className="flex items-center gap-2 opacity-70"><User size={16} className="text-indigo-400" /> أُضيف بواسطة: {event.createdBy}</p>
                            </div>

                            <div className="mt-6">
                                <div className="flex justify-between text-xs font-bold text-indigo-300 mb-2">
                                    <span>نسبة الإنجاز</span>
                                    <span>{completedCount} من {event.tasks.length} مهام</span>
                                </div>
                                <div className="w-full bg-slate-950/50 rounded-full h-2.5 overflow-hidden">
                                    <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 animate-in fade-in">
                            <div>
                                <label className="text-xs text-indigo-300 mb-1 block">اسم الحدث</label>
                                <input className="w-full p-3 bg-slate-900/80 rounded-xl border border-indigo-500/50 outline-none text-white focus:border-indigo-400" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs text-indigo-300 mb-1 block">التاريخ</label>
                                <input type="date" className="w-full p-3 bg-slate-900/80 rounded-xl border border-indigo-500/50 outline-none text-white focus:border-indigo-400" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs text-indigo-300 mb-1 block">السعر / التكلفة</label>
                                <input className="w-full p-3 bg-slate-900/80 rounded-xl border border-indigo-500/50 outline-none text-white focus:border-indigo-400" placeholder="مجانًا" value={editData.price} onChange={e => setEditData({ ...editData, price: e.target.value })} />
                            </div>
                        </div>
                    )}
                </div>

                {/* 🌟 قسم المهام (الوضع العادي / وضع التعديل) */}
                <div>
                    <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
                        <MapPin className="text-emerald-400" /> {isEditing ? 'تعديل المهام' : 'قائمة المهام'}
                    </h3>

                    {/* لو مش بيعدل: نعرض المهام العادية اللي بتتعلم صح */}
                    {!isEditing ? (
                        <div className="space-y-3">
                            {event.tasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => toggleTask(task.id)}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3 ${task.isCompleted
                                        ? 'bg-emerald-900/20 border-emerald-500/30'
                                        : 'bg-slate-800/50 border-slate-700 hover:border-indigo-500/50'
                                        }`}
                                >
                                    <div className="mt-0.5">
                                        {task.isCompleted ? <CheckCircle2 className="text-emerald-400" size={24} /> : <Circle className="text-slate-500" size={24} />}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className={`font-bold ${task.isCompleted ? 'text-emerald-100 line-through opacity-70' : 'text-white'}`}>
                                            {task.title}
                                        </h4>

                                        {task.isCompleted && (
                                            <div className="mt-2 text-xs text-emerald-300 bg-emerald-950/50 p-2 rounded-lg border border-emerald-800/50">
                                                <p className="font-bold flex items-center gap-1 mb-1"><User size={10} /> أتمها: {task.completedByName}</p>
                                                {task.note && <p className="flex items-start gap-1 opacity-90"><MessageSquare size={10} className="mt-0.5 shrink-0" /> {task.note}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {event.tasks.length === 0 && (
                                <p className="text-center text-slate-500 text-sm font-bold py-4">لا توجد مهام حالياً.</p>
                            )}
                        </div>
                    ) : (
                        /* 🌟 لو بيعدل: نعرض مربعات تعديل وحذف وإضافة للمهام */
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                            {editData.tasks.map(task => (
                                <div key={task.id} className="flex items-center gap-2 p-3 bg-slate-800/80 rounded-xl border border-indigo-500/30">
                                    <input
                                        className="flex-1 bg-transparent text-white outline-none text-sm font-bold"
                                        value={task.title}
                                        onChange={e => handleUpdateEditTask(task.id, e.target.value)}
                                    />
                                    <button onClick={() => handleRemoveEditTask(task.id)} className="text-rose-400 hover:text-rose-300 p-1">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}

                            {/* مربع إضافة مهمة جديدة في وضع التعديل */}
                            <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-xl border border-indigo-500/50 mt-4">
                                <input
                                    className="flex-1 bg-transparent text-white outline-none text-sm px-2 font-bold"
                                    placeholder="إضافة مهمة جديدة..."
                                    value={newTaskTitle}
                                    onChange={e => setNewTaskTitle(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && handleAddNewTask()}
                                />
                                <button onClick={handleAddNewTask} className="p-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-colors">
                                    <Plus size={18} />
                                </button>
                            </div>

                            {/* زرار الحفظ الكبير تحت عشان ميضيعش مجهوده */}
                            <button onClick={handleSaveEdit} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-2xl font-black text-lg flex justify-center items-center gap-2 mt-6 shadow-lg shadow-emerald-500/20">
                                <Save size={24} /> حفظ جميع التعديلات
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}