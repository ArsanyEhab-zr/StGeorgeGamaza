import React, { useState, useEffect } from 'react';
import useNetworkStatus from '../hooks/useNetworkStatus';

export default function GlobalSyncBadge() {
    const { isOnline } = useNetworkStatus();
    const [syncState, setSyncState] = useState({
        status: 'idle', // 'idle' | 'syncing' | 'success' | 'error'
        lastSyncedAt: null,
    });

    useEffect(() => {
        const handleSyncEvent = (e) => {
            const detail = e.detail;
            setSyncState(prev => {
                const newState = { ...prev, status: detail.status };
                if (detail.time) {
                    newState.lastSyncedAt = detail.time;
                }
                return newState;
            });

            if (detail.status === 'success' || detail.status === 'error') {
                setTimeout(() => {
                    setSyncState(prev => ({ ...prev, status: 'idle' }));
                }, 3000);
            }
        };

        window.addEventListener('global-sync-status', handleSyncEvent);
        
        const handleManualTrigger = async () => {
            const { syncDataWithCloud } = await import('../db/sync.js');
            syncDataWithCloud();
        };
        window.addEventListener('trigger-manual-sync', handleManualTrigger);

        return () => {
            window.removeEventListener('global-sync-status', handleSyncEvent);
            window.removeEventListener('trigger-manual-sync', handleManualTrigger);
        };
    }, []);

    // 🌟 If offline
    if (!isOnline) {
        return (
            <div 
                className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-slate-700/50 shadow-lg select-none transition-all duration-300 pointer-events-auto"
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-red-500"></span>
                </span>
                <span className="hidden sm:inline text-[10px] sm:text-xs font-black text-slate-200">أوفلاين</span>
            </div>
        );
    }

    // 🌟 If idle
    if (syncState.status === 'idle') {
        return (
            <div 
                className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-slate-200 shadow-sm cursor-pointer select-none transition-all duration-300 opacity-50 hover:opacity-100 pointer-events-auto hover:scale-105"
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-manual-sync'))}
                title="اضغط للمزامنة الآن"
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
                </span>
                <span className="hidden sm:inline text-[10px] sm:text-xs font-black text-slate-500">متصل</span>
            </div>
        );
    }

    // 🌟 If syncing
    if (syncState.status === 'syncing') {
        return (
            <div 
                className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.2)] select-none transition-all duration-300 pointer-events-auto"
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-full w-full bg-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.8)]"></span>
                </span>
                <span className="hidden sm:inline text-[10px] sm:text-xs font-black text-amber-600">جاري المزامنة...</span>
            </div>
        );
    }

    // 🌟 If success
    if (syncState.status === 'success') {
        return (
            <div 
                className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)] select-none transition-all duration-300 pointer-events-auto"
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                </span>
                <span className="hidden sm:inline text-[10px] sm:text-xs font-black text-emerald-600">تم التحديث</span>
            </div>
        );
    }

    // 🌟 If error
    if (syncState.status === 'error') {
        return (
            <div 
                className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.2)] cursor-pointer select-none transition-all duration-300 hover:scale-105 pointer-events-auto"
                title="تعذر المزامنة - اضغط لإعادة المحاولة"
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-manual-sync'))}
                dir="rtl"
            >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="relative inline-flex rounded-full h-full w-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                </span>
                <span className="hidden sm:inline text-[10px] sm:text-xs font-black text-rose-600">خطأ مزامنة</span>
            </div>
        );
    }

    return null;
}
