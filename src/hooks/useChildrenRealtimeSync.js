import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { scopedSyncKeys, decodeCloudRecord, reconcileCloudChild, reconcileCloudAttendance, syncScopedClassesFromCloud } from '../db/childSync';

export default function useChildrenRealtimeSync() {
    const [scope, setScope] = useState(() => JSON.stringify(scopedSyncKeys().sort()));
    useEffect(() => {
        const refresh = () => setScope(JSON.stringify(scopedSyncKeys().sort()));
        const timer = setInterval(refresh, 2000);
        window.addEventListener('auth-changed', refresh);
        window.addEventListener('storage', refresh);
        return () => { clearInterval(timer); window.removeEventListener('auth-changed', refresh); window.removeEventListener('storage', refresh); };
    }, []);
    useEffect(() => {
        const keys = JSON.parse(scope);
        let cancelled = false;
        let queue = Promise.resolve();
        const fail = error => {
            console.error('Scoped realtime sync failed', error);
            window.dispatchEvent(new CustomEvent('global-sync-status', { detail: { status: 'error' } }));
        };
        const unsubs = keys.flatMap(key => ['children', 'attendance', 'childIdentities'].map(type => onSnapshot(
            collection(firestore, 'Osras', key, type), snapshot => {
                // Pending writes/cache removals do not prove a server-side deletion.
                if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
                queue = queue.then(async () => {
                    if (cancelled) return;
                    for (const change of snapshot.docChanges()) {
                        if (change.type === 'removed') continue; // Never infer deletion from absence.
                        const data = decodeCloudRecord(change.doc);
                        await (type !== 'attendance' ? reconcileCloudChild(data) : reconcileCloudAttendance(data));
                    }
                }).catch(fail);
            }, fail
        )));
        const sync = () => { if (navigator.onLine) syncScopedClassesFromCloud(keys).catch(fail); };
        sync();
        window.addEventListener('online', sync);
        return () => { cancelled = true; unsubs.forEach(fn => fn()); window.removeEventListener('online', sync); };
    }, [scope]);
}
