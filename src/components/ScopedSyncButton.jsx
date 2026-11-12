import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { restoreChildEverywhere } from '../db/sync';
import { groupChildren, preferredChild } from '../utils/childIdentity';
import { useEffect, useState, useCallback } from 'react';
import { scopedSyncKeys, syncScopedClassesFromCloud } from '../db/childSync';
import { getServiceWeekRange } from '../utils/serviceWeek';

export default function ScopedSyncButton() {
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
    return <div className="my-3 w-full space-y-2" dir="rtl">
        <button disabled={busy} onClick={refresh} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white disabled:opacity-60">
            {busy ? 'جارٍ مزامنة كل الفصول…' : '🔄 مزامنة شاملة وتوحيد أرقام كل الفصول الآن'}
        </button>
        <p className="text-xs">أعداد الحضور لأسبوع الخدمة: {week.startDate} — {week.endDate}. يبدأ أسبوع جديد يوم الخميس؛ عدم التسجيل لا يعني غياب الفصل عن الأسبوع السابق.</p>
        {deletedChildren.length > 0 && <details className="rounded-xl border p-3"><summary>المحذوفون ({deletedChildren.length}) — استعادة صريحة</summary>
            {deletedChildren.map(child => <div key={child.id} className="flex justify-between gap-3 py-2"><span>{child.name} — {child.syncKey}</span><button disabled={busy} onClick={() => restore(child)} className="font-bold text-indigo-500">استعادة</button></div>)}
        </details>}
        {message && <p role="status" className="text-sm">{message}</p>}
    </div>;
}
