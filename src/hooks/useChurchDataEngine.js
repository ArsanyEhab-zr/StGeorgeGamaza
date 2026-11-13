import { scopedSyncKeys } from '../db/childSync';
import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import {
    getCanonicalActiveChildren,
    getValidatedClassAttendance,
    cleanupDuplicateAndOrphanedAttendance
} from '../utils/churchDataEngine';
import { getServiceWeekRange, getDefaultServiceDateForClass } from '../utils/serviceWeek';

let hasRunAutoCleanupInSession = false;
const COUNTS_SNAPSHOT_KEY = 'church_counts_snapshot_v1';
let memoryCountsSnapshot = null;

function readCachedCountsSnapshot(currentWeekStartDate) {
    try {
        const raw = memoryCountsSnapshot || (
            typeof window !== 'undefined' && window.localStorage
                ? JSON.parse(localStorage.getItem(COUNTS_SNAPSHOT_KEY) || 'null')
                : null
        );
        if (!raw || typeof raw !== 'object') {
            return { classCounts: {}, byClass: {}, hasSnapshot: false };
        }
        memoryCountsSnapshot = raw;
        const classCounts = raw.classCounts && typeof raw.classCounts === 'object' ? { ...raw.classCounts } : {};
        const isSameWeek = raw.weekStartDate === currentWeekStartDate;
        const byClass = {};

        for (const [key, count] of Object.entries(classCounts)) {
            const savedAct = isSameWeek && raw.byClass?.[key] ? raw.byClass[key] : null;
            byClass[key] = {
                syncKey: key,
                totalActiveChildren: Number(count) || 0,
                presentCount: savedAct ? (Number(savedAct.presentCount) || 0) : 0,
                absentCount: savedAct ? (Number(savedAct.absentCount) || 0) : 0,
                liturgyCount: savedAct ? (Number(savedAct.liturgyCount) || 0) : 0,
                visitationCount: savedAct ? (Number(savedAct.visitationCount) || 0) : 0,
                hasRecordedAttendance: Boolean(savedAct?.hasRecordedAttendance),
                hasRecordedVisitation: Boolean(savedAct?.hasRecordedVisitation),
                whoAttendedServiceList: [],
                whoAbsentServiceList: [],
                whoAttendedLiturgyList: [],
                whoVisitedList: []
            };
        }

        const hasSnapshot = Object.values(classCounts).some(c => Number(c) > 0);
        return { classCounts, byClass, hasSnapshot };
    } catch (_e) {
        return { classCounts: {}, byClass: {}, hasSnapshot: false };
    }
}

function writeCachedCountsSnapshot(weekStartDate, classCounts, byClassMap) {
    try {
        if (!classCounts || !Object.values(classCounts).some(c => Number(c) > 0)) return;
        const prev = readCachedCountsSnapshot(weekStartDate);
        const mergedCounts = { ...prev.classCounts, ...classCounts };
        const mergedByClass = { ...prev.byClass };

        for (const [key, act] of Object.entries(byClassMap || {})) {
            if (!act) continue;
            mergedByClass[key] = {
                syncKey: key,
                totalActiveChildren: Number(act.totalActiveChildren ?? mergedCounts[key] ?? 0),
                presentCount: Number(act.presentCount || 0),
                absentCount: Number(act.absentCount || 0),
                liturgyCount: Number(act.liturgyCount || 0),
                visitationCount: Number(act.visitationCount || 0),
                hasRecordedAttendance: Boolean(act.hasRecordedAttendance),
                hasRecordedVisitation: Boolean(act.hasRecordedVisitation)
            };
        }

        const payload = {
            weekStartDate,
            updatedAt: Date.now(),
            classCounts: mergedCounts,
            byClass: mergedByClass
        };
        memoryCountsSnapshot = payload;
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(COUNTS_SNAPSHOT_KEY, JSON.stringify(payload));
        }
    } catch (_e) {}
}

/**
 * Resolves the effective allowed syncKeys for the current user or explicit scope argument.
 */
