import { logActivity } from '../utils/activityLogger';
import { db } from './database';
import { firestore } from './firebase';
import { collection, getDocsFromServer, doc, runTransaction } from 'firebase/firestore';
import { encryptData, decryptData } from '../encryption';
import { normalizeArabicName, sameChild, childAliases, childNameKey, deletionWins, timestamp, attendanceIdentity, resolveAttendanceChild } from '../utils/childIdentity';
import { getCanonicalActiveChildren, consolidateLocalDexieDuplicates } from '../utils/churchDataEngine';
import { resolveServantNotificationScope } from '../utils/notificationScopeEngine';

const REGISTRY = 'deleted_children_tombstones_v1';
const registry = () => JSON.parse(localStorage.getItem(REGISTRY) || '{}');
const registryKeys = c => [...childAliases(c).map(id => `${c.syncKey}::id::${id}`), childNameKey(c)];
const remember = c => {
    const entries = registry();
    for (const key of registryKeys(c)) {
        if (c.isDeleted && timestamp(c.deletedAt) >= timestamp(entries[key]?.deletedAt)) entries[key] = { deletedAt: c.deletedAt || 0, deletedBy: c.deletedBy || 'خادم' };
        else if (timestamp(c.restoredAt) > timestamp(entries[key]?.deletedAt)) delete entries[key];
    }
    localStorage.setItem(REGISTRY, JSON.stringify(entries));
};
const localTombstone = c => registryKeys(c).map(k => registry()[k]).filter(Boolean).sort((a, b) => timestamp(b.deletedAt) - timestamp(a.deletedAt))[0];
export const scopedSyncKeys = () => resolveServantNotificationScope().allowedSyncKeys;
export const decodeCloudRecord = snapshot => {
    const raw = snapshot.data();
    const payload = raw?.payload ? decryptData(raw.payload) : raw;
    if (!payload) throw new Error(`تعذر قراءة المستند ${snapshot.id}`);
    // Top-level lifecycle metadata overrides legacy encrypted payloads.
    const lifecycle = Object.fromEntries(['isDeleted', 'deletedAt', 'deletedBy', 'restoredAt', 'restoredBy', 'updatedAt'].filter(k => raw[k] !== undefined).map(k => [k, raw[k]]));
    return { ...payload, ...lifecycle, cloudId: snapshot.ref.parent.id === 'childIdentities' ? (payload.cloudId || payload.id) : snapshot.id, syncKey: snapshot.ref.parent.parent.id };
};
const envelope = c => ({ payload: encryptData(JSON.parse(JSON.stringify(c))), isDeleted: !!c.isDeleted,
    deletedAt: c.deletedAt || null, deletedBy: c.deletedBy || null, restoredAt: c.restoredAt || null,
    restoredBy: c.restoredBy || null, updatedAt: c.updatedAt || 0 });

export const reconcileCloudChild = async cloud => {
    const savedTombstone = localTombstone(cloud);
    if (!cloud.isDeleted && savedTombstone && deletionWins({ ...savedTombstone, isDeleted: true }, cloud)) {
        return; // Keep the pending local deletion dirty until the server acknowledges it.
    }
    await db.transaction('rw', db.children, db.attendance, async () => {
        const matches = (await db.children.toArray()).filter(c => sameChild(c, cloud));
        const remoteId = cloud.cloudId || cloud.id;
        const newLocalId = `${cloud.syncKey}::${remoteId}`;
        if (cloud.isDeleted) {
            remember(cloud);
            const targets = matches.length ? matches : [{ ...cloud, id: newLocalId }];
            for (const child of targets) {
                if (!deletionWins(cloud, child) || (child.isDeleted && timestamp(child.deletedAt) > timestamp(cloud.deletedAt))) continue;
                const deleted = { ...child, isDeleted: true, deletedAt: cloud.deletedAt || 0, deletedBy: cloud.deletedBy || 'خادم', updatedAt: cloud.updatedAt || cloud.deletedAt || 0, isDirty: false };
                remember(deleted);
                await db.children.put(deleted);
            }
            const aliases = new Set(targets.flatMap(childAliases));
            for (const row of await db.attendance.toArray()) {
                if (row.syncKey === cloud.syncKey && [row.childId, row.childCloudId, row.childLocalId].some(id => aliases.has(String(id))) && targets.some(c => deletionWins(cloud, c))) {
                    await db.attendance.update(row.id, { isDeleted: true, isDirty: false, updatedAt: cloud.deletedAt || 0 });
                }
            }
        } else {
            remember(cloud);
            const match = matches.find(c => String(c.cloudId || c.id) === String(cloud.cloudId)) || matches[0];
            if (matches.some(c => deletionWins(c, cloud))) return;
            if (match?.isDirty && timestamp(cloud.restoredAt) <= timestamp(match.deletedAt)) return;
            await db.children.put({ ...cloud, id: match?.id ?? newLocalId,
                aliasIds: [...new Set([...childAliases(cloud), ...matches.flatMap(childAliases)])],
                cloudIds: [...new Set([cloud.cloudId, ...matches.flatMap(c => [c.cloudId, ...(c.cloudIds || [])])].filter(Boolean).map(String))].sort(),
                cloudId: [...new Set([cloud.cloudId, ...matches.flatMap(c => [c.cloudId, ...(c.cloudIds || [])])].filter(Boolean).map(String))].sort()[0], isDirty: false });
        }
    });
};

