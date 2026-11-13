import test from 'node:test';
import assert from 'node:assert/strict';
import { db, remote } from './sync-mocks.mjs';
import { getCanonicalActiveChildren, getValidatedClassAttendance, consolidateLocalDexieDuplicates } from '../src/utils/churchDataEngine.js';
import { attendanceIdentity, resolveAttendanceChild } from '../src/utils/childIdentity.js';
import { deleteChildEverywhere, restoreChildEverywhere, syncScopedClassesFromCloud, reconcileCloudChild, pushChildSafely } from '../src/db/childSync.js';
import { getDefaultServiceDateForClass } from '../src/utils/serviceWeek.js';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
globalThis.Event = class { constructor(type) { this.type = type; } };
globalThis.window = { localStorage, dispatchEvent: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
const child = { id: 7, cloudId: 'cloud-A', name: 'أبانوب مينا جرجس', syncKey: 'class-A', updatedAt: 1 };
const row = { date: '2026-11-13', type: 'service', status: 'present', syncKey: 'class-A', childId: 7, updatedAt: 1 };
const reset = async () => { for (const t of [db.children,db.attendance,db.grades]) await t.clear(); remote.clear(); storage.clear(); localStorage.setItem('currentSyncKey', 'MASTER_ACCESS'); localStorage.setItem('appSettings', JSON.stringify({services:[{osras:[{syncKey:'class-A'},{syncKey:'class-B'}]}]})); navigator.onLine=false; };

test('aliases, name fallback, transitive duplicates and empty scope', () => {
 const data = getCanonicalActiveChildren([child, {...child,id:'legacy',cloudId:undefined,qrId:'QR'}, {...child,id:'cloud-A',name:'ابانوب مينا جرجس'}]);
 assert.equal(data.activeChildren.length,1);
 for(const id of [7,'legacy','QR','cloud-A']) assert.ok(resolveAttendanceChild({...row,childId:id},data));
 assert.ok(resolveAttendanceChild({...row,childId:'unknown',childName:child.name},data));
 assert.equal(getCanonicalActiveChildren([child], []).activeChildren.length,0);
 assert.equal(resolveAttendanceChild({...row,syncKey:'class-B'},data),undefined);
});
test('latest absent/deleted attendance wins; all-absent class is recorded', () => {
 const data=getCanonicalActiveChildren([child]);
 let result=getValidatedClassAttendance([row,{...row,updatedAt:2,status:'absent'}],data);
 assert.equal(result.presentCount,0); assert.equal(result.byClass['class-A'].hasRecordedAttendance,true);
 result=getValidatedClassAttendance([row,{...row,updatedAt:3,isDeleted:true}],data);
 assert.equal(result.presentCount,0); assert.equal(result.byClass['class-A'].hasRecordedAttendance,false);
});
test('child tombstone beats dirty edits; explicit newer restoration survives', () => {
 const tomb={...child,isDeleted:true,deletedAt:10,updatedAt:10};
 assert.equal(getCanonicalActiveChildren([tomb,{...child,id:8,updatedAt:99,isDirty:true}]).activeChildren.length,0);
 assert.equal(getCanonicalActiveChildren([tomb,{...child,id:8,updatedAt:11,restoredAt:11}]).activeChildren.length,1);
});
test('physical dedup preserves aliases, attendance and unresolved records without dirtying', async () => {
 await reset(); await db.children.put(child); await db.children.put({...child,id:'legacy',updatedAt:2});
 await db.attendance.add(row); await db.attendance.add({...row,childId:'unknown',childName:'not downloaded'});
 await consolidateLocalDexieDuplicates();
 assert.equal((await db.children.toArray()).length,1);
 const rows=await db.attendance.toArray(); assert.equal(rows.length,2); assert.equal(rows[0].childId,'cloud-A'); assert.ok(!rows[0].isDirty);
 assert.ok(getCanonicalActiveChildren(await db.children.toArray()).childMapById.has('7'));
});
test('offline delete marks all copies and attendance; old cloud cannot clear pending delete', async () => {
 await reset(); await db.children.put(child); await db.children.put({...child,id:'legacy'}); await db.attendance.add(row);
 const result=await deleteChildEverywhere(child,'خادم'); assert.equal(result.pendingSync,true);
 await reconcileCloudChild({...child,id:'cloud-A',cloudId:'cloud-A'});
 assert.ok((await db.children.toArray()).every(c=>c.isDeleted && c.isDirty));
 assert.equal((await db.attendance.toArray())[0].isDeleted,true);
 assert.ok(localStorage.getItem('deleted_children_tombstones_v1').includes('class-A::'));
});
test('cloud tombstone suppresses stale offline dirty copy and cannot be overwritten', async () => {
 await reset(); await db.children.put({...child,isDirty:true,updatedAt:100});
 remote.set('Osras/class-A/children/cloud-A',{...child,isDeleted:true,deletedAt:50,updatedAt:50});
 await syncScopedClassesFromCloud(['class-A']);
 assert.equal((await db.children.get(7)).isDeleted,true);
 assert.equal(remote.get('Osras/class-A/children/cloud-A').isDeleted,true);
});
test('prefetched tombstone prevents child push', async () => {
 await reset(); const dirty={...child,isDirty:true}; await db.children.put(dirty);
 remote.set('Osras/class-A/children/cloud-A',{...child,isDeleted:true,deletedAt:50});
 await pushChildSafely(dirty,[{...child,isDeleted:true,deletedAt:50}]);
 assert.equal(remote.get('Osras/class-A/children/cloud-A').isDeleted,true);
 assert.equal((await db.children.get(7)).isDeleted,true);
});
test('multi-class full pull recovers old attendance despite poisoned global checkpoint', async () => {
 await reset(); localStorage.setItem('lastSyncTime','2099-01-01');
 for(const key of ['class-A','class-B']) {
  remote.set(`Osras/${key}/children/${key}`,{...child,id:key,syncKey:key});
  remote.set(`Osras/${key}/attendance/old`,{...row,childId:key,syncKey:key});
 }
 await syncScopedClassesFromCloud(['class-A','class-B']);
 assert.equal((await db.children.toArray()).length,2); assert.equal((await db.attendance.toArray()).length,2);
 for(const key of ['class-A','class-B']) assert.ok(localStorage.getItem(`lastSyncTime_${key}`));
});
test('explicit restore clears registry and updates cloud tombstone, without restoring old attendance', async () => {
 await reset(); await db.children.put(child); await db.attendance.add(row);
 await deleteChildEverywhere(child,'خادم');
 await new Promise(resolve=>setTimeout(resolve,2)); navigator.onLine=true;
 await restoreChildEverywhere(await db.children.get(7),'أمين');
 assert.equal(remote.get('Osras/class-A/children/cloud-A').isDeleted,false);
 assert.equal((await db.children.get(7)).isDeleted,false);
 assert.equal((await db.attendance.toArray())[0].isDeleted,true);
 assert.equal(localStorage.getItem('deleted_children_tombstones_v1'),'{}');
});
test('Friday class uses Friday even on Thursday cycle boundary', () => {
 assert.equal(getDefaultServiceDateForClass('class-A','ابتدائي',new Date(2026,10,12,12)),'2026-11-13');
 assert.equal(getDefaultServiceDateForClass('class-B','ثانوي',new Date(2026,10,12,12)),'2026-11-12');
});
test('a clean local record is never uploaded by reconciliation', async () => {
 await reset(); await db.children.put({...child,isDirty:false});
 await syncScopedClassesFromCloud(['class-A']);
 assert.equal(remote.size,0);
});
test('identical cloud IDs in different classes do not overwrite local roster', async () => {
 await reset();
 for(const key of ['class-A','class-B']) remote.set(`Osras/${key}/children/shared`,{...child,id:'shared',syncKey:key});
 await syncScopedClassesFromCloud(['class-A','class-B']);
 assert.equal((await db.children.toArray()).length,2);
});
test('prefetched name guard suppresses a duplicate with an unknown ID', async () => {
 await reset(); const dirty={...child,id:'new-id',cloudId:'new-id',isDirty:true}; await db.children.put(dirty);
 const name='ابانوب مينا جرجس';
 remote.set(`Osras/class-A/childIdentities/${encodeURIComponent(name)}`,{...child,isDeleted:true,deletedAt:100});
 await pushChildSafely(dirty,[{...child,isDeleted:true,deletedAt:100}]);
 assert.equal(remote.has('Osras/class-A/children/new-id'),false);
 assert.equal((await db.children.get('new-id')).isDeleted,true);
});
test('role scope includes all assigned classes and rejects out-of-scope pulls', async () => {
 await reset(); localStorage.setItem('currentSyncKey','class-A');
 localStorage.setItem('currentServant', JSON.stringify({role:'خادم مرحلة',allowedClasses:['class-A']}));
 remote.set('Osras/class-B/children/B',{...child,id:'B',syncKey:'class-B'});
 await syncScopedClassesFromCloud(['class-B']);
 assert.equal((await db.children.toArray()).length,0);
 localStorage.setItem('currentServant', JSON.stringify({role:'خادم مرحلة',allowedClasses:['class-A','class-B']}));
 await syncScopedClassesFromCloud(['class-A','class-B']);
 assert.equal((await db.children.toArray()).length,1);
});
test('all supported leader role labels resolve the full configured scope', async () => {
 await reset(); localStorage.setItem('currentSyncKey','class-A');
 const { scopedSyncKeys } = await import('../src/db/childSync.js');
 for (const role of ['أمين خدمة','أمين الخدمة','أمين الخدمة العام','كاهن','SUPER_ADMIN']) {
  localStorage.setItem('currentServant',JSON.stringify({role}));
  assert.deepEqual(scopedSyncKeys().sort(),['class-A','class-B'], role);
 }
 for (const role of ['أمين مرحلة','أمين المرحلة','stage_admin','خادم مرحلة']) {
  localStorage.setItem('currentServant',JSON.stringify({role,allowedClasses:['class-B']}));
  assert.deepEqual(scopedSyncKeys(),['class-B'],role);
 }
});
test('an explicit unknown stage never falls back to another class', async () => {
 await reset(); localStorage.setItem('currentSyncKey','class-A');
 localStorage.setItem('currentServant',JSON.stringify({role:'stage_admin',assignedStages:['missing-stage']}));
 const { scopedSyncKeys } = await import('../src/db/childSync.js');
 assert.deepEqual(scopedSyncKeys(),[]);
});
test('servant impersonation switches Priest/Master scope to single-class servant and restores on exit', async () => {
 await reset();
 localStorage.setItem('currentSyncKey', 'MASTER_ACCESS');
 localStorage.setItem('currentServant', JSON.stringify({ role: 'كاهن', name: 'أبونا' }));
 const { scopedSyncKeys } = await import('../src/db/childSync.js');
 const { startOsraImpersonation, exitOsraImpersonation, resolveServantNotificationScope } = await import('../src/utils/notificationScopeEngine.js');
 const { formatCopticDate } = await import('../src/utils/serviceWeek.js');
 assert.deepEqual(scopedSyncKeys().sort(), ['class-A', 'class-B']);

 startOsraImpersonation({ syncKey: 'class-B', name: 'ثانية إعدادي' }, 'MASTER_ACCESS');
 assert.deepEqual(scopedSyncKeys(), ['class-B']);
 const impScope = resolveServantNotificationScope();
 assert.equal(impScope.tier, 'class_servant');
 assert.equal(impScope.isImpersonating, true);
 assert.equal(impScope.primarySyncKey, 'class-B');

 exitOsraImpersonation();
 assert.deepEqual(scopedSyncKeys().sort(), ['class-A', 'class-B']);
 assert.equal(resolveServantNotificationScope().tier, 'master_detailed');

 const copticStr = formatCopticDate(new Date(2026, 10, 12, 12));
 assert.ok(copticStr.includes('هاتور'), `Expected Arabic Coptic month name in "${copticStr}"`);
});
