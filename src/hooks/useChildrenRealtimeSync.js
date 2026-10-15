import { useState, useEffect } from 'react';
import { collection, onSnapshot, collectionGroup } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { db } from '../db/database';
import { decryptData } from '../encryption';

/**
 * ⚡ useChildrenRealtimeSync — Real-time Firestore sync for children.
 * Listens to Firestore changes on the current servant's class (or classes) and
 * immediately updates local Dexie storage. When a child is deleted in Firestore,
 * this hook purges it from local Dexie, triggering instant useLiveQuery UI updates
 * across all connected clients.
 */
export default function useChildrenRealtimeSync() {
    const [currentSyncKey, setCurrentSyncKey] = useState(localStorage.getItem('currentSyncKey'));

    // 🔄 Monitor active syncKey changes (login, logout, class switch)
    useEffect(() => {
        const checkKey = () => {
            const key = localStorage.getItem('currentSyncKey');
            if (key !== currentSyncKey) {
                setCurrentSyncKey(key);
            }
        };

        window.addEventListener('storage', checkKey);
        window.addEventListener('auth-changed', checkKey);
        window.addEventListener('syncKey-changed', checkKey);

        const interval = setInterval(checkKey, 2000);
        return () => {
            window.removeEventListener('storage', checkKey);
            window.removeEventListener('auth-changed', checkKey);
            window.removeEventListener('syncKey-changed', checkKey);
            clearInterval(interval);
        };
    }, [currentSyncKey]);

    useEffect(() => {
        if (!currentSyncKey) return;

        const currentServantObj = JSON.parse(localStorage.getItem('currentServant') || '{}');
        const allowedClasses = currentServantObj.allowedClasses || [];
        const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
        const isStageAdmin = currentSyncKey === 'STAGE_ADMIN';

        const unsubs = [];

        const handleSnapshot = async (snapshot) => {
            try {
                for (const change of snapshot.docChanges()) {
                    const docId = change.doc.id;

                    if (change.type === 'removed') {
                        console.log(`🗑️ [RealtimeSync] Child deleted from Firestore: ${docId}`);
                        await db.children.delete(docId);
                        const numId = Number(docId);
                        if (!isNaN(numId)) {
                            await db.children.delete(numId);
                        }
                        // Also soft-delete any local attendance for this child
                        try {
                            await db.attendance.where('childId').equals(docId).modify({ isDeleted: true });
                            if (!isNaN(numId)) {
                                await db.attendance.where('childId').equals(numId).modify({ isDeleted: true });
                            }
                        } catch (_e) {}
                    } else if (change.type === 'added' || change.type === 'modified') {
                        const rawData = change.doc.data();
                        const childData = rawData?.payload ? decryptData(rawData.payload) : rawData;
                        if (!childData) continue;

                        if (childData.isDeleted) {
                            console.log(`🗑️ [RealtimeSync] Child marked deleted: ${docId}`);
                            await db.children.delete(docId);
                            const numId = Number(docId);
                            if (!isNaN(numId)) await db.children.delete(numId);
                        } else if (childData.id) {
                            const localMatch = await db.children.get(childData.id);
                            // Only update if not dirty locally (don't overwrite servant's uncommitted edits)
                            if (!localMatch || !localMatch.isDirty) {
                                await db.children.put({
                                    ...childData,
                                    syncKey: childData.syncKey || currentSyncKey,
                                    isDirty: false,
                                    isDeleted: false
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('⚡ [RealtimeSync] Error processing snapshot change:', err);
            }
        };

        if (isMaster) {
            // Master Admin: listen to collectionGroup for instant multi-class sync
            try {
                const q = collectionGroup(firestore, 'children');
                const unsub = onSnapshot(q, handleSnapshot, (err) => {
                    console.warn('Realtime listener error (collectionGroup):', err.message);
                });
                unsubs.push(unsub);
            } catch (e) {
                console.warn('Failed to attach collectionGroup listener:', e);
            }
        } else if (isStageAdmin) {
            // Stage Admin: listen to all allowed classes
            for (const key of allowedClasses) {
                if (!key) continue;
                try {
                    const colRef = collection(firestore, 'Osras', key, 'children');
                    const unsub = onSnapshot(colRef, handleSnapshot, (err) => {
                        console.warn(`Realtime listener error (${key}):`, err.message);
                    });
                    unsubs.push(unsub);
                } catch (e) {
                    console.warn(`Failed to attach listener for ${key}:`, e);
                }
            }
        } else {
            // Regular Servant: listen to current class
            try {
                const colRef = collection(firestore, 'Osras', currentSyncKey, 'children');
                const unsub = onSnapshot(colRef, handleSnapshot, (err) => {
                    console.warn(`Realtime listener error (${currentSyncKey}):`, err.message);
                });
                unsubs.push(unsub);
            } catch (e) {
                console.warn(`Failed to attach listener for ${currentSyncKey}:`, e);
            }
        }

        return () => {
            unsubs.forEach(unsub => {
                try { unsub(); } catch (_e) {}
            });
        };
    }, [currentSyncKey]);
}