export const reconcileCloudAttendance = async cloud => {
    if (!cloud.date || !cloud.type) return;
    await db.transaction('rw', db.children, db.attendance, async () => {
        const allChildren = await db.children.toArray();
        const canonical = getCanonicalActiveChildren(allChildren);
        const deletedChild = allChildren.find(c => c.isDeleted && c.syncKey === cloud.syncKey && ([cloud.childId, cloud.childCloudId, cloud.childLocalId].some(id => childAliases(c).includes(String(id))) || (cloud.childName && childNameKey(c) === childNameKey({ syncKey: cloud.syncKey, name: cloud.childName }))));
        if (deletedChild) cloud = { ...cloud, isDeleted: true };
        const child = resolveAttendanceChild(cloud, canonical);
        const data = { ...cloud, ...(child ? attendanceIdentity(child) : {}) };
        const matches = (await db.attendance.where('date').equals(cloud.date).toArray()).filter(r => r.syncKey === cloud.syncKey && r.type === cloud.type && (r.cloudId === cloud.cloudId || String(r.childId) === String(data.childId) || (child && resolveAttendanceChild(r, canonical)?.id === child.id)));
        const newest = matches.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))[0];
        if (newest && timestamp(newest.updatedAt) > timestamp(cloud.updatedAt)) return;
        const { id: _remoteId, ...fields } = data;
        await db.attendance.put({ ...fields, ...(newest ? { id: newest.id } : {}), isDirty: false });
        for (const duplicate of matches.slice(1)) await db.attendance.delete(duplicate.id);
    });
};

// Every child write reads the destination and all known duplicate documents in the
// same transaction, closing the read-before-push race for concurrent deletion.
export const pushChildSafely = async (child, cloudChildren) => {
    const currentLocal = await db.children.get(child.id);
    if (!currentLocal || currentLocal.updatedAt !== child.updatedAt || currentLocal.isDeleted !== child.isDeleted) return;
    const matching = cloudChildren.filter(c => sameChild(c, child));
    const primaryId = child.cloudId || matching.find(c => !c.isDeleted)?.cloudId || child.id;
    child = { ...child, cloudId: String(primaryId) };
    const docIds = [...new Set([String(primaryId), ...matching.map(c => String(c.cloudId || c.id))])];
    const refs = docIds.map(id => doc(firestore, 'Osras', child.syncKey, 'children', id));
    const identityRef = doc(firestore, 'Osras', child.syncKey, 'childIdentities', encodeURIComponent(normalizeArabicName(child.name || String(primaryId))));
    const result = await runTransaction(firestore, async tx => {
        const snapshots = await Promise.all([...refs, identityRef].map(ref => tx.get(ref)));
        const records = snapshots.filter(s => s.exists()).map(s => ({ ...decodeCloudRecord(s), ...(s.id === identityRef.id ? { cloudId: String(primaryId) } : {}) }));
        const tombstone = records.find(c => deletionWins(c, child));
        if (!child.isDeleted && tombstone) return tombstone;
        const newer = records.find(c => !c.isDeleted && timestamp(c.restoredAt) > timestamp(child.deletedAt) && child.isDeleted);
        if (newer) return newer;
        // Explicit restore updates all aliases, so no stale duplicate tombstone survives it.
        const targets = child.isDeleted || child.restoredAt ? refs : [refs[0]];
        for (const ref of targets) tx.set(ref, envelope({ ...child, cloudId: ref.id, isDirty: false }));
        if (child.isDeleted || child.restoredAt) tx.set(identityRef, envelope({ ...child, isDirty: false }));
        return null;
    });
    if (result) { await reconcileCloudChild(result); return; }
    remember(child);
    await db.transaction('rw', db.children, async () => {
        const current = await db.children.get(child.id);
        if (current && current.updatedAt === child.updatedAt && current.isDeleted === child.isDeleted) await db.children.update(child.id, { isDirty: false, cloudId: child.cloudId });
    });
};