export function resolveEffectiveSyncKeys(scopeSyncKeys = null) {
    const allowed = new Set(scopedSyncKeys());
    if (Array.isArray(scopeSyncKeys) || scopeSyncKeys instanceof Set) {
        return new Set(Array.from(scopeSyncKeys).map(k => String(k?.syncKey || k)).filter(k => allowed.has(k)));
    }
    if (typeof scopeSyncKeys === 'string' && !['all', 'ALL_CHURCH', 'MASTER_ACCESS', 'ADMIN_MODE', 'STAGE_ADMIN'].includes(scopeSyncKeys)) {
        return new Set(allowed.has(scopeSyncKeys) ? [scopeSyncKeys] : []);
    }
    return allowed;
}

/**
 * React Hook providing the Single Source of Truth (SSOT) for:
 * - Active canonical children (deduplicated, excluding deleted/orphaned)
 * - Class rosters & exact active children counts per class
 * - Validated weekly attendance (Thursday 00:00:00 -> Wednesday 23:59:59)
 * - Optional exact-date or custom-range validated attendance
 *
 * @param {string|string[]|Set|null} scopeSyncKeys - Class syncKey, array of syncKeys, or 'all'
 * @param {Object} options - Optional { exactDate, startDate, endDate, targetSyncKey }
 */
