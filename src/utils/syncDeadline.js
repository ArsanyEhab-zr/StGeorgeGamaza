export const SYNC_TIMEOUT_MS = 30000;

export function withTimeout(promise, ms = SYNC_TIMEOUT_MS, label = 'المزامنة', onTimeout) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                try { onTimeout?.(); } catch { /* Timer rejection must still settle. */ }
                const error = new Error(`انتهت مهلة ${label}؛ يمكن إعادة المحاولة`);
                error.code = 'SYNC_TIMEOUT';
                reject(error);
            }, Math.max(0, ms));
        })
    ]).finally(() => clearTimeout(timer));
}

// A timeout cannot cancel a Firestore write already submitted. It does invalidate
// its continuation: no later writes, dirty acknowledgements, or checkpoints run.
export function createSyncDeadline(label = 'المزامنة', ms = SYNC_TIMEOUT_MS) {
    const expiresAt = Date.now() + ms;
    let stopped = false;
    const cancellations = new Set();
    let rejectCancelled;
    const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
    cancelled.catch(() => {});
    const cancel = () => {
        if (stopped) return;
        stopped = true;
        const error = new Error(`انتهت مهلة ${label}؛ يمكن إعادة المحاولة`);
        error.code = 'SYNC_TIMEOUT';
        rejectCancelled(error);
        for (const callback of cancellations) { try { callback(); } catch { /* Already closed transaction. */ } }
        cancellations.clear();
    };
    const check = () => {
        if (stopped || Date.now() >= expiresAt) {
            const error = new Error(`انتهت مهلة ${label}؛ يمكن إعادة المحاولة`);
            error.code = 'SYNC_TIMEOUT';
            throw error;
        }
    };
    return {
        check, cancel,
        onCancel(callback) { cancellations.add(callback); return () => cancellations.delete(callback); },
        async run(factory) {
            check();
            const result = await withTimeout(Promise.race([cancelled, Promise.resolve().then(() => { check(); return factory(); })]), expiresAt - Date.now(), label, cancel);
            check();
            return result;
        }
    };
}

// Reference-counted activity: overlapping entry points cannot hide each other.
const operations = new Set();
let hadFailure = false;
export function notifySyncStatus(status, extra = {}) {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('global-sync-status', { detail: { status, ...extra } }));
    }
}
export function beginSyncStatus() {
    const token = Symbol('sync');
    operations.add(token);
    if (operations.size === 1) { hadFailure = false; notifySyncStatus('syncing'); }
    return (outcome = 'success') => {
        if (!operations.delete(token)) return;
        hadFailure ||= outcome !== 'success';
        if (!operations.size) notifySyncStatus('idle', { time: Date.now(), outcome: hadFailure ? 'error' : 'success' });
    };
}

// Bound legacy Dexie reads/writes as well as network calls. Query builders stay
// synchronous; terminal operations share the parent deadline.
export function boundedDatabase(database, deadline) {
    const terminal = new Set(['toArray', 'get', 'put', 'add', 'update', 'delete', 'clear', 'bulkPut', 'bulkDelete', 'modify', 'count']);
    const wrap = target => new Proxy(target, {
        get(object, key) {
            const value = Reflect.get(object, key, object);
            if (typeof value === 'function') return (...args) => {
                deadline.check();
                if (terminal.has(key)) return deadline.run(() => value.apply(object, args));
                const result = value.apply(object, args);
                return result && typeof result === 'object' ? wrap(result) : result;
            };
            return value && typeof value === 'object' ? wrap(value) : value;
        }
    });
    return wrap(database);
}
