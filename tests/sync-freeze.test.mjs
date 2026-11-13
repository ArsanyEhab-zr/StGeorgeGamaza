import test from 'node:test';
import assert from 'node:assert/strict';
import { db, remote, network } from './sync-mocks.mjs';
import { createSyncDeadline, withTimeout, SYNC_TIMEOUT_MS } from '../src/utils/syncDeadline.js';
import { syncScopedClassesFromCloud, pushChildSafely } from '../src/db/childSync.js';
import { syncDataWithCloud } from '../src/db/sync.js';

const storage = new Map();
const events = [];
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
globalThis.Event = class { constructor(type) { this.type = type; } };
globalThis.window = { localStorage, dispatchEvent: event => events.push(event.detail || event) };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const flush = () => new Promise(resolve => setImmediate(resolve));
const never = () => new Promise(() => {});
const reset = async (count = 1) => {
    for (const table of [db.children, db.attendance, db.grades]) await table.clear();
    storage.clear(); remote.clear(); events.length = 0; network.read = null; network.write = null;
    localStorage.setItem('currentSyncKey', 'MASTER_ACCESS');
    localStorage.setItem('appSettings', JSON.stringify({ services: [{ osras: Array.from({length:count},(_,i)=>({syncKey:`class-${i}`})) }] }));
};