export function useChurchDataEngine(scopeSyncKeys = null, options = {}) {
    const weekRange = getServiceWeekRange();

    // Run automatic safe deduplication & orphan cleanup once on load
    useEffect(() => {
        if (!hasRunAutoCleanupInSession) {
            hasRunAutoCleanupInSession = true;
            cleanupDuplicateAndOrphanedAttendance({ removeCloudOrphans: false }).catch(() => {});
        }
    }, []);

    const scopeDependencyKey = useMemo(() => {
        const set = resolveEffectiveSyncKeys(scopeSyncKeys);
        if (!set) return 'ALL_CONFIGURED';
        return Array.from(set).sort().join(',');
    }, [scopeSyncKeys]);

    const {
        exactDate = null,
        startDate = null,
        endDate = null,
        targetSyncKey = null
    } = options;

    const engineData = useLiveQuery(async () => {
        try {
            const effectiveAllowedKeys = resolveEffectiveSyncKeys(scopeSyncKeys);
            const allRawChildren = await db.children.toArray();
            const canonicalData = getCanonicalActiveChildren(allRawChildren, effectiveAllowedKeys);

            // Fetch attendance for the active Thursday-to-Wednesday service week
            const weekRecords = await db.attendance
                .where('date')
                .between(weekRange.startDate, weekRange.endDate, true, true)
                .toArray();

            const weeklyValidated = getValidatedClassAttendance(weekRecords, canonicalData, {
                targetSyncKey,
                startDate: weekRange.startDate,
                endDate: weekRange.endDate
            });

            // Optional exactDate or custom range validation if requested by caller (e.g. Attendance.jsx)
            let customValidated = weeklyValidated;
            if (exactDate) {
                const dateRecords = await db.attendance
                    .where('date')
                    .equals(exactDate)
                    .toArray();
                customValidated = getValidatedClassAttendance(dateRecords, canonicalData, {
                    targetSyncKey,
                    exactDate
                });
            } else if (startDate && endDate && (startDate !== weekRange.startDate || endDate !== weekRange.endDate)) {
                const rangeRecords = await db.attendance
                    .where('date')
                    .between(startDate, endDate, true, true)
                    .toArray();
                customValidated = getValidatedClassAttendance(rangeRecords, canonicalData, {
                    targetSyncKey,
                    startDate,
                    endDate
                });
            }

            // Build class counts map: { [syncKey]: number }
            const classCounts = {};
            for (const [key, list] of canonicalData.childrenByClassMap.entries()) {
                classCounts[key] = list.length;
            }

            // Persist non-empty snapshot so reloads never flash 0 / 0
            if (canonicalData.activeChildren.length > 0) {
                writeCachedCountsSnapshot(weekRange.startDate, classCounts, weeklyValidated.byClass);
            } else {
                // If local DB is momentarily empty during initial first-time cloud pull, fall back to cached counts if available
                const cached = readCachedCountsSnapshot(weekRange.startDate);
                if (cached.hasSnapshot) {
                    Object.assign(classCounts, cached.classCounts);
                    for (const [k, v] of Object.entries(cached.byClass)) {
                        if (!weeklyValidated.byClass[k]) {
                            weeklyValidated.byClass[k] = v;
                        }
                    }
                }
            }

            const scopedChildren = (
                targetSyncKey &&
                targetSyncKey !== 'all' &&
                targetSyncKey !== 'ALL_CHURCH' &&
                targetSyncKey !== 'MASTER_ACCESS' &&
                targetSyncKey !== 'ADMIN_MODE' &&
                targetSyncKey !== 'STAGE_ADMIN'
            )
                ? (canonicalData.childrenByClassMap.get(String(targetSyncKey).trim()) || [])
                : canonicalData.activeChildren;

            return {
                isLoading: false,
                isLoadingInitialData: false,
                canonicalData,
                activeChildren: scopedChildren,
                allScopedChildren: canonicalData.activeChildren,
                childrenByClassMap: canonicalData.childrenByClassMap,
                activeChildIdSetByClass: canonicalData.activeChildIdSetByClass,
                childMapById: canonicalData.childMapById,
                classCounts,
                weeklyAttendance: weeklyValidated,
                activityByClass: weeklyValidated.byClass,
                validatedAttendance: customValidated,
                weekRange
            };
        } catch (err) {
            console.error('Error in useChurchDataEngine:', err);
            const cached = readCachedCountsSnapshot(weekRange.startDate);
            const emptyCanonical = getCanonicalActiveChildren([]);
            const emptyValidated = getValidatedClassAttendance([], emptyCanonical);
            return {
                isLoading: false,
                isLoadingInitialData: false,
                canonicalData: emptyCanonical,
                activeChildren: [],
                allScopedChildren: [],
                childrenByClassMap: emptyCanonical.childrenByClassMap,
                activeChildIdSetByClass: emptyCanonical.activeChildIdSetByClass,
                childMapById: emptyCanonical.childMapById,
                classCounts: cached.classCounts,
                weeklyAttendance: { ...emptyValidated, byClass: cached.byClass },
                activityByClass: cached.byClass,
                validatedAttendance: { ...emptyValidated, byClass: cached.byClass },
                weekRange
            };
        }
    }, [
        scopeDependencyKey,
        weekRange.startDate,
        weekRange.endDate,
        exactDate,
        startDate,
        endDate,
        targetSyncKey
    ]);

    if (!engineData) {
        const cached = readCachedCountsSnapshot(weekRange.startDate);
        const emptyCanonical = getCanonicalActiveChildren([]);
        const emptyValidated = getValidatedClassAttendance([], emptyCanonical);
        const targetClassCached = targetSyncKey ? cached.byClass[String(targetSyncKey).trim()] : null;
        const cachedWeekly = {
            ...emptyValidated,
            presentCount: targetClassCached ? targetClassCached.presentCount : Object.values(cached.byClass).reduce((s, c) => s + (c.presentCount || 0), 0),
            liturgyCount: targetClassCached ? targetClassCached.liturgyCount : Object.values(cached.byClass).reduce((s, c) => s + (c.liturgyCount || 0), 0),
            visitationCount: targetClassCached ? targetClassCached.visitationCount : Object.values(cached.byClass).reduce((s, c) => s + (c.visitationCount || 0), 0),
            byClass: cached.byClass
        };
        return {
            isLoading: true,
            isLoadingInitialData: !cached.hasSnapshot,
            canonicalData: emptyCanonical,
            activeChildren: [],
            allScopedChildren: [],
            childrenByClassMap: emptyCanonical.childrenByClassMap,
            activeChildIdSetByClass: emptyCanonical.activeChildIdSetByClass,
            childMapById: emptyCanonical.childMapById,
            classCounts: cached.classCounts,
            weeklyAttendance: cachedWeekly,
            activityByClass: cached.byClass,
            validatedAttendance: cachedWeekly,
            weekRange,
            getDefaultServiceDateForClass
        };
    }

    return {
        ...engineData,
        getDefaultServiceDateForClass
    };
}

export default useChurchDataEngine;

