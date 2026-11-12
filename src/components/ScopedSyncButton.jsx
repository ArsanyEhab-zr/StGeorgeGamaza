import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { restoreChildEverywhere } from '../db/sync';
import { groupChildren, preferredChild } from '../utils/childIdentity';
import { useEffect, useState, useCallback } from 'react';
import { scopedSyncKeys, syncScopedClassesFromCloud } from '../db/childSync';
import { getServiceWeekRange } from '../utils/serviceWeek';

export default function ScopedSyncButton({ variant = 'card', secondaryAction = null }) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const scope = JSON.stringify(scopedSyncKeys().sort());
    const deletedChildren = useLiveQuery(async () => groupChildren((await db.children.toArray()).filter(c => JSON.parse(scope).includes(c.syncKey))).map(preferredChild).filter(c => c.isDeleted), [scope]) || [];
    const restore = async child => {
        setBusy(true);
        try {
            const result = await restoreChildEverywhere(child, JSON.parse(localStorage.getItem('currentServant') || '{}').name);
            setMessage(result.pendingSync ? 'تمت الاستعادة محليًا؛ في انتظار المزامنة' : 'تمت استعادة المخدوم');
        } catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    };
    const refresh = useCallback(async () => {
        setBusy(true);
        try {
            const result = await syncScopedClassesFromCloud(JSON.parse(scope));
            setMessage(`تمت مزامنة ${result.classCount} فصل وتحديث الأعداد`);
        } catch (error) { setMessage(`المزامنة غير مكتملة: ${error.message}`); }
        finally { setBusy(false); }
    }, [scope]);
    useEffect(() => { const timer = setTimeout(refresh, 0); return () => clearTimeout(timer); }, [refresh]); // Scope changes deliberately retrigger the full reconciliation.
    const week = getServiceWeekRange();

    if (variant === 'header-amber') {
        return (
            <div className="w-full space-y-2.5" dir="rtl">
                {/* Row 2: Service Week Banner */}
                <p className="bg-white/15 rounded-xl px-3 py-2 text-[11px] sm:text-xs font-bold leading-relaxed whitespace-normal break-words text-white/95 w-full">
                    أعداد الحضور لأسبوع الخدمة: {week.startDate} — {week.endDate}. يبدأ أسبوع جديد يوم الخميس؛ عدم التسجيل لا يعني غياب الفصل عن الأسبوع السابق.
                </p>

                {/* Row 3: Responsive Action Buttons */}
                <div className={`grid gap-2 w-full ${secondaryAction ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={refresh}
                        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2.5 text-xs sm:text-sm font-black text-white shadow-sm transition-all active:scale-[0.99] disabled:opacity-60 whitespace-normal leading-snug text-center cursor-pointer"
                    >
                        {busy ? '⏳ جارٍ مزامنة الفصول…' : '🔄 مزامنة وتوحيد أرقام الفصول'}
                    </button>
                    {secondaryAction && (
                        <button
                            type="button"
                            disabled={secondaryAction.disabled}
                            onClick={secondaryAction.onClick}
                            className="w-full rounded-xl bg-white/95 hover:bg-white px-3.5 py-2.5 text-xs sm:text-sm font-black text-indigo-800 shadow-sm transition-all active:scale-[0.99] disabled:opacity-60 whitespace-normal leading-snug text-center cursor-pointer"
                        >
                            {secondaryAction.label}
                        </button>
                    )}
                </div>

                {message && (
                    <p role="status" className="text-[11px] font-bold bg-white/20 text-white rounded-xl px-3 py-1.5 leading-snug break-words">
                        {message}
                    </p>
                )}

                {deletedChildren.length > 0 && (
                    <details className="rounded-xl bg-white/95 text-slate-800 border border-white/60 p-2.5 text-xs shadow-xs">
                        <summary className="font-black cursor-pointer select-none">المحذوفون ({deletedChildren.length}) — استعادة صريحة</summary>
                        <div className="mt-2 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                            {deletedChildren.map(child => (
                                <div key={child.id} className="flex items-center justify-between gap-2 py-2">
                                    <span className="font-bold text-slate-700 truncate">{child.name} — {child.syncKey}</span>
                                    <button type="button" disabled={busy} onClick={() => restore(child)} className="shrink-0 font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">استعادة</button>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white/95 border border-indigo-100 rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-2.5 w-full" dir="rtl">
            <button
                type="button"
                disabled={busy}
                onClick={refresh}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2.5 text-xs sm:text-sm font-black text-white shadow-xs transition-all active:scale-[0.99] disabled:opacity-60 whitespace-normal leading-snug text-center cursor-pointer"
            >
                {busy ? '⏳ جارٍ مزامنة كل الفصول…' : '🔄 مزامنة شاملة وتوحيد أرقام الفصول الآن'}
            </button>
            <p className="text-[11px] font-bold leading-relaxed text-slate-600 bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2 whitespace-normal break-words">
                أعداد الحضور لأسبوع الخدمة: {week.startDate} — {week.endDate}. يبدأ أسبوع جديد يوم الخميس؛ عدم التسجيل لا يعني غياب الفصل عن الأسبوع السابق.
            </p>
            {deletedChildren.length > 0 && (
                <details className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                    <summary className="font-black text-slate-700 cursor-pointer select-none">المحذوفون ({deletedChildren.length}) — استعادة صريحة</summary>
                    <div className="mt-2 divide-y divide-slate-200/70 max-h-40 overflow-y-auto">
                        {deletedChildren.map(child => (
                            <div key={child.id} className="flex items-center justify-between gap-2 py-2">
                                <span className="font-bold text-slate-700 truncate">{child.name} — {child.syncKey}</span>
                                <button type="button" disabled={busy} onClick={() => restore(child)} className="shrink-0 font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">استعادة</button>
                            </div>
                        ))}
                    </div>
                </details>
            )}
            {message && <p role="status" className="text-xs font-bold text-indigo-700 bg-indigo-50/80 px-3 py-1.5 rounded-xl break-words">{message}</p>}
        </div>
    );
}
