import { db } from '../db/database';
import { firestore } from '../db/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { normalizeArabicText } from './serviceWeek';

/**
 * Normalizes a phone number to its last 10 digits for deterministic duplicate detection.
 */
export const normalizePhoneDigits = (phone = '') => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
};

/**
 * Extracts the primary normalized phone for a child record.
 */
export const getPrimaryNormalizedPhone = (child = {}) => {
    return (
        normalizePhoneDigits(child.childPhone) ||
        normalizePhoneDigits(child.motherPhone) ||
        normalizePhoneDigits(child.fatherPhone) ||
        normalizePhoneDigits(child.phone) ||
        ''
    );
};

/**
 * Reads all configured valid class syncKeys from appSettings in localStorage.
 */
export const getConfiguredValidSyncKeys = () => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const saved = localStorage.getItem('appSettings');
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        const services = parsed?.services || [];
        const keys = services
            .flatMap(s => s?.osras || [])
            .map(o => String(o?.syncKey || '').trim())
            .filter(Boolean);
        return keys.length > 0 ? new Set(keys) : null;
    } catch (_e) {
        return null;
    }
};

/**
 * Helper to compare two child records and pick the more authoritative / newer one.
 */
const pickPreferredChildRecord = (existing, candidate) => {
    const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const candidateTime = candidate.updatedAt ? new Date(candidate.updatedAt).getTime() : 0;
    if (candidateTime > existingTime) return candidate;
    if (existingTime > candidateTime) return existing;

    // Fallback: pick the one with more populated fields
    const score = (c) =>
        (c.profilePic ? 2 : 0) +
        (c.motherPhone ? 1 : 0) +
        (c.fatherPhone ? 1 : 0) +
        (c.childPhone ? 1 : 0) +
        (c.birthDate ? 1 : 0) +
        (c.address ? 1 : 0);
    return score(candidate) >= score(existing) ? candidate : existing;
};

/**
 * 1. Canonical Active Children Resolver
 * Strictly excludes deleted or nameless records, normalizes syncKey, and deduplicates
 * by canonical ID (id / cloudId) and by (syncKey + normalized Arabic 4-part name + phone).
 *
 * @param {Array} allChildren - Raw children array from Dexie
 * @param {Array|Set|null} allowedSyncKeys - Optional set/array of allowed class syncKeys
 */
