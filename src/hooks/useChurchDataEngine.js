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
            const emptyCanonical = getCanonicalActiveChildren([]);
            const emptyValidated = getValidatedClassAttendance([], emptyCanonical);
            return {
                isLoading: false,
                canonicalData: emptyCanonical,
                activeChildren: [],
                allScopedChildren: [],
                childrenByClassMap: emptyCanonical.childrenByClassMap,
                activeChildIdSetByClass: emptyCanonical.activeChildIdSetByClass,
                childMapById: emptyCanonical.childMapById,
                classCounts: {},
                weeklyAttendance: emptyValidated,
                activityByClass: {},
                validatedAttendance: emptyValidated,
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
        const emptyCanonical = getCanonicalActiveChildren([]);
        const emptyValidated = getValidatedClassAttendance([], emptyCanonical);
        return {
            isLoading: true,
            canonicalData: emptyCanonical,
            activeChildren: [],
            allScopedChildren: [],
            childrenByClassMap: emptyCanonical.childrenByClassMap,
            activeChildIdSetByClass: emptyCanonical.activeChildIdSetByClass,
            childMapById: emptyCanonical.childMapById,
            classCounts: {},
            weeklyAttendance: emptyValidated,
            activityByClass: {},
            validatedAttendance: emptyValidated,
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

