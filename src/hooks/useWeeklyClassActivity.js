import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { getServiceWeekRange } from '../utils/serviceWeek';

/**
 * Hook to compute real-time weekly class activity (Requirement #2)
 * Tracks whether classes have recorded attendance or logged visitation
 * during the current Friday-to-Thursday service week cycle.
 */
export function useWeeklyClassActivity() {
    const weekRange = getServiceWeekRange();

    const activityByClass = useLiveQuery(async () => {
        try {
            const records = await db.attendance
                .where('date')
                .between(weekRange.startDate, weekRange.endDate, true, true)
                .toArray();

            const activeRecords = (records || []).filter(r => !r.isDeleted);
            const map = {};

            activeRecords.forEach(r => {
                const syncKey = String(r.syncKey || '');
                if (!syncKey) return;

                if (!map[syncKey]) {
                    map[syncKey] = {
                        syncKey,
                        hasRecordedAttendance: false,
                        presentKidsSet: new Set(),
                        attendanceCount: 0,
                        hasRecordedVisitation: false,
                        visitedKidsSet: new Set(),
                        visitationCount: 0
                    };
                }

                if (r.type === 'service' || r.type === 'liturgy' || r.type === 'tasbeha') {
                    map[syncKey].hasRecordedAttendance = true;
                    map[syncKey].attendanceCount++;
                    if (r.status === 'present') {
                        map[syncKey].presentKidsSet.add(String(r.childId));
                    }
                } else if (r.type === 'visitation') {
                    map[syncKey].hasRecordedVisitation = true;
                    map[syncKey].visitationCount++;
                    map[syncKey].visitedKidsSet.add(String(r.childId));
                }
            });

            const result = {};
            Object.keys(map).forEach(key => {
                result[key] = {
                    syncKey: key,
                    hasRecordedAttendance: map[key].hasRecordedAttendance,
                    presentCount: map[key].presentKidsSet.size,
                    attendanceCount: map[key].attendanceCount,
                    hasRecordedVisitation: map[key].hasRecordedVisitation,
                    visitationCount: map[key].visitedKidsSet.size,
                    totalVisitationRecords: map[key].visitationCount
                };
            });

            return result;
        } catch (err) {
            console.error("Error computing weekly class activity:", err);
            return {};
        }
    }, [weekRange.startDate, weekRange.endDate]) || {};

    return {
        activityByClass,
        weekRange
    };
}
