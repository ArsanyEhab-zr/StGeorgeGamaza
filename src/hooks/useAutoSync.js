import { useRef, useCallback } from 'react';

/**
 * 🚀 useAutoSync — Smart write trigger hook.
 * After any local Dexie write, call triggerAutoSync() to schedule a debounced background push.
 * Only fires if the device is online. Silent — no alerts, no UI feedback.
 */
export default function useAutoSync(debounceMs = 3000) {
    const timerRef = useRef(null);
    const isSyncingRef = useRef(false);

    const triggerAutoSync = useCallback(() => {
        // Only sync if online
        if (!navigator.onLine) return;

        // Clear any existing debounce timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(async () => {
            if (isSyncingRef.current) return; // Prevent concurrent syncs
            isSyncingRef.current = true;
            try {
                const { syncDataWithCloud } = await import('../db/sync.js');
                const result = await syncDataWithCloud();
                console.log('⚡ [SmartSync] Debounced sync completed:', result.success ? '✅' : '❌');
            } catch (err) {
                console.warn('⚡ [SmartSync] Debounced sync failed silently:', err.message);
            } finally {
                isSyncingRef.current = false;
            }
        }, debounceMs);
    }, [debounceMs]);

    return { triggerAutoSync };
}
