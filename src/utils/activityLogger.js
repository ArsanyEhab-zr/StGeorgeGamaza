// src/utils/activityLogger.js
// 📋 Central Activity Logger — Audit Trail System
// Logs every critical action to Firestore's `activityLogs` collection for full traceability.

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../db/firebase';

/**
 * Logs a critical action to the `activityLogs` Firestore collection.
 * This function is fire-and-forget — it never throws or blocks the caller.
 *
 * @param {string} actionType - Category of action (e.g., 'UPDATE_CHILD', 'DELETE_CHILD', 'RECORD_ATTENDANCE', 'ADD_CHILD', 'SAVE_NOTE', 'GLOBAL_RESET', 'GLOBAL_WIPE', 'TRANSFER_CHILDREN', 'SAVE_STRUCTURE', 'RESOLVE_INTERVENTION')
 * @param {string} details - Human-readable Arabic description of what changed.
 * @param {object} [currentUser] - Optional. The servant performing the action. Falls back to localStorage.
 */
export async function logActivity(actionType, details, currentUser) {
    try {
        // Resolve the acting user
        const servant = currentUser || JSON.parse(localStorage.getItem('currentServant') || '{}');
        const syncKey = localStorage.getItem('currentSyncKey') || 'UNKNOWN';

        const now = new Date();
        // dateKey format: YYYY-MM-DD for efficient daily filtering
        const dateKey = now.toISOString().split('T')[0];

        const logEntry = {
            servantName: servant.name || 'خادم غير معروف',
            servantPhone: servant.phone || '',
            assignedOsra: servant.assignedOsra || servant.syncKey || syncKey,
            role: servant.role || '',
            actionType,
            details,
            timestamp: serverTimestamp(),
            dateKey,
            // Client-side ISO string as fallback for ordering in case serverTimestamp is pending
            clientTimestamp: now.toISOString(),
        };

        await addDoc(collection(firestore, 'activityLogs'), logEntry);
    } catch (error) {
        // Never break the calling flow — log silently
        console.warn('📋 [ActivityLogger] Failed to log activity:', error.message);
    }
}