export const getCanonicalActiveChildren = (allChildren = [], allowedSyncKeys = null) => {
    const allowedSet = allowedSyncKeys
        ? new Set(Array.from(allowedSyncKeys).map(k => String(k || '').trim()).filter(Boolean))
        : null;

    // Step 1: Filter out deleted, invalid, or out-of-scope children
    const validRaw = [];
    for (const raw of (allChildren || [])) {
        if (!raw || raw.isDeleted === true) continue;
        const trimmedName = String(raw.name || '').trim();
        if (!trimmedName) continue;

        const syncKey = String(raw.syncKey || '').trim();
        if (!syncKey || syncKey === 'MASTER_ACCESS' || syncKey === 'ADMIN_MODE' || syncKey === 'STAGE_ADMIN') {
            continue;
        }
        if (allowedSet && allowedSet.size > 0 && !allowedSet.has(syncKey)) {
            continue;
        }

        const canonicalId = String(raw.id ?? raw.cloudId ?? '').trim();
        if (!canonicalId) continue;

        validRaw.push({
            ...raw,
            id: raw.id ?? canonicalId,
            name: trimmedName,
            syncKey
        });
    }

    // Step 2: Deduplicate by canonical ID (id / cloudId)
    const byIdMap = new Map();
    const aliasIdsByCanonicalId = new Map(); // canonicalId -> Set of all raw IDs merged into it

    for (const child of validRaw) {
        const idStr = String(child.id).trim();
        const cloudIdStr = child.cloudId ? String(child.cloudId).trim() : '';

        const existingKey = byIdMap.has(idStr)
            ? idStr
            : (cloudIdStr && byIdMap.has(cloudIdStr) ? cloudIdStr : null);

        if (existingKey) {
            const existing = byIdMap.get(existingKey);
            const preferred = pickPreferredChildRecord(existing, child);
            const prefIdStr = String(preferred.id).trim();
            byIdMap.delete(existingKey);
            byIdMap.set(prefIdStr, preferred);

            const aliases = aliasIdsByCanonicalId.get(existingKey) || new Set([existingKey]);
            aliases.add(idStr);
            if (cloudIdStr) aliases.add(cloudIdStr);
            aliasIdsByCanonicalId.delete(existingKey);
            aliasIdsByCanonicalId.set(prefIdStr, aliases);
        } else {
            byIdMap.set(idStr, child);
            const aliases = new Set([idStr]);
            if (cloudIdStr) aliases.add(cloudIdStr);
            aliasIdsByCanonicalId.set(idStr, aliases);
        }
    }

    // Step 3: Within the same syncKey, deduplicate exact duplicate full names (normalized Arabic name + same phone)
    const byFingerprintMap = new Map(); // `${syncKey}::${normName}::${phone}` -> canonicalIdStr
    const finalByIdMap = new Map();

    for (const [idStr, child] of byIdMap.entries()) {
        const normName = normalizeArabicText(child.name);
        const nameWords = normName.split(' ').filter(Boolean);
        const primaryPhone = getPrimaryNormalizedPhone(child);

        // Deduplicate if same class + same normalized full name (3+ parts) + same phone (or both empty phone with 4+ parts)
        let fingerprint = null;
        if (nameWords.length >= 3 && primaryPhone) {
            fingerprint = `${child.syncKey}::${normName}::${primaryPhone}`;
        } else if (nameWords.length >= 4 && !primaryPhone) {
            fingerprint = `${child.syncKey}::${normName}::NO_PHONE`;
        }

        if (fingerprint && byFingerprintMap.has(fingerprint)) {
            const existingIdStr = byFingerprintMap.get(fingerprint);
            const existing = finalByIdMap.get(existingIdStr);
            if (existing) {
                const preferred = pickPreferredChildRecord(existing, child);
                const prefIdStr = String(preferred.id).trim();

                finalByIdMap.delete(existingIdStr);
                finalByIdMap.set(prefIdStr, preferred);
                byFingerprintMap.set(fingerprint, prefIdStr);

                const existingAliases = aliasIdsByCanonicalId.get(existingIdStr) || new Set([existingIdStr]);
                const candidateAliases = aliasIdsByCanonicalId.get(idStr) || new Set([idStr]);
                for (const a of candidateAliases) existingAliases.add(a);
                aliasIdsByCanonicalId.delete(existingIdStr);
                aliasIdsByCanonicalId.set(prefIdStr, existingAliases);
                continue;
            }
        }

        finalByIdMap.set(idStr, child);
        if (fingerprint) {
            byFingerprintMap.set(fingerprint, idStr);
        }
    }

    // Step 4: Build authoritative return structures
    const activeChildren = Array.from(finalByIdMap.values());
    const childrenByClassMap = new Map();
    const activeChildIdSetByClass = new Map();
    const childMapById = new Map();

    for (const child of activeChildren) {
        const syncKey = child.syncKey;
        const canonicalIdStr = String(child.id).trim();

        if (!childrenByClassMap.has(syncKey)) {
            childrenByClassMap.set(syncKey, []);
        }
        childrenByClassMap.get(syncKey).push(child);

        if (!activeChildIdSetByClass.has(syncKey)) {
            activeChildIdSetByClass.set(syncKey, new Set());
        }
        const classIdSet = activeChildIdSetByClass.get(syncKey);

        const aliases = aliasIdsByCanonicalId.get(canonicalIdStr) || new Set([canonicalIdStr]);
        aliases.add(canonicalIdStr);
        if (child.cloudId) aliases.add(String(child.cloudId).trim());

        for (const aliasId of aliases) {
            if (!aliasId) continue;
            classIdSet.add(aliasId);
            childMapById.set(aliasId, child);
        }
    }

    return {
        activeChildren,
        childrenByClassMap,
        activeChildIdSetByClass,
        childMapById
    };
};