test('deadline rejects a never-settling task and prevents late continuation', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let resolve;
    let writes = 0;
    const deadline = createSyncDeadline();
    const operation = deadline.run(async () => { await deadline.run(() => new Promise(r => { resolve = r; })); writes++; });
    const rejected = assert.rejects(operation, { code: 'SYNC_TIMEOUT' });
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS); await rejected;
    resolve(); await flush();
    assert.equal(writes, 0);
    assert.throws(deadline.check, { code: 'SYNC_TIMEOUT' });
    t.mock.timers.reset();
});
test('hung class releases both scoped and class locks without uncaught throw; retry completes', async t => {
    await reset();
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    network.read = never;
    const first = syncScopedClassesFromCloud(['class-0']);
    assert.equal(first, syncScopedClassesFromCloud(['class-0']));
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS);
    const firstResult = await first;
    await flush();
    assert.equal(firstResult.success, false);
    assert.equal(events.at(-1).status, 'idle');
    assert.equal(localStorage.getItem('lastSyncTime_class-0'), null);
    network.read = null;
    const retry = await syncScopedClassesFromCloud(['class-0']);
    assert.equal(retry.success, true);
    assert.equal(events.at(-1).status, 'idle');
    t.mock.timers.reset();
});
test('one slow/hung class is skipped with warning while remaining classes sync progressively', async t => {
    await reset(3);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    remote.set('Osras/class-1/children/k1', { id: 'k1', name: 'مينا', syncKey: 'class-1', updatedAt: 1 });
    remote.set('Osras/class-2/children/k2', { id: 'k2', name: 'كيرلس', syncKey: 'class-2', updatedAt: 1 });
    network.read = ref => ref.path.startsWith('Osras/class-0/') ? never() : Promise.resolve();
    const op = syncScopedClassesFromCloud(['class-0', 'class-1', 'class-2']);
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS);
    const res = await op;
    assert.equal(res.success, true);
    assert.equal(res.partial, true);
    assert.equal(res.syncedCount, 2);
    assert.equal((await db.children.toArray()).length, 2);
    network.read = null;
    t.mock.timers.reset();
});
test('hung setDoc leaves dirty data pending after timeout and late completion', async t => {
    await reset();
    const child = {id:'kid',cloudId:'kid',syncKey:'class-0',name:'طفل الاختبار',isDirty:true,updatedAt:1};
    await db.children.put(child);
    let releaseWrite;
    network.write = () => new Promise(resolve => { releaseWrite = resolve; });
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const operation = syncScopedClassesFromCloud(['class-0']);
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS);
    const res = await operation;
    assert.equal(res.success, false);
    await flush();
    releaseWrite(); await flush();
    assert.equal((await db.children.get('kid')).isDirty,true);
    assert.equal(localStorage.getItem('lastSyncTime_class-0'),null);
    network.write = null;
    await syncScopedClassesFromCloud(['class-0']);
    assert.equal((await db.children.get('kid')).isDirty,false);
    t.mock.timers.reset();
});
test('hung IndexedDB read does not hold the UI sync promise or start later writes', async t => {
    await reset();
    const original = db.children.where;
    db.children.where = () => ({ equals: () => ({ toArray: never }) });
    remote.set('Osras/class-0/children/kid',{name:'طفل',id:'kid',syncKey:'class-0'});
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
        const operation = syncScopedClassesFromCloud(['class-0']);
        await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS);
        const res = await operation;
        assert.equal(res.success, false);
        assert.equal(events.at(-1).status,'idle');
    } finally { db.children.where = original; t.mock.timers.reset(); }
    assert.equal((await syncScopedClassesFromCloud(['class-0'])).success,true);
});
test('legacy global sync and scoped mount sync do not deadlock on overlapping calls', async t => {
    await reset();
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    network.read = ref => ref.path === 'System/mainConfig' ? Promise.resolve() : never();
    const global = syncDataWithCloud();
    assert.equal(global,syncDataWithCloud());
    const scoped = syncScopedClassesFromCloud(['class-0']);
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS);
    const scopedRes = await scoped;
    assert.equal(scopedRes.success, false);
    const result = await global;
    assert.equal(result.success,false);
    assert.equal(events.at(-1).status,'idle');
    const retry = syncDataWithCloud();
    assert.notEqual(retry,global);
    await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS); await retry;
    t.mock.timers.reset(); network.read = null;
});
test('ordinary child edits preserve a deletion received after the prefetched snapshot', async () => {
    await reset();
    const child={id:'kid',cloudId:'kid',syncKey:'class-0',name:'طفل',updatedAt:2,isDirty:true,restoredAt:1};
    await db.children.put(child);
    remote.set('Osras/class-0/children/kid',{...child,isDeleted:true,deletedAt:3,restoredAt:null});
    await pushChildSafely(child,[]);
    assert.equal(remote.get('Osras/class-0/children/kid').isDeleted,true);
    assert.equal(remote.get('Osras/class-0/children/kid').deletedAt,3);
});
test('19-class fixture uses progressive batches of three with one local attendance batch per class', async () => {
    await reset(19);
    let concurrent = 0, maxConcurrent = 0;
    network.read = async () => {
        concurrent++; maxConcurrent = Math.max(maxConcurrent,concurrent);
        await new Promise(resolve=>setTimeout(resolve,5));
        concurrent--;
    };
    for (let c=0;c<19;c++) for(let k=0;k<20;k++) {
        const syncKey=`class-${c}`, id=`kid-${k}`;
        remote.set(`Osras/${syncKey}/children/${id}`,{id,name:`طفل ${k}`,syncKey,updatedAt:1});
        for(let d=10;d<13;d++) remote.set(`Osras/${syncKey}/attendance/2026-11-${d}_${id}_service`,{childId:id,date:`2026-11-${d}`,type:'service',status:'present',syncKey,updatedAt:1});
    }
    const result = await syncScopedClassesFromCloud(Array.from({length:19},(_,i)=>`class-${i}`));
    assert.equal(result.classCount,19);
    assert.equal((await db.children.toArray()).length,380);
    assert.equal((await db.attendance.toArray()).length,1140);
    assert.ok(maxConcurrent <= 9 && maxConcurrent >= 3); // three classes per progressive batch * three collection reads
    assert.ok(result.durationMs < 2000, `Mock fixture took ${result.durationMs} ms`);
    console.log(`19-class MOCK benchmark: ${result.durationMs} ms; max concurrent requests: ${maxConcurrent}`);
    network.read = null;
});
test('timeout helper clears its timer after success', async t => {
    t.mock.timers.enable({apis:['setTimeout']});
    let timedOut=false;
    assert.equal(await withTimeout(Promise.resolve(7),8000,'test',()=>{timedOut=true;}),7);
    t.mock.timers.tick(8000);
    assert.equal(timedOut,false);
    t.mock.timers.reset();
});
test('retry prioritizes classes without a completed checkpoint', async () => {
    await reset(2);
    localStorage.setItem('lastSyncTime_class-0', new Date().toISOString());
    const requests=[];
    network.read=async ref=>{requests.push(ref.path);};
    await syncScopedClassesFromCloud(['class-0','class-1']);
    assert.ok(requests[0].startsWith('Osras/class-1/'));
    network.read=null;
});
test('standalone startup cleanup also has a deadline', async t => {
    await reset();
    const { cleanupDuplicateAndOrphanedAttendance } = await import('../src/utils/churchDataEngine.js');
    const original = db.attendance.toArray;
    db.attendance.toArray = never;
    t.mock.timers.enable({apis:['setTimeout','Date']});
    try {
        const operation = cleanupDuplicateAndOrphanedAttendance({removeCloudOrphans:false});
        const rejected = assert.rejects(operation,{code:'SYNC_TIMEOUT'});
        await flush(); t.mock.timers.tick(SYNC_TIMEOUT_MS); await rejected;
    } finally { db.attendance.toArray=original; t.mock.timers.reset(); }
});
