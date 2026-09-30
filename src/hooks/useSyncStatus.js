import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

/**
 * 🚦 useSyncStatus — Smart 3-state sync indicator hook.
 * 
 * Returns:
 *   status: 'synced' | 'syncing' | 'offline'
 *   dirtyCount: number of un-synced records across ALL tables
 *   label: Arabic display label for the UI
 * 
 * State Machine:
 *   RED    (offline)  → !navigator.onLine
 *   YELLOW (syncing)  → online + dirtyCount > 0
 *   GREEN  (synced)   → online + dirtyCount === 0
 */
export default function useSyncStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // 🔥 Reactive query: counts ALL dirty records across every synced table
    // useLiveQuery re-fires automatically whenever any of these tables change
    const dirtyCount = useLiveQuery(async () => {
        try {
            const [children, attendance, events, grades, hymns, exams] = await Promise.all([
                db.children.where('isDirty').equals(1).count(),
                db.attendance.where('isDirty').equals(1).count(),
                db.events.where('isDirty').equals(1).count(),
                db.grades.where('isDirty').equals(1).count(),
                db.hymns.where('isDirty').equals(1).count(),
                db.exams.where('isDirty').equals(1).count(),
            ]);
            return children + attendance + events + grades + hymns + exams;
        } catch {
            return 0;
        }
    }, [], 0);

    // Derive 3-state
    if (!isOnline) {
        return { status: 'offline', dirtyCount, label: 'أوفلاين' };
    }
    if (dirtyCount > 0) {
        return { status: 'syncing', dirtyCount, label: 'جاري الرفع...' };
    }
    return { status: 'synced', dirtyCount: 0, label: 'مباشر' };
}