/**
 * Checks whether an attendance record represents an active "present" status.
 * Critical Rule #1: Ignore any record where isDeleted === true, status === 'absent',
 * status === 'excused', present === false, or attended === false.
 */
export const isAttendanceRecordPresent = (r) => {
    if (!r || r.isDeleted === true) return false;
    if (r.status === 'absent' || r.status === 'excused') return false;
    if (r.present === false || r.attended === false) return false;
    return true;
};

/**
 * 2. Canonical Validated Attendance Resolver
 * Enforces:
 * - Rule #1: Active present status (excludes isDeleted, absent, excused, present=false, attended=false)
 * - Rule #2: Authoritative Child & Class Join (must exist in canonicalData.childMapById; attributed to child.syncKey)
 * - Rule #3: Strict Deduplication per Child (unique canonicalChild.id Set per attendance type; never mixes service + liturgy + tasbeha)
 *
 * @param {Array} allAttendance - Raw attendance rows from Dexie
 * @param {Object} canonicalData - Result of getCanonicalActiveChildren()
 * @param {Object} options - Optional filters: { targetSyncKey, exactDate, startDate, endDate }
 */
export const getValidatedClassAttendance = (allAttendance = [], canonicalData, options = {}) => {
    const safeCanonical = canonicalData || getCanonicalActiveChildren([]);
    const { childMapById, childrenByClassMap, activeChildren } = safeCanonical;

    const {
        targetSyncKey = null,
        exactDate = null,
        startDate = null,
        endDate = null
    } = options;

    const cleanTargetKey = (
        targetSyncKey &&
        targetSyncKey !== 'all' &&
        targetSyncKey !== 'ALL_CHURCH' &&
        targetSyncKey !== 'MASTER_ACCESS' &&
        targetSyncKey !== 'ADMIN_MODE' &&
        targetSyncKey !== 'STAGE_ADMIN'
    )
        ? String(targetSyncKey).trim()
        : null;

    // Global deduplicated Sets of canonical child IDs (String(canonicalChild.id))
    const servicePresentIds = new Set();
    const liturgyPresentIds = new Set();
    const tasbehaPresentIds = new Set();
    const visitationPresentIds = new Set();

    const explicitAbsentServiceIds = new Set();
    const explicitExcusedServiceIds = new Set();

    // Per-class deduplicated Sets
    const classSetsMap = new Map();

    const ensureClassEntry = (syncKey) => {
        if (!classSetsMap.has(syncKey)) {
            classSetsMap.set(syncKey, {
                servicePresentIds: new Set(),
                liturgyPresentIds: new Set(),
                tasbehaPresentIds: new Set(),
                visitationPresentIds: new Set(),
                explicitAbsentServiceIds: new Set(),
                explicitExcusedServiceIds: new Set()
            });
        }
        return classSetsMap.get(syncKey);
    };

    // Pre-initialize all known classes from childrenByClassMap so classes with 0 attendance still exist in byClass
    for (const syncKey of childrenByClassMap.keys()) {
        if (!cleanTargetKey || syncKey === cleanTargetKey) {
            ensureClassEntry(syncKey);
        }
    }

    // Track latest record per (date, canonicalChildId, type) so if both 'present' and 'absent' rows exist on the same date, the latest wins
    const deduplicatedRowsMap = new Map();

    for (const r of (allAttendance || [])) {
        if (!r || r.isDeleted === true) continue;
        if (!r.date || !r.type || r.childId == null) continue;

        const rDate = String(r.date).split('T')[0];
        if (exactDate && rDate !== exactDate) continue;
        if (startDate && rDate < startDate) continue;
        if (endDate && rDate > endDate) continue;

        // CRITICAL RULE #2: Look up r.childId in canonicalData.childMapById
        const rawChildIdStr = String(r.childId).trim();
        const canonicalChild = childMapById.get(rawChildIdStr);
        if (!canonicalChild) {
            // Child was deleted or is a ghost/orphaned record -> IGNORE completely!
            continue;
        }

        // Always attribute to the child's authoritative syncKey
        const authoritativeSyncKey = canonicalChild.syncKey;
        if (cleanTargetKey && authoritativeSyncKey !== cleanTargetKey) {
            continue;
        }

        const canonicalIdStr = String(canonicalChild.id).trim();
        const rowKey = `${rDate}::${canonicalIdStr}::${r.type}`;
        const existingRow = deduplicatedRowsMap.get(rowKey);

        if (!existingRow) {
            deduplicatedRowsMap.set(rowKey, { record: r, canonicalChild, canonicalIdStr, authoritativeSyncKey });
        } else {
            const existingTime = existingRow.record.updatedAt ? new Date(existingRow.record.updatedAt).getTime() : 0;
            const candidateTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
            if (candidateTime >= existingTime) {
                deduplicatedRowsMap.set(rowKey, { record: r, canonicalChild, canonicalIdStr, authoritativeSyncKey });
            }
        }
    }

    // Process deduplicated valid records
    for (const { record: r, canonicalIdStr, authoritativeSyncKey } of deduplicatedRowsMap.values()) {
        const classEntry = ensureClassEntry(authoritativeSyncKey);

        if (isAttendanceRecordPresent(r)) {
            if (r.type === 'service') {
                servicePresentIds.add(canonicalIdStr);
                classEntry.servicePresentIds.add(canonicalIdStr);
            } else if (r.type === 'liturgy') {
                liturgyPresentIds.add(canonicalIdStr);
                classEntry.liturgyPresentIds.add(canonicalIdStr);
            } else if (r.type === 'tasbeha') {
                tasbehaPresentIds.add(canonicalIdStr);
                classEntry.tasbehaPresentIds.add(canonicalIdStr);
            } else if (r.type === 'visitation') {
                visitationPresentIds.add(canonicalIdStr);
                classEntry.visitationPresentIds.add(canonicalIdStr);
            }
        } else if (r.type === 'service') {
            if (r.status === 'absent') {
                explicitAbsentServiceIds.add(canonicalIdStr);
                classEntry.explicitAbsentServiceIds.add(canonicalIdStr);
            } else if (r.status === 'excused') {
                explicitExcusedServiceIds.add(canonicalIdStr);
                classEntry.explicitExcusedServiceIds.add(canonicalIdStr);
            }
        }
    }

    // If a child attended service at least once in the queried range, remove them from absent/excused sets
    for (const presentId of servicePresentIds) {
        explicitAbsentServiceIds.delete(presentId);
        explicitExcusedServiceIds.delete(presentId);
    }

    // Scoped active children for this query
    const scopedActiveChildren = cleanTargetKey
        ? (childrenByClassMap.get(cleanTargetKey) || [])
        : activeChildren;

    // Resolve exact Child object lists
    const whoAttendedServiceList = scopedActiveChildren.filter(c => servicePresentIds.has(String(c.id).trim()));
    const whoAttendedLiturgyList = scopedActiveChildren.filter(c => liturgyPresentIds.has(String(c.id).trim()));
    const whoAttendedTasbehaList = scopedActiveChildren.filter(c => tasbehaPresentIds.has(String(c.id).trim()));
    const whoVisitedList = scopedActiveChildren.filter(c => visitationPresentIds.has(String(c.id).trim()));
    const whoAbsentServiceList = scopedActiveChildren.filter(c => !servicePresentIds.has(String(c.id).trim()));
    const whoExplicitAbsentServiceList = scopedActiveChildren.filter(c => explicitAbsentServiceIds.has(String(c.id).trim()));
    const whoExplicitExcusedServiceList = scopedActiveChildren.filter(c => explicitExcusedServiceIds.has(String(c.id).trim()));

    // Build per-class breakdown
    const byClass = {};
    for (const [syncKey, sets] of classSetsMap.entries()) {
        for (const pId of sets.servicePresentIds) {
            sets.explicitAbsentServiceIds.delete(pId);
            sets.explicitExcusedServiceIds.delete(pId);
        }

        const classChildren = childrenByClassMap.get(syncKey) || [];
        const totalActiveChildren = classChildren.length;

        const classWhoAttendedService = classChildren.filter(c => sets.servicePresentIds.has(String(c.id).trim()));
        const classWhoAttendedLiturgy = classChildren.filter(c => sets.liturgyPresentIds.has(String(c.id).trim()));
        const classWhoAttendedTasbeha = classChildren.filter(c => sets.tasbehaPresentIds.has(String(c.id).trim()));
        const classWhoVisited = classChildren.filter(c => sets.visitationPresentIds.has(String(c.id).trim()));
        const classWhoAbsentService = classChildren.filter(c => !sets.servicePresentIds.has(String(c.id).trim()));

        // Guaranteed <= totalActiveChildren
        const presentCount = classWhoAttendedService.length;
        const liturgyCount = classWhoAttendedLiturgy.length;
        const tasbehaCount = classWhoAttendedTasbeha.length;
        const visitationCount = classWhoVisited.length;

        byClass[syncKey] = {
            syncKey,
            totalActiveChildren,
            presentCount,
            liturgyCount,
            tasbehaCount,
            visitationCount,
            attendanceCount: presentCount,
            totalVisitationRecords: visitationCount,
            hasRecordedAttendance: presentCount > 0,
            hasRecordedVisitation: visitationCount > 0,
            servicePresentIds: sets.servicePresentIds,
            liturgyPresentIds: sets.liturgyPresentIds,
            tasbehaPresentIds: sets.tasbehaPresentIds,
            visitationPresentIds: sets.visitationPresentIds,
            whoAttendedServiceList: classWhoAttendedService,
            whoAttendedLiturgyList: classWhoAttendedLiturgy,
            whoAttendedTasbehaList: classWhoAttendedTasbeha,
            whoVisitedList: classWhoVisited,
            whoAbsentServiceList: classWhoAbsentService
        };
    }

    return {
        totalActiveChildren: scopedActiveChildren.length,
        presentCount: whoAttendedServiceList.length,
        liturgyCount: whoAttendedLiturgyList.length,
        tasbehaCount: whoAttendedTasbehaList.length,
        visitationCount: whoVisitedList.length,
        servicePresentIds,
        liturgyPresentIds,
        tasbehaPresentIds,
        visitationPresentIds,
        explicitAbsentServiceIds,
        explicitExcusedServiceIds,
        whoAttendedServiceList,
        whoAttendedLiturgyList,
        whoAttendedTasbehaList,
        whoVisitedList,
        whoAbsentServiceList,
        whoExplicitAbsentServiceList,
        whoExplicitExcusedServiceList,
        byClass
    };
};

