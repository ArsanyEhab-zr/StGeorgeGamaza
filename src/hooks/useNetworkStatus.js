import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 🌐 useNetworkStatus — Global hook for online/offline detection + auto-sync on reconnect.
 * Mount once at App level. Automatically triggers silent background sync when the device comes back online.
 */
export default function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const isSyncingRef = useRef(false);

    const runBackgroundSync = useCallback(async () => {
        if (isSyncingRef.current) return; // Prevent concurrent syncs
        isSyncingRef.current = true;
        try {
            // Dynamic import to avoid circular dependencies and reduce initial bundle
            const { syncDataWithCloud } = await import('../db/sync.js');
            const result = await syncDataWithCloud();
            console.log('🔄 [AutoSync] Background sync completed:', result.success ? '✅' : '❌', result.message?.slice(0, 80));
        } catch (err) {
            console.warn('🔄 [AutoSync] Background sync failed silently:', err.message);
        } finally {
            isSyncingRef.current = false;
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            console.log('🟢 [Network] Back online — triggering background sync...');
            runBackgroundSync();
        };

        const handleOffline = () => {
            setIsOnline(false);
            console.log('🟠 [Network] Gone offline — working locally.');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial sync on mount if online
        if (navigator.onLine) {
            runBackgroundSync();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [runBackgroundSync]);

    return { isOnline };
}
