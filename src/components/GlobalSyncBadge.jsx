import React, { useState, useEffect } from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';
import useSyncStatus from '../hooks/useSyncStatus';

export default function GlobalSyncBadge() {
    const { isOnline } = useNetworkStatus();
    const { dirtyCount } = useSyncStatus();
    const [visible, setVisible] = useState(false);
    const [syncState, setSyncState] = useState({
        status: 'idle', // 'idle' | 'syncing' | 'success' | 'error'
        lastSyncedAt: null,
    });

    useEffect(() => {
        let hideTimer = null;
        let safetyTimer = null;
        const handleSyncEvent = (e) => {
            const detail = e.detail || {};
            setVisible(true);
            clearTimeout(safetyTimer);
            if (detail.status === 'syncing') safetyTimer = setTimeout(() => {
                setSyncState(prev => ({ ...prev, status: 'error' }));
                hideTimer = setTimeout(() => setVisible(false), 2000);
            }, 8000);
            setSyncState(prev => ({
                ...prev,
                status: detail.status === 'idle' && detail.outcome === 'error' ? 'error' : (detail.status || 'idle'),
                lastSyncedAt: detail.time || prev.lastSyncedAt,
            }));

            if (hideTimer) clearTimeout(hideTimer);
            if (detail.status === 'idle' || detail.status === 'success' || detail.status === 'error') {
                hideTimer = setTimeout(() => {
                    setSyncState(prev => ({ ...prev, status: 'idle' }));
                    setVisible(false);
                }, 2000);
            }
        };

        window.addEventListener('global-sync-status', handleSyncEvent);

        const handleManualTrigger = async () => {
            const { syncDataWithCloud } = await import('../db/sync.js');
            syncDataWithCloud();
        };
        window.addEventListener('trigger-manual-sync', handleManualTrigger);

        return () => {
            if (hideTimer) clearTimeout(hideTimer);
            clearTimeout(safetyTimer);
            window.removeEventListener('global-sync-status', handleSyncEvent);
            window.removeEventListener('trigger-manual-sync', handleManualTrigger);
        };
    }, []);

    const basePositionClass =
        'fixed bottom-4 left-4 z-[90] no-print flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg select-none transition-all duration-300 pointer-events-auto max-w-[calc(100vw-2rem)]';

    // 1. Offline
    if (!isOnline) {
        return (
            <div
                className={`${basePositionClass} bg-slate-900/85 border border-slate-700/70`}
                dir="rtl"
                title="لا يوجد اتصال بالإنترنت — التعديلات محفوظة محلياً"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-red-500"></span>
                </span>
                <span className="text-[11px] font-black text-slate-100 truncate">
                    أوفلاين{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
                </span>
            </div>
        );
    }

    if (!visible) return null;

    // 2. Actively syncing
    if (syncState.status === 'syncing') {
        return (
            <div
                className={`${basePositionClass} bg-white/95 border border-amber-300 shadow-[0_4px_20px_rgba(251,191,36,0.25)]`}
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-full w-full bg-amber-500"></span>
                </span>
                <span className="text-[11px] font-black text-amber-700">جاري المزامنة...</span>
            </div>
        );
    }

    // 3. Sync error
    if (syncState.status === 'error') {
        return (
            <button
                type="button"
                className={`${basePositionClass} bg-white/95 border border-rose-300 shadow-[0_4px_20px_rgba(244,63,94,0.2)] cursor-pointer hover:scale-105 active:scale-95`}
                title="تعذر المزامنة - اضغط لإعادة المحاولة"
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-manual-sync'))}
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-rose-500"></span>
                </span>
                <span className="text-[11px] font-black text-rose-700">خطأ مزامنة (إعادة)</span>
            </button>
        );
    }

    // 4. Sync just completed (auto-hides after 2s)
    if (syncState.status === 'success' || (syncState.status === 'idle' && dirtyCount === 0)) {
        return (
            <div
                className={`${basePositionClass} bg-white/95 border border-emerald-300 shadow-[0_4px_20px_rgba(16,185,129,0.2)]`}
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-black text-emerald-700">تم التحديث</span>
            </div>
        );
    }

    // 5. Pending local changes waiting to sync
    if (dirtyCount > 0) {
        return (
            <button
                type="button"
                className={`${basePositionClass} bg-amber-50/95 border border-amber-300 cursor-pointer hover:scale-105 active:scale-95`}
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-manual-sync'))}
                title="توجد تعديلات محلية معلقة — اضغط للمزامنة الآن"
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-pulse relative inline-flex rounded-full h-full w-full bg-amber-500"></span>
                </span>
                <span className="text-[11px] font-black text-amber-800">بانتظار الرفع ({dirtyCount})</span>
            </button>
        );
    }

    // 6. Online, idle, and fully synced: hide automatically so it never crowds the UI
    return null;
}
