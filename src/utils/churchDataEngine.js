import { groupChildren, preferredChild, childAliases, childNameKey, resolveAttendanceChild, attendanceIdentity, timestamp } from './childIdentity';
import { db } from '../db/database';

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
    } catch {
        return null;
    }
};

/**
 * Helper to compare two child records and pick the more authoritative / newer one.
 */
/**
 * 1. Canonical Active Children Resolver
 * Strictly excludes deleted or nameless records, normalizes syncKey, and deduplicates
 * by canonical ID (id / cloudId) and by (syncKey + normalized Arabic 4-part name + phone).
 *
 * @param {Array} allChildren - Raw children array from Dexie
 * @param {Array|Set|null} allowedSyncKeys - Optional set/array of allowed class syncKeys
 */
export const getCanonicalActiveChildren = (allChildren = [], allowedSyncKeys = null) => {
    const allowed = allowedSyncKeys == null ? null : new Set(Array.from(allowedSyncKeys).map(String));
    const groups = groupChildren(allChildren.filter(c => c && c.syncKey && (!allowed || allowed.has(String(c.syncKey)))));
    const activeChildren = groups.map(preferredChild).filter(c => !c.isDeleted && c.name && !['MASTER_ACCESS', 'ADMIN_MODE', 'STAGE_ADMIN'].includes(c.syncKey));
    const childrenByClassMap = new Map(), activeChildIdSetByClass = new Map(), childMapById = new Map();
    for (const child of activeChildren) {
        if (!childrenByClassMap.has(child.syncKey)) childrenByClassMap.set(child.syncKey, []);
        childrenByClassMap.get(child.syncKey).push(child);
        if (!activeChildIdSetByClass.has(child.syncKey)) activeChildIdSetByClass.set(child.syncKey, new Set());
        for (const alias of childAliases(child)) {
            activeChildIdSetByClass.get(child.syncKey).add(alias);
            childMapById.set(alias, child);
            childMapById.set(`${child.syncKey}::id::${alias}`, child);
        }
        childMapById.set(childNameKey(child), child);
    }
    return { activeChildren, childrenByClassMap, activeChildIdSetByClass, childMapById };
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
    const { childrenByClassMap, activeChildren } = safeCanonical;

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
                recordedService: false,
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
        if (!r) continue;
        if (!r.date || !r.type) continue;

        const rDate = String(r.date).split('T')[0];
        if (exactDate && rDate !== exactDate) continue;
        if (startDate && rDate < startDate) continue;
        if (endDate && rDate > endDate) continue;

        // CRITICAL RULE #2: Look up r.childId in canonicalData.childMapById
        const canonicalChild = resolveAttendanceChild(r, safeCanonical);
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
        if (r.isDeleted) continue;
        if (r.type === 'service') classEntry.recordedService = true;

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
            hasRecordedAttendance: sets.recordedService,
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
export const consolidateLocalDexieDuplicates = async () => db.transaction('rw', db.children, db.attendance, async () => {
    const children = await db.children.toArray();
    const canonical = getCanonicalActiveChildren(children);
    let deletedCount = 0, fixedCount = 0;
    for (const group of groupChildren(children)) {
        if (group.length < 2) continue;
        const winner = preferredChild(group);
        // Keep the local primary key stable; cloudId remains the transport identifier.
        await db.children.put({ ...winner, isDirty: group.some(c => c.isDirty) });
        for (const child of group) if (child.id !== winner.id) { await db.children.delete(child.id); deletedCount++; }
    }
    const seen = new Map();
    for (const row of await db.attendance.toArray()) {
        const child = resolveAttendanceChild(row, canonical);
        if (!child) continue; // An incomplete class download is never proof of an orphan.
        const updated = { ...row, ...attendanceIdentity(child) };
        const key = `${child.syncKey}::${row.date}::${updated.childId}::${row.type}`;
        const previous = seen.get(key);
        if (!previous || timestamp(row.updatedAt) >= timestamp(previous.updatedAt)) {
            if (previous) { await db.attendance.delete(previous.id); deletedCount++; }
            seen.set(key, updated);
        } else { await db.attendance.delete(row.id); deletedCount++; }
    }
    for (const row of seen.values()) { await db.attendance.put(row); fixedCount++; }
    return { deletedCount, fixedCount, totalCleaned: deletedCount + fixedCount };
});
export const cleanupDuplicateAndOrphanedAttendance = consolidateLocalDexieDuplicates;
