import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { getServiceWeekRange } from '../utils/serviceWeek';
import { getCanonicalActiveChildren, getValidatedClassAttendance } from '../utils/churchDataEngine';

/**
 * Hook to compute real-time weekly class activity (SSOT)
 * Tracks whether classes have recorded service attendance or logged visitation
 * during the current Thursday-to-Wednesday service week cycle, strictly validated
 * against active canonical children of each class.
 */
export function useWeeklyClassActivity() {
    const weekRange = getServiceWeekRange();

    const activityByClass = useLiveQuery(async () => {
        try {
            const [allChildren, weekRecords] = await Promise.all([
                db.children.toArray(),
                db.attendance
                    .where('date')
                    .between(weekRange.startDate, weekRange.endDate, true, true)
                    .toArray()
            ]);

            const canonicalData = getCanonicalActiveChildren(allChildren);
            const validated = getValidatedClassAttendance(weekRecords, canonicalData, {
                startDate: weekRange.startDate,
                endDate: weekRange.endDate
            });

            return validated.byClass || {};
        } catch (err) {
            console.error('Error computing weekly class activity:', err);
            return {};
        }
    }, [weekRange.startDate, weekRange.endDate]) || {};

    return {
        activityByClass,
        weekRange
    };
}
