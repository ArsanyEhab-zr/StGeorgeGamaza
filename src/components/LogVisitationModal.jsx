import React, { useState } from 'react';
import { X, Home, DoorOpen, Phone, CheckCircle2, Loader2, FileText, AlertCircle } from 'lucide-react';
import { VISITATION_TYPES, getVisitationInfo, formatLastVisitedDate } from '../utils/visitationTypes';
import { getLocalDateString } from '../utils/serviceWeek';
import { db } from '../db/database';
import { logActivity } from '../utils/activityLogger';
import useAutoSync from '../hooks/useAutoSync';

export default function LogVisitationModal({ isOpen, child, onClose, onSuccess }) {
    const { triggerAutoSync } = useAutoSync();
    const [selectedType, setSelectedType] = useState('home_inside');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!isOpen || !child) return null;

    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const lastVisitStr = formatLastVisitedDate(child.last_visited);
    const lastVisitInfo = child.lastVisitationType ? getVisitationInfo(child.lastVisitationType) : null;

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setErrorMsg('');

            const nowTs = Date.now();
            const nowIso = new Date().toISOString();
            const todayStr = getLocalDateString();
            const targetSyncKey = child.syncKey || currentSyncKey || 'default';
            const typeInfo = getVisitationInfo(selectedType);

            // 1. Log attendance record with specific visitation type
            await db.attendance.add({
                date: todayStr,
                childId: String(child.id),
                type: 'visitation',
                status: 'present',
                visitationType: selectedType,
                visitationLabel: typeInfo.label,
                note: note.trim(),
                syncKey: targetSyncKey,
                isDirty: true,
                updatedAt: nowIso,
                isDeleted: false
            });

            // 2. Update child record with last_visited, lastVisitationType, lastVisitationLabel
            const childUpdates = {
                last_visited: nowTs,
                lastVisitationType: selectedType,
                lastVisitationLabel: typeInfo.label,
                isDirty: true,
                updatedAt: nowTs
            };

            // Support either numeric or string IDs
            try {
                await db.children.update(child.id, childUpdates);
            } catch {
                const numId = Number(child.id);
                if (!isNaN(numId)) {
                    await db.children.update(numId, childUpdates);
                }
            }

            // 3. Log activity audit
            logActivity('SAVE_NOTE', `تسجيل ${typeInfo.label} للمخدوم: ${child.name || child.id}${note.trim() ? ` — ملاحظة: ${note.trim()}` : ''}`);

            // 4. Trigger auto sync to cloud
            triggerAutoSync();

            if (onSuccess) {
                onSuccess({
                    childId: child.id,
                    type: selectedType,
                    label: typeInfo.label,
                    note: note.trim()
                });
            }

            onClose();
        } catch (err) {
            console.error("Error logging visitation:", err);
            setErrorMsg("حدث خطأ أثناء حفظ الافتقاد: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-linear-to-r from-indigo-600 via-indigo-700 to-purple-700 p-5 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute left-4 top-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl overflow-hidden shadow-inner">
                            {child.profilePic ? (
                                <img src={child.profilePic} alt={child.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                                child.gender === 'بنت' ? '👧' : '👦'
                            )}
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200 block">تسجيل افتقاد مخدوم</span>
                            <h2 className="text-lg font-black">{child.name}</h2>
                        </div>
                    </div>

                    {lastVisitStr && (
                        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-indigo-100">
                            <span>آخر افتقاد سابق: {lastVisitStr}</span>
                            {lastVisitInfo && (
                                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    {lastVisitInfo.shortLabel}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-200">
                            <AlertCircle size={16} />
                            {errorMsg}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-2">
                            اختر نوع الافتقاد:
                        </label>
                        <div className="grid grid-cols-1 gap-2.5">
                            {VISITATION_TYPES.map((t) => {
                                const isSelected = selectedType === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setSelectedType(t.id)}
                                        className={`p-3.5 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/60 shadow-md ring-2 ring-indigo-500/20'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{t.icon}</span>
                                            <div>
                                                <div className="font-black text-xs text-slate-800 flex items-center gap-2">
                                                    {t.label}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                                    {t.description}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                            isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                                        }`}>
                                            {isSelected && <CheckCircle2 size={14} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <FileText size={14} className="text-slate-400" />
                            ملاحظة سريعة للافتقاد (اختياري):
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="اكتب ما تم خلال الافتقاد (مثال: محتاج تشجيع في الصلاة، الأهل مرحبين...)"
                            rows={2}
                            className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2.5 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                        إلغاء
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                        {isSaving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        {isSaving ? 'جارٍ الحفظ...' : 'تأكيد وحفظ الافتقاد'}
                    </button>
                </div>
            </div>
        </div>
    );
}