/**
 * 🧹 Cleans up duplicate (date, childId, type) rows and orphaned attendance rows in Dexie
 * (and optionally removes orphaned cloud docs in Firestore when requested).
 */
export const cleanupDuplicateAndOrphanedAttendance = async ({ removeCloudOrphans = false } = {}) => {
    try {
        const allChildren = await db.children.toArray();
        const allAttendance = await db.attendance.toArray();

        // Only purge orphans if we actually have children loaded in the database
        const hasLoadedChildren = allChildren.some(c => !c.isDeleted);
        const canonicalData = getCanonicalActiveChildren(allChildren);
        const { childMapById } = canonicalData;

        const idsToDelete = [];
        const cloudDocsToDelete = [];
        const recordsToUpdate = [];

        const seenByDateChildType = new Map(); // `${date}::${canonicalChildId}::${type}` -> record

        for (const r of allAttendance) {
            if (!r || r.id == null) continue;

            // 1. Purge already soft-deleted clean records
            if (r.isDeleted === true && !r.isDirty) {
                idsToDelete.push(r.id);
                continue;
            }
            if (r.isDeleted === true) continue;

            // 2. Check if child exists in canonical active children
            const rawChildIdStr = String(r.childId ?? '').trim();
            const canonicalChild = childMapById.get(rawChildIdStr);

            if (hasLoadedChildren && !canonicalChild) {
                idsToDelete.push(r.id);
                if (removeCloudOrphans && r.syncKey && r.date && r.childId && r.type) {
                    cloudDocsToDelete.push({
                        syncKey: String(r.syncKey).trim(),
                        docId: `${r.date}_${r.childId}_${r.type}`
                    });
                }
                continue;
            }

            const canonicalIdStr = canonicalChild ? String(canonicalChild.id).trim() : rawChildIdStr;
            const authoritativeSyncKey = canonicalChild ? canonicalChild.syncKey : String(r.syncKey || '').trim();
            const dateStr = String(r.date || '').split('T')[0];
            const typeStr = String(r.type || '').trim();

            if (!dateStr || !canonicalIdStr || !typeStr) {
                idsToDelete.push(r.id);
                continue;
            }

            // 3. Deduplicate by (date, canonicalChildId, type)
            const key = `${dateStr}::${canonicalIdStr}::${typeStr}`;
            const existing = seenByDateChildType.get(key);

            if (!existing) {
                seenByDateChildType.set(key, { record: r, canonicalIdStr, authoritativeSyncKey });
            } else {
                const existingTime = existing.record.updatedAt ? new Date(existing.record.updatedAt).getTime() : 0;
                const candidateTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;

                if (candidateTime >= existingTime) {
                    idsToDelete.push(existing.record.id);
                    seenByDateChildType.set(key, { record: r, canonicalIdStr, authoritativeSyncKey });
                } else {
                    idsToDelete.push(r.id);
                }
            }
        }

        // 4. Ensure remaining valid records have canonical childId and authoritative syncKey
        for (const { record: r, canonicalIdStr, authoritativeSyncKey } of seenByDateChildType.values()) {
            const needsSyncKeyFix = authoritativeSyncKey && r.syncKey !== authoritativeSyncKey;
            const needsChildIdFix = String(r.childId) !== canonicalIdStr;
            if (needsSyncKeyFix || needsChildIdFix) {
                recordsToUpdate.push({
                    id: r.id,
                    changes: {
                        syncKey: authoritativeSyncKey || r.syncKey,
                        childId: canonicalIdStr
                    }
                });
            }
        }

        if (idsToDelete.length > 0) {
            await db.attendance.bulkDelete(idsToDelete);
        }

        for (const item of recordsToUpdate) {
            await db.attendance.update(item.id, item.changes);
        }

        if (removeCloudOrphans && navigator.onLine && cloudDocsToDelete.length > 0) {
            for (const { syncKey, docId } of cloudDocsToDelete) {
                if (!syncKey || syncKey === 'MASTER_ACCESS' || syncKey === 'ADMIN_MODE' || syncKey === 'STAGE_ADMIN') continue;
                try {
                    await deleteDoc(doc(firestore, 'Osras', syncKey, 'attendance', docId));
                } catch (_e) {
                    // Ignore cloud deletion errors
                }
            }
        }

        return {
            deletedCount: idsToDelete.length,
            fixedCount: recordsToUpdate.length,
            totalCleaned: idsToDelete.length + recordsToUpdate.length
        };
    } catch (err) {
        console.error('Error cleaning up attendance records:', err);
        return { deletedCount: 0, fixedCount: 0, totalCleaned: 0, error: err.message };
    }
};