const inFlight = new Map();
const syncClass = key => {
    if (inFlight.has(key)) return inFlight.get(key);
    const task = (async () => {
        const [kids, attendance, identities] = await Promise.all([
            getDocsFromServer(collection(firestore, 'Osras', key, 'children')),
            getDocsFromServer(collection(firestore, 'Osras', key, 'attendance')),
            getDocsFromServer(collection(firestore, 'Osras', key, 'childIdentities'))
        ]);
        const cloudChildren = [...kids.docs, ...identities.docs].map(decodeCloudRecord);
        // Process active documents first, tombstones last; suppression is also checked in each write.
        for (const child of [...cloudChildren].sort((a, b) => Number(a.isDeleted) - Number(b.isDeleted))) await reconcileCloudChild(child);
        for (const child of await db.children.where('syncKey').equals(key).toArray()) {
            if (!child.isDirty) continue;
            const tomb = localTombstone(child);
            if (!child.isDeleted && tomb && deletionWins({ ...tomb, isDeleted: true }, child)) {
                await reconcileCloudChild({ ...child, ...tomb, isDeleted: true });
                continue;
            }
            await pushChildSafely(child, cloudChildren);
        }
        for (const row of attendance.docs.map(decodeCloudRecord)) await reconcileCloudAttendance(row);
        const canonical = getCanonicalActiveChildren(await db.children.toArray(), [key]);
        for (const row of await db.attendance.where('syncKey').equals(key).toArray()) {
            if (!row.isDirty) continue;
            const child = resolveAttendanceChild(row, canonical);
            if (!child && !row.isDeleted) continue;
            const data = { ...row, ...(child ? attendanceIdentity(child) : {}), isDirty: false };
            const id = `${data.date}_${data.childCloudId || data.childId}_${data.type}`;
            const ref = doc(firestore, 'Osras', key, 'attendance', id);
            await runTransaction(firestore, async tx => {
                const snap = await tx.get(ref);
                if (snap.exists() && timestamp(decodeCloudRecord(snap).updatedAt) > timestamp(row.updatedAt)) return;
                tx.set(ref, envelope(data));
            });
            await db.transaction('rw', db.attendance, async () => {
                const current = await db.attendance.get(row.id);
                if (current?.updatedAt === row.updatedAt && current.isDeleted === row.isDeleted && current.status === row.status) await db.attendance.update(row.id, { isDirty: false, cloudId: id });
            });
        }
        localStorage.setItem(`lastSyncTime_${key}`, new Date().toISOString());
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
};
export const syncScopedClassesFromCloud = async (keys = scopedSyncKeys()) => {
    const allowed = new Set(scopedSyncKeys());
    const scope = [...new Set(keys)].filter(k => allowed.has(k));
    const failures = [];
    for (let i = 0; i < scope.length; i += 4) {
        const results = await Promise.allSettled(scope.slice(i, i + 4).map(syncClass));
        results.forEach((r, j) => { if (r.status === 'rejected') failures.push(`${scope[i + j]}: ${r.reason.message}`); });
    }
    await consolidateLocalDexieDuplicates();
    if (failures.length) throw new Error(failures.join('\n'));
    return { success: true, classCount: scope.length };
};

const changeChildLifecycle = async (childOrId, user, restore) => {
    const children = await db.children.toArray();
    const child = typeof childOrId === 'object' ? childOrId : children.find(c => childAliases(c).includes(String(childOrId)));
    if (!child?.syncKey) throw new Error('لم يتم العثور على المخدوم أو الفصل');
    if (!scopedSyncKeys().includes(child.syncKey)) throw new Error('الفصل خارج نطاق المستخدم');
    const matches = children.filter(c => sameChild(c, child));
    const now = Math.max(Date.now(), ...matches.flatMap(c => [timestamp(c.deletedAt) + 1, timestamp(c.restoredAt) + 1]));
    const changes = restore ? { isDeleted: false, restoredAt: now, restoredBy: user || 'خادم', deletedAt: null, deletedBy: null, updatedAt: now, isDirty: true }
        : { isDeleted: true, deletedAt: now, deletedBy: user || 'خادم', updatedAt: now, isDirty: true, restoredAt: null };
    const targets = matches.length ? matches : [child];
    await db.transaction('rw', db.children, db.attendance, db.grades, async () => {
        for (const c of targets) await db.children.put({ ...c, ...changes });
        if (!restore) {
            const ids = new Set(targets.flatMap(childAliases));
            for (const table of [db.attendance, db.grades]) for (const row of await table.toArray()) {
                if (row.syncKey === child.syncKey && ([row.childId, row.childCloudId, row.childLocalId].some(id => ids.has(String(id))) || (row.childName && childNameKey({ ...row, name: row.childName }) === childNameKey(child)))) {
                    await table.update(row.id, { isDeleted: true, updatedAt: now, isDirty: true });
                }
            }
        }
    });
    for (const c of targets) remember({ ...c, ...changes });
    let pendingSync = true;
    if (navigator.onLine) {
        try {
            const snapshot = await getDocsFromServer(collection(firestore, 'Osras', child.syncKey, 'children'));
            const cloud = snapshot.docs.map(decodeCloudRecord);
            for (const c of targets) await pushChildSafely({ ...c, ...changes }, cloud);
            pendingSync = false;
        } catch (error) { console.warn('Lifecycle saved locally; cloud retry required', error); }
    }
    void logActivity(restore ? 'RESTORE_CHILD' : 'DELETE_CHILD', `${restore ? 'استعادة' : 'حذف'} المخدوم: ${child.name || child.id} (${child.syncKey})`);
    return { success: true, pendingSync };
};
export const deleteChildEverywhere = (child, user) => changeChildLifecycle(child, user, false);
export const restoreChildEverywhere = (child, user) => changeChildLifecycle(child, user, true);
