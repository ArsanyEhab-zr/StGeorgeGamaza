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
    const [activeClass, setActiveClass] = useState(() => sessionStorage.getItem('dashboard_activeClassKey') || 'all');

    // 🔄 Monitor active syncKey and activeClass changes (login, logout, class switch)
    useEffect(() => {
        const checkKey = () => {
            const key = localStorage.getItem('currentSyncKey');
            if (key !== currentSyncKey) {
                setCurrentSyncKey(key);
            }
            const active = sessionStorage.getItem('dashboard_activeClassKey') || 'all';
            if (active !== activeClass) {
                setActiveClass(active);
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
    }, [currentSyncKey, activeClass]);

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
                        // Also soft-delete any local attendance for this child safely without modify
                        try {
                            const attByChild = await db.attendance.where('childId').equals(docId).toArray();
                            for (const a of attByChild) {
                                await db.attendance.update(a.id, { isDeleted: true });
                            }
                            if (!isNaN(numId)) {
                                const attByNum = await db.attendance.where('childId').equals(numId).toArray();
                                for (const a of attByNum) {
                                    await db.attendance.update(a.id, { isDeleted: true });
                                }
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

        const handleAttendanceSnapshot = async (snapshot) => {
            try {
                for (const change of snapshot.docChanges()) {
                    const docId = change.doc.id; // Format: YYYY-MM-DD_childId_type

                    if (change.type === 'removed') {
                        const parts = docId.split('_');
                        if (parts.length >= 3) {
                            const date = parts[0];
                            const type = parts[parts.length - 1];
                            const childId = parts.slice(1, parts.length - 1).join('_');
                            const matches = await db.attendance
                                .where('date').equals(date)
                                .filter(a => String(a.childId) === String(childId) && a.type === type)
                                .toArray();
                            const idsToDelete = matches.map(m => m.id).filter(id => id != null);
                            if (idsToDelete.length > 0) {
                                await db.attendance.bulkDelete(idsToDelete);
                            }
                        }
                    } else if (change.type === 'added' || change.type === 'modified') {
                        const rawData = change.doc.data();
                        const attData = rawData?.payload ? decryptData(rawData.payload) : rawData;
                        if (!attData || !attData.date || !attData.childId || !attData.type) continue;

                        const matches = await db.attendance
                            .where('date').equals(attData.date)
                            .filter(a => String(a.childId) === String(attData.childId) && a.type === attData.type)
                            .toArray();

                        if (attData.isDeleted) {
                            const idsToDelete = matches.map(m => m.id).filter(id => id != null);
                            if (idsToDelete.length > 0) {
                                await db.attendance.bulkDelete(idsToDelete);
                            }
                        } else {
                            // If multiple duplicate local records exist for the same (date, childId, type), purge redundant ones
                            if (matches.length > 1) {
                                const redundantIds = matches.slice(1).map(m => m.id).filter(id => id != null);
                                if (redundantIds.length > 0) {
                                    await db.attendance.bulkDelete(redundantIds);
                                }
                            }

                            const existingRecord = matches[0];
                            const { id: _cloudId, ...cloudData } = attData;

                            if (existingRecord) {
                                // When updating an existing record, preserve the local primary key (existingRecord.id),
                                // strip out any conflicting id from the cloud payload, and perform a safe upsert
                                if (!existingRecord.isDirty) {
                                    await db.attendance.put({
                                        ...cloudData,
                                        id: existingRecord.id,
                                        syncKey: cloudData.syncKey || currentSyncKey,
                                        isDirty: false,
                                        isDeleted: false
                                    });
                                }
                            } else {
                                // If the record doesn't exist locally, strip out conflicting IDs and save safely using put
                                await db.attendance.put({
                                    ...cloudData,
                                    syncKey: cloudData.syncKey || currentSyncKey,
                                    isDirty: false,
                                    isDeleted: false
                                });
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('⚡ [RealtimeSync] Error processing attendance snapshot change:', err);
            }
        };

        if (isMaster) {
            // Master Admin: Avoid open-ended collectionGroup(firestore, 'attendance') listeners as they choke the network pipeline.
            // If the admin actively selected a specific class, listen directly to that class's attendance;
            // otherwise, rely on syncDataWithCloud for global admin modes.
            const targetClass = (activeClass && activeClass !== 'all' && activeClass !== 'MASTER_ACCESS' && activeClass !== 'ADMIN_MODE')
                ? activeClass
                : null;

            try {
                if (targetClass) {
                    const colRefKids = collection(firestore, 'Osras', targetClass, 'children');
                    const unsubKids = onSnapshot(colRefKids, handleSnapshot, (err) => {
                        console.warn(`Realtime listener error (${targetClass} children):`, err.message);
                    });
                    unsubs.push(unsubKids);

                    const colRefAtt = collection(firestore, 'Osras', targetClass, 'attendance');
                    const unsubAtt = onSnapshot(colRefAtt, handleAttendanceSnapshot, (err) => {
                        console.warn(`Realtime listener error (${targetClass} attendance):`, err.message);
                    });
                    unsubs.push(unsubAtt);
                } else {
                    // Global admin mode: keep children sync responsive, but do NOT attach collectionGroup('attendance')
                    // to prevent socket connection exhaustion and 10s backend timeouts.
                    const qKids = collectionGroup(firestore, 'children');
                    const unsubKids = onSnapshot(qKids, handleSnapshot, (err) => {
                        console.warn('Realtime listener error (children collectionGroup):', err.message);
                    });
                    unsubs.push(unsubKids);
                }
            } catch (e) {
                console.warn('Failed to attach realtime listeners for master:', e);
            }
        } else if (isStageAdmin) {
            // Stage Admin: listen to all allowed classes
            for (const key of allowedClasses) {
                if (!key) continue;
                try {
                    const colRefKids = collection(firestore, 'Osras', key, 'children');
                    const unsubKids = onSnapshot(colRefKids, handleSnapshot, (err) => {
                        console.warn(`Realtime listener error (${key} children):`, err.message);
                    });
                    unsubs.push(unsubKids);

                    const colRefAtt = collection(firestore, 'Osras', key, 'attendance');
                    const unsubAtt = onSnapshot(colRefAtt, handleAttendanceSnapshot, (err) => {
                        console.warn(`Realtime listener error (${key} attendance):`, err.message);
                    });
                    unsubs.push(unsubAtt);
                } catch (e) {
                    console.warn(`Failed to attach listener for ${key}:`, e);
                }
            }
        } else {
            // Regular Servant: listen to current class
            try {
                const colRefKids = collection(firestore, 'Osras', currentSyncKey, 'children');
                const unsubKids = onSnapshot(colRefKids, handleSnapshot, (err) => {
                    console.warn(`Realtime listener error (${currentSyncKey} children):`, err.message);
                });
                unsubs.push(unsubKids);

                const colRefAtt = collection(firestore, 'Osras', currentSyncKey, 'attendance');
                const unsubAtt = onSnapshot(colRefAtt, handleAttendanceSnapshot, (err) => {
                    console.warn(`Realtime listener error (${currentSyncKey} attendance):`, err.message);
                });
                unsubs.push(unsubAtt);
            } catch (e) {
                console.warn(`Failed to attach listener for ${currentSyncKey}:`, e);
            }
        }

        return () => {
            unsubs.forEach(unsub => {
                try { unsub(); } catch (_e) {}
            });
        };
    }, [currentSyncKey, activeClass]);
}
