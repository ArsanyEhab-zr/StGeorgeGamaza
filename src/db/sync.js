import { syncScopedClassesFromCloud, scopedSyncKeys, deleteChildEverywhere, syncWithCloud, syncClass } from './childSync';
export { syncScopedClassesFromCloud, deleteChildEverywhere, restoreChildEverywhere, syncWithCloud, syncClass } from './childSync';
import { db as localDb } from './database';
import { createSyncDeadline, beginSyncStatus, boundedDatabase, withTimeout, SYNC_TIMEOUT_MS } from '../utils/syncDeadline';
import { firestore } from './firebase';
import { collection, collectionGroup, getDocs as firestoreGetDocs, doc, setDoc as firestoreSetDoc, deleteDoc as firestoreDeleteDoc, getDoc as firestoreGetDoc } from 'firebase/firestore';

// 🌟 استدعاء دوال التشفير وفك التشفير اللي عملناهم
import { encryptData, decryptData } from '../encryption';
import { logActivity } from '../utils/activityLogger';

// 🧹 فلتر سحري لتنظيف الداتا (أسرع من السرياليزيشن)
const cleanData = (obj) => {
    const cleaned = { ...obj };
    for (const key in cleaned) {
        if (cleaned[key] === undefined) {
            delete cleaned[key];
        }
    }
    return cleaned;
};

// 🛠️ دالة مساعدة لتنسيق اللستة في التقرير عشان متكونش طويلة جداً ومزعجة
const formatDetailedList = (list) => {
    const safeList = list || [];
    if (safeList.length === 0) return "لا يوجد";
    if (safeList.length <= 4) return safeList.join('، ');
    return `${safeList.slice(0, 4).join('، ')} ... (+${safeList.length - 4} آخرين)`;
};

/**
 * 🌟 سحب هيكل الكنيسة والفصول والخدام من السحابة مباشرة بدون أقفال تعارض
 */
export const pullStructureFromCloud = async () => {
    try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const cached = JSON.parse(localStorage.getItem('appSettings') || '{}');
            return { success: false, offline: true, settings: cached, updated: false };
        }
        const settingsRef = doc(firestore, 'System', 'mainConfig');
        const settingsSnap = await withTimeout(firestoreGetDoc(settingsRef), SYNC_TIMEOUT_MS, 'تحميل الهيكل');
        if (!settingsSnap || !settingsSnap.exists()) {
            const cached = JSON.parse(localStorage.getItem('appSettings') || '{}');
            return { success: false, settings: cached, updated: false };
        }

        const cloudSettings = settingsSnap.data() || {};

        // 🚨 SESSION VALIDATION: AUTO-LOGOUT DELETED USERS
        const currentServantStr = localStorage.getItem('currentServant');
        const currentSyncKey = localStorage.getItem('currentSyncKey');

        if (currentServantStr && currentSyncKey && currentSyncKey !== 'MASTER_ACCESS' && currentSyncKey !== 'ADMIN_MODE') {
            const currentServant = JSON.parse(currentServantStr);
            const role = currentServant.role || '';

            if (role !== 'Super Admin' && role !== 'أدمن النظام') {
                const servantsList = cloudSettings.servants || [];
                const isStillExists = servantsList.some(s => {
                    if (currentServant.id && s.id) return s.id === currentServant.id;
                    return s.phone === currentServant.phone && s.name === currentServant.name;
                });

                if (!isStillExists && servantsList.length > 0) {
                    console.warn("🔴 User deleted from cloud. Forcing auto-logout.");
                    localStorage.removeItem('currentServant');
                    localStorage.removeItem('currentSyncKey');
                    localStorage.removeItem('userPhone');

                    await localDb.children.clear();
                    await localDb.attendance.clear();
                    await localDb.events.clear();
                    await localDb.exams.clear();
                    await localDb.grades.clear();

                    if (typeof window !== 'undefined' && window.location) {
                        window.location.href = '#/login';
                        window.location.reload?.();
                    }
                    return { success: false, halted: true };
                }
            }
        }

        const localSettingsString = localStorage.getItem('appSettings');
        let settingsUpdated = false;
        let mergedSettings = JSON.parse(localSettingsString || '{}');

        if (JSON.stringify(cloudSettings) !== localSettingsString) {
            const hasPendingSettings = localStorage.getItem('pendingStructureSync') === 'true';
            if (!hasPendingSettings) {
                mergedSettings = { ...mergedSettings, ...cloudSettings };
                localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
                settingsUpdated = true;

                try {
                    await localDb.servants.clear();
                } catch (e) {
                    console.warn('Failed to clear legacy db.servants', e);
                }

                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new Event('servant-profile-updated'));
                }
            }
        }

        return { success: true, settings: mergedSettings, updated: settingsUpdated };
    } catch (err) {
        console.warn('[Sync] pullStructureFromCloud warning (using local cached structure):', err?.message || err);
        const cached = JSON.parse(localStorage.getItem('appSettings') || '{}');
        return { success: false, settings: cached, updated: false, warning: err?.message };
    }
};

const _syncDataWithCloud = async () => {
    const db = localDb;
    const getDocs = (...args) => withTimeout(firestoreGetDocs(...args), SYNC_TIMEOUT_MS, 'جلب البيانات');
    const setDoc = (...args) => withTimeout(firestoreSetDoc(...args), SYNC_TIMEOUT_MS, 'رفع البيانات');
    const deleteDoc = (...args) => withTimeout(firestoreDeleteDoc(...args), SYNC_TIMEOUT_MS, 'حذف البيانات');
    try {
        // 🔐 1. هنجيب مفتاح الكلاود 
        const currentSyncKey = localStorage.getItem('currentSyncKey');

        if (!currentSyncKey) {
            return { success: false, message: "❌ غير مصرح! برجاء تسجيل الدخول بمفتاح الكلاود الخاص بأسرتك أولاً." };
        }

        // 🌟 تفاصيل العمليات (Detailed Logs)
        let pushLog = { children: [], attendance: [], events: [], grades: [], exams: [], activities: [] };
        let pullLog = { 
            childrenAdded: [], childrenUpdated: [], 
            attendanceAdded: [], 
            eventsAdded: [], eventsUpdated: [],
            gradesAdded: [], gradesUpdated: [],
            examsAdded: [], examsUpdated: [],
            activitiesAdded: [], activitiesUpdated: []
        };

        let pushedEventsIds = new Set();
        let pushedGradeKeys = new Set();
        let pushedExamIds = new Set();
        let pushedActivitiesIds = new Set();

        const isAdmin = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
        const isStageAdmin = currentSyncKey === 'STAGE_ADMIN';
        const currentServantObj = JSON.parse(localStorage.getItem('currentServant') || '{}');
        const allowedClasses = currentServantObj.allowedClasses || [];

        // 🌟 2. سحب إعدادات الكنيسة والخدام (System Settings) بشكل مستقل وآمن
        const structureResult = await pullStructureFromCloud();
        if (structureResult?.halted) return { success: false, message: 'تم إنهاء الجلسة' };
        const settingsUpdated = Boolean(structureResult?.updated);
        // -------------------------------------------------------------

        const now = new Date().toISOString();
        const lastSyncTime = '1970-01-01T00:00:00.000Z';
        const scopedResult = await syncScopedClassesFromCloud(scopedSyncKeys());
        if (scopedResult && scopedResult.success === false && scopedResult.classCount > 0) {
            return {
                success: false,
                message: `تعذر إتمام مزامنة الفصول حالياً (${scopedResult.failures?.[0] || 'تحقق من الاتصال'})`
            };
        }

        // 🌟 3. السحب أولاً (Pull) من السحابة 🌟
        let cloudEvents = [];
        let cloudActivities = [];

        const processCloudDoc = (doc) => {
            const rawData = doc.data();
            return rawData.payload ? decryptData(rawData.payload) : rawData;
        };

        try {
            if (isAdmin) {
                const eventsSnapshot = await getDocs(collectionGroup(firestore, 'events'));
                cloudEvents = (eventsSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);
                
                const activitiesSnapshot = await getDocs(collectionGroup(firestore, 'activities'));
                cloudActivities = (activitiesSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);
            } else if (isStageAdmin) {
                if (allowedClasses.length > 0) {
                    const eventsSnaps = await Promise.all(allowedClasses.map(key => getDocs(collection(firestore, 'Osras', key, 'events')).catch(() => ({ docs: [] }))));
                    const globalEventsSnapshot = await getDocs(collection(firestore, 'Osras', 'global', 'events')).catch(() => ({ docs: [] }));
                    cloudEvents = [
                        ...eventsSnaps.flatMap(snap => (snap?.docs || []).map(processCloudDoc)).filter(Boolean),
                        ...(globalEventsSnapshot?.docs || []).map(processCloudDoc).filter(Boolean)
                    ];

                    const activitiesSnaps = await Promise.all(allowedClasses.map(key => getDocs(collection(firestore, 'Osras', key, 'activities')).catch(() => ({ docs: [] }))));
                    cloudActivities = activitiesSnaps.flatMap(snap => (snap?.docs || []).map(processCloudDoc)).filter(Boolean);
                }
            } else {
                const eventsSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'events')).catch(() => ({ docs: [] }));
                const globalEventsSnapshot = await getDocs(collection(firestore, 'Osras', 'global', 'events')).catch(() => ({ docs: [] }));
                cloudEvents = [
                    ...(eventsSnapshot?.docs || []).map(processCloudDoc).filter(Boolean),
                    ...(globalEventsSnapshot?.docs || []).map(processCloudDoc).filter(Boolean)
                ];
                
                const activitiesSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'activities')).catch(() => ({ docs: [] }));
                cloudActivities = (activitiesSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);
            }
        } catch (pullSecErr) {
            console.warn('[Sync] Secondary events/activities pull warning:', pullSecErr?.message || pullSecErr);
        }

        // تحويل داتا الكلاود لخرائط (Maps) عشان المقارنة تبقى بسرعة الصاروخ
        const cloudEventsMap = new Map(cloudEvents.map(e => [e.id, e]));

        // 4. هنجيب الداتا من الموبايل (أوفلاين)
        const localEvents = (await db.events.toArray()) || [];
        const localActivities = (await db.activities.toArray()) || [];

        // 🚀🚀 5. الرفع للسحابة (Push) "بنظام isDirty" — نرفع الـ dirty بس 🚀🚀
        try { for (const event of localEvents) {
            if (!event.isDirty) continue; // ✨ Skip clean records

            let targetKey = (isAdmin || isStageAdmin) ? event.syncKey : currentSyncKey;
            if (event.isGlobal) targetKey = 'global';
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE' || targetKey === 'STAGE_ADMIN') continue;

            const docRef = doc(firestore, 'Osras', targetKey, 'events', event.id.toString());

            // 🪦 Tombstone: soft-deleted event
            if (event.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore */ }
                await db.events.delete(event.id);
                pushLog.events.push(`🗑️${event.title || event.id}`);
                pushedEventsIds.add(event.id);
                continue;
            }

            const encryptedPayload = encryptData(cleanData({ ...event, syncKey: targetKey, isDirty: false, isDeleted: false }));
            await setDoc(docRef, { payload: encryptedPayload }, { merge: true });
            await db.events.update(event.id, { isDirty: false, updatedAt: now });
            pushLog.events.push(event.title);
            pushedEventsIds.add(event.id);
        } } catch(e) { console.error('Error syncing events push:', e); }

        try { for (const activity of localActivities) {
            if (!activity.isDirty) continue;

            const targetKey = (isAdmin || isStageAdmin) ? (activity.syncKey || currentSyncKey) : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE' || targetKey === 'STAGE_ADMIN') continue;

            const docRef = doc(firestore, 'Osras', targetKey, 'activities', activity.id.toString());

            // 🪦 Tombstone: soft-deleted activity
            if (activity.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore */ }
                await db.activities.delete(activity.id);
                pushLog.activities.push(`🗑️${activity.text.substring(0, 10)}`);
                pushedActivitiesIds.add(activity.id);
                continue;
            }

            const encryptedPayload = encryptData(cleanData({ ...activity, syncKey: targetKey, isDirty: false, isDeleted: false }));
            await setDoc(docRef, { payload: encryptedPayload }, { merge: true });
            await db.activities.update(activity.id, { isDirty: false, updatedAt: now });
            pushLog.activities.push(activity.text.substring(0, 10));
            pushedActivitiesIds.add(activity.id);
        } } catch(e) { console.error('Error syncing activities push:', e); }


        // 📝 5b. رفع الامتحانات (Exams metadata push) — isDirty فقط
        const localExams = (await db.exams.toArray()) || [];
        try { for (const exam of localExams) {
            if (!exam.isDirty) continue;

            const targetKey = (isAdmin || isStageAdmin) ? (exam.syncKey || currentSyncKey) : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE' || targetKey === 'STAGE_ADMIN') continue;

            const examFirebaseId = exam.firebaseId || exam.id.toString();
            const docRef = doc(firestore, 'Osras', targetKey, 'exams', examFirebaseId);

            if (exam.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore */ }
                await db.exams.delete(exam.id);
                pushLog.exams.push(`🗑️${exam.examName || exam.id}`);
                pushedExamIds.add(examFirebaseId);
                continue;
            }

            const examDataForCloud = cleanData({
                id: examFirebaseId,
                examName: exam.examName,
                maxGrade: exam.maxGrade,
                date: exam.date,
                syncKey: targetKey,
                updatedAt: exam.updatedAt || now
            });
            await setDoc(docRef, examDataForCloud, { merge: true });
            await db.exams.update(exam.id, { isDirty: false, updatedAt: now, firebaseId: examFirebaseId });
            pushLog.exams.push(exam.examName);
            pushedExamIds.add(examFirebaseId);
        } } catch(e) { console.error('Error syncing exams push:', e); }

        // 🎓 5c. رفع الدرجات (Grades push) — isDirty فقط
        const localGrades = (await db.grades.toArray()) || [];
        try { for (const grade of localGrades) {
            if (!grade.isDirty) continue;

            const targetKey = (isAdmin || isStageAdmin) ? (grade.syncKey || currentSyncKey) : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE' || targetKey === 'STAGE_ADMIN') continue;

            if (!grade.examId) continue; // Safety: skip grades without examId

            const gradeDocId = grade.childId.toString();
            const docRef = doc(firestore, 'Osras', targetKey, 'exams', grade.examId, 'grades', gradeDocId);
            const gradeKey = `${grade.examId}_${grade.childId}`;

            if (grade.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore */ }
                await db.grades.delete(grade.id);
                pushLog.grades.push(`🗑️${gradeKey}`);
                pushedGradeKeys.add(gradeKey);
                continue;
            }

            const gradeDataForCloud = cleanData({
                childId: grade.childId,
                grade: grade.grade,
                examId: grade.examId,
                examName: grade.examName,
                maxGrade: grade.maxGrade,
                date: grade.date,
                syncKey: targetKey,
                updatedAt: grade.updatedAt || now
            });
            const encryptedPayload = encryptData(gradeDataForCloud);
            await setDoc(docRef, { payload: encryptedPayload }, { merge: true });
            await db.grades.update(grade.id, { isDirty: false, updatedAt: now });
            pushLog.grades.push(`${grade.examName}/${grade.childId}`);
            pushedGradeKeys.add(gradeKey);
        } } catch(e) { console.error('Error syncing grades push:', e); }

        // 🌟🌟 6. تحديث داتا الموبايل (Pull) "بنظام updatedAt delta" 🌟🌟
        const syncedSyncKeys = new Set(scopedSyncKeys());
        const localEventsMap = new Map(localEvents.map(e => [e.id, e]));
        try { for (const cloudEvent of cloudEvents) {
            if (pushedEventsIds.has(cloudEvent.id)) continue;
            
            const localMatch = localEventsMap.get(cloudEvent.id);
            let syncKeyToSave = (isAdmin || isStageAdmin) ? (cloudEvent.syncKey || currentSyncKey) : currentSyncKey;
            if (cloudEvent.isGlobal || cloudEvent.syncKey === 'global') syncKeyToSave = 'global';
            
            const eventToSave = { ...cloudEvent, syncKey: String(syncKeyToSave), isDirty: false, isDeleted: false, updatedAt: cloudEvent.updatedAt || now };

            if (!localMatch) {
                pullLog.eventsAdded.push(cloudEvent.title);
                await db.events.put(eventToSave);
            } else {
                const cloudUpdated = cloudEvent.updatedAt || '1970-01-01T00:00:00.000Z';
                if (cloudUpdated > lastSyncTime && !localMatch.isDirty) {
                    pullLog.eventsUpdated.push(cloudEvent.title);
                    await db.events.put(eventToSave);
                }
            }
        } } catch(e) { console.error('Error syncing events pull:', e); }

        // 🪦 6a-2. حذف الرحلات والأحداث المحذوفة سحابياً
        try {
            const cloudEventsIdSet = new Set(cloudEvents.map(e => String(e.id)));
            for (const localEvent of localEvents) {
                if (pushedEventsIds.has(localEvent.id)) continue;
                if (localEvent.isDirty) continue;
                const isGlobal = localEvent.isGlobal || localEvent.syncKey === 'global';
                const belongs = isAdmin || isGlobal || (localEvent.syncKey && syncedSyncKeys.has(String(localEvent.syncKey)));
                if (!belongs) continue;
                if (!cloudEventsIdSet.has(String(localEvent.id))) {
                    await db.events.delete(localEvent.id);
                }
            }
        } catch (e) {
            console.error('Error reconciling deleted events during pull:', e);
        }

        const localActivitiesMap = new Map(localActivities.map(a => [a.id, a]));
        try { for (const cloudActivity of cloudActivities) {
            if (pushedActivitiesIds.has(cloudActivity.id)) continue;
            
            const localMatch = localActivitiesMap.get(cloudActivity.id);
            const syncKeyToSave = (isAdmin || isStageAdmin) ? (cloudActivity.syncKey || currentSyncKey) : currentSyncKey;
            
            const activityToSave = { ...cloudActivity, syncKey: String(syncKeyToSave), isDirty: false, isDeleted: false, updatedAt: cloudActivity.updatedAt || now };

            if (!localMatch) {
                pullLog.activitiesAdded.push(cloudActivity.text.substring(0, 10));
                await db.activities.put(activityToSave);
            } else {
                const cloudUpdated = cloudActivity.updatedAt || '1970-01-01T00:00:00.000Z';
                if (cloudUpdated > lastSyncTime && !localMatch.isDirty) {
                    pullLog.activitiesUpdated.push(cloudActivity.text.substring(0, 10));
                    await db.activities.put(activityToSave);
                }
            }
        } } catch(e) { console.error('Error syncing activities pull:', e); }

        // 🪦 6a-4. حذف الأنشطة المحذوفة سحابياً
        try {
            const cloudActivitiesIdSet = new Set(cloudActivities.map(a => String(a.id)));
            for (const localAct of localActivities) {
                if (pushedActivitiesIds.has(localAct.id)) continue;
                if (localAct.isDirty) continue;
                const belongs = isAdmin || (localAct.syncKey && syncedSyncKeys.has(String(localAct.syncKey)));
                if (!belongs) continue;
                if (!cloudActivitiesIdSet.has(String(localAct.id))) {
                    await db.activities.delete(localAct.id);
                }
            }
        } catch (e) {
            console.error('Error reconciling deleted activities during pull:', e);
        }

        // 📝 6b. سحب الامتحانات (Exams metadata pull)
        let cloudExamsList = [];
        try {
            if (isAdmin) {
                const examsSnapshot = await getDocs(collectionGroup(firestore, 'exams'));
                // Filter only exam-level docs (those under Osras/{key}/exams, not grades subcollections)
                cloudExamsList = (examsSnapshot?.docs || [])
                    .filter(d => d.ref.parent.id === 'exams')
                    .map(d => ({ firebaseId: d.id, ...d.data() }))
                    .filter(Boolean);
            } else if (isStageAdmin) {
                if (allowedClasses.length > 0) {
                    const examsSnaps = await Promise.all(allowedClasses.map(key => getDocs(collection(firestore, 'Osras', key, 'exams')).catch(() => ({ docs: [] }))));
                    cloudExamsList = examsSnaps.flatMap(snap => (snap?.docs || []).map(d => ({ firebaseId: d.id, ...d.data() }))).filter(Boolean);
                }
            } else {
                const examsSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'exams')).catch(() => ({ docs: [] }));
                cloudExamsList = (examsSnapshot?.docs || []).map(d => ({ firebaseId: d.id, ...d.data() })).filter(Boolean);
            }
        } catch (examsPullErr) {
            console.warn('[Sync] Secondary exams pull warning:', examsPullErr?.message || examsPullErr);
        }

        const localExamsMap = new Map(localExams.map(e => [e.firebaseId, e]));
        try { for (const cloudExam of cloudExamsList) {
            if (pushedExamIds.has(cloudExam.firebaseId)) continue;

            const localMatch = localExamsMap.get(cloudExam.firebaseId);
            const syncKeyToSave = (isAdmin || isStageAdmin) ? (cloudExam.syncKey || currentSyncKey) : currentSyncKey;
            const examToSave = {
                firebaseId: cloudExam.firebaseId,
                examName: cloudExam.examName,
                maxGrade: cloudExam.maxGrade,
                date: cloudExam.date,
                syncKey: String(syncKeyToSave),
                isDirty: false,
                isDeleted: false,
                updatedAt: cloudExam.updatedAt || now
            };

            if (!localMatch) {
                pullLog.examsAdded.push(cloudExam.examName);
                await db.exams.add(examToSave);
            } else {
                const cloudUpdated = cloudExam.updatedAt || '1970-01-01T00:00:00.000Z';
                if (cloudUpdated > lastSyncTime && !localMatch.isDirty) {
                    pullLog.examsUpdated.push(cloudExam.examName);
                    await db.exams.update(localMatch.id, examToSave);
                }
            }
        } } catch(e) { console.error('Error syncing exams pull:', e); }

        // 🎓 6c. سحب الدرجات (Grades pull)
        const cloudGradesKeySet = new Set();
        try { for (const cloudExam of cloudExamsList) {
            let cloudGradesDocs = [];
            try {
                const gradesColRef = collection(firestore, 'Osras', (isAdmin || isStageAdmin) ? (cloudExam.syncKey || currentSyncKey) : currentSyncKey, 'exams', cloudExam.firebaseId, 'grades');
                const gradesSnapshot = await getDocs(gradesColRef);
                cloudGradesDocs = gradesSnapshot?.docs || [];
            } catch (_e) {
                continue; // Skip if the subcollection doesn't exist
            }

            for (const gradeDoc of cloudGradesDocs) {
                const rawData = gradeDoc.data();
                const gradeData = rawData.payload ? decryptData(rawData.payload) : rawData;
                if (!gradeData || !gradeData.childId) continue;

                const gradeKey = `${cloudExam.firebaseId}_${gradeData.childId}`;
                cloudGradesKeySet.add(gradeKey);
                cloudGradesKeySet.add(`${cloudExam.firebaseId}_${String(gradeData.childId)}`);

                if (pushedGradeKeys.has(gradeKey)) continue;

                // Find local match by examId + childId
                const localGradeMatch = localGrades.find(
                    g => g.examId === cloudExam.firebaseId && String(g.childId) === String(gradeData.childId)
                );

                const syncKeyToSave = (isAdmin || isStageAdmin) ? (gradeData.syncKey || currentSyncKey) : currentSyncKey;
                const gradeToSave = {
                    childId: gradeData.childId,
                    grade: gradeData.grade,
                    examId: cloudExam.firebaseId,
                    examName: gradeData.examName || cloudExam.examName,
                    maxGrade: gradeData.maxGrade || cloudExam.maxGrade,
                    date: gradeData.date || cloudExam.date,
                    syncKey: String(syncKeyToSave),
                    isDirty: false,
                    isDeleted: false,
                    updatedAt: gradeData.updatedAt || now
                };

                if (!localGradeMatch) {
                    pullLog.gradesAdded.push(`${cloudExam.examName}/${gradeData.childId}`);
                    await db.grades.add(gradeToSave);
                } else {
                    const cloudUpdated = gradeData.updatedAt || '1970-01-01T00:00:00.000Z';
                    if (cloudUpdated > lastSyncTime && !localGradeMatch.isDirty) {
                        pullLog.gradesUpdated.push(`${cloudExam.examName}/${gradeData.childId}`);
                        await db.grades.update(localGradeMatch.id, gradeToSave);
                    }
                }
            }
        } } catch(e) { console.error('Error syncing grades pull:', e); }

        // 🪦 6a-5. حذف الامتحانات والدرجات المحذوفة سحابياً من Dexie
        try {
            const cloudExamsKeySet = new Set(cloudExamsList.map(e => e.firebaseId));
            for (const localExam of localExams) {
                if (pushedExamIds.has(localExam.firebaseId)) continue;
                if (localExam.isDirty) continue;
                const belongs = isAdmin || (localExam.syncKey && syncedSyncKeys.has(String(localExam.syncKey)));
                if (!belongs) continue;
                if (!cloudExamsKeySet.has(localExam.firebaseId)) {
                    await db.exams.delete(localExam.id);
                    await db.grades.where('examId').equals(localExam.firebaseId).delete();
                }
            }

            for (const localGrade of localGrades) {
                const gradeKey = `${localGrade.examId}_${localGrade.childId}`;
                if (pushedGradeKeys.has(gradeKey)) continue;
                if (localGrade.isDirty) continue;
                const belongs = isAdmin || (localGrade.syncKey && syncedSyncKeys.has(String(localGrade.syncKey)));
                if (!belongs) continue;
                if (!cloudGradesKeySet.has(gradeKey) && !cloudGradesKeySet.has(`${localGrade.examId}_${String(localGrade.childId)}`)) {
                    await db.grades.delete(localGrade.id);
                }
            }
        } catch (e) {
            console.error('Error reconciling deleted exams/grades during pull:', e);
        }

        // 🕐 تحديث آخر وقت مزامنة
        // Class checkpoints are committed by syncScopedClassesFromCloud only after success.

        // 🌟 7. بناء رسالة التقرير المفصلة والنهائية
        let finalMessage = isAdmin
            ? "👑 تمت المزامنة المركزية بنجاح!\n\n"
            : "☁️ تمت المزامنة لأسرتك بنجاح!\n\n";

        if (settingsUpdated) finalMessage += "⚙️ تم سحب تحديثات الهيكل المركزي.\n\n";

        let hasPush = (pushLog.children?.length || 0) > 0 || (pushLog.attendance?.length || 0) > 0 || (pushLog.events?.length || 0) > 0 || (pushLog.grades?.length || 0) > 0 || (pushLog.exams?.length || 0) > 0 || (pushLog.activities?.length || 0) > 0;
        if (hasPush) {
            finalMessage += `⬆️ تم الرفع للسحابة:\n`;
            if ((pushLog.children?.length || 0) > 0) finalMessage += `👦 مخدومين (${(pushLog.children?.length || 0)}): ${formatDetailedList(pushLog.children)}\n`;
            if ((pushLog.attendance?.length || 0) > 0) finalMessage += `📅 غياب (${(pushLog.attendance?.length || 0)}): ${formatDetailedList(pushLog.attendance)}\n`;
            if ((pushLog.events?.length || 0) > 0) finalMessage += `🏕️ أحداث (${(pushLog.events?.length || 0)}): ${formatDetailedList(pushLog.events)}\n`;
            if ((pushLog.exams?.length || 0) > 0) finalMessage += `📝 امتحانات (${(pushLog.exams?.length || 0)}): ${formatDetailedList(pushLog.exams)}\n`;
            if ((pushLog.grades?.length || 0) > 0) finalMessage += `🎓 درجات (${(pushLog.grades?.length || 0)}): ${formatDetailedList(pushLog.grades)}\n`;
            if ((pushLog.activities?.length || 0) > 0) finalMessage += `🎯 أنشطة (${(pushLog.activities?.length || 0)}): ${formatDetailedList(pushLog.activities)}\n`;
            finalMessage += `\n`;
        }

        let hasPull = (pullLog.childrenAdded?.length || 0) > 0 || (pullLog.childrenUpdated?.length || 0) > 0 || (pullLog.attendanceAdded?.length || 0) > 0 || (pullLog.eventsAdded?.length || 0) > 0 || (pullLog.eventsUpdated?.length || 0) > 0 || (pullLog.gradesAdded?.length || 0) > 0 || (pullLog.gradesUpdated?.length || 0) > 0 || (pullLog.examsAdded?.length || 0) > 0 || (pullLog.examsUpdated?.length || 0) > 0 || (pullLog.activitiesAdded?.length || 0) > 0 || (pullLog.activitiesUpdated?.length || 0) > 0;
        if (hasPull) {
            finalMessage += `⬇️ تم الاستقبال من السحابة:\n`;
            if ((pullLog.childrenAdded?.length || 0) > 0) finalMessage += `➕ مخدومين جُداد (${(pullLog.childrenAdded?.length || 0)}): ${formatDetailedList(pullLog.childrenAdded)}\n`;
            if ((pullLog.childrenUpdated?.length || 0) > 0) finalMessage += `🔄 تحديث مخدومين (${(pullLog.childrenUpdated?.length || 0)}): ${formatDetailedList(pullLog.childrenUpdated)}\n`;
            if ((pullLog.attendanceAdded?.length || 0) > 0) finalMessage += `➕ غياب مسجل (${(pullLog.attendanceAdded?.length || 0)}): ${formatDetailedList(pullLog.attendanceAdded)}\n`;
            if ((pullLog.eventsAdded?.length || 0) > 0) finalMessage += `➕ رحلات جديدة (${(pullLog.eventsAdded?.length || 0)}): ${formatDetailedList(pullLog.eventsAdded)}\n`;
            if ((pullLog.eventsUpdated?.length || 0) > 0) finalMessage += `🔄 تحديث رحلات (${(pullLog.eventsUpdated?.length || 0)}): ${formatDetailedList(pullLog.eventsUpdated)}\n`;
            if ((pullLog.examsAdded?.length || 0) > 0) finalMessage += `➕ امتحانات جديدة (${(pullLog.examsAdded?.length || 0)}): ${formatDetailedList(pullLog.examsAdded)}\n`;
            if ((pullLog.examsUpdated?.length || 0) > 0) finalMessage += `🔄 تحديث امتحانات (${(pullLog.examsUpdated?.length || 0)}): ${formatDetailedList(pullLog.examsUpdated)}\n`;
            if ((pullLog.gradesAdded?.length || 0) > 0) finalMessage += `➕ درجات جديدة (${(pullLog.gradesAdded?.length || 0)}): ${formatDetailedList(pullLog.gradesAdded)}\n`;
            if ((pullLog.gradesUpdated?.length || 0) > 0) finalMessage += `🔄 تحديث درجات (${(pullLog.gradesUpdated?.length || 0)}): ${formatDetailedList(pullLog.gradesUpdated)}\n`;
            if ((pullLog.activitiesAdded?.length || 0) > 0) finalMessage += `➕ أنشطة جديدة (${(pullLog.activitiesAdded?.length || 0)}): ${formatDetailedList(pullLog.activitiesAdded)}\n`;
            if ((pullLog.activitiesUpdated?.length || 0) > 0) finalMessage += `🔄 تحديث أنشطة (${(pullLog.activitiesUpdated?.length || 0)}): ${formatDetailedList(pullLog.activitiesUpdated)}\n`;
        }

        if (!hasPush && !hasPull && !settingsUpdated) {
            finalMessage = "✅ المزامنة تمت، جميع البيانات محدثة بالفعل (لا يوجد جديد للرفع أو السحب).";
        }

        return { success: true, message: `تم تحديث الأطفال والحضور في ${scopedResult.classCount} فصل.\n${finalMessage}` };
    } catch (error) {
        console.error("Sync Error: ", error);
        return { success: false, message: `حصلت مشكلة: ${error.message}` };
    }
};

let activeSync = null;
export const syncDataWithCloud = () => {
    if (activeSync) return activeSync;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return Promise.resolve({ success: false, message: 'لا يوجد اتصال بالإنترنت' });
    }
    const currentSyncKey = typeof localStorage !== 'undefined' ? localStorage.getItem('currentSyncKey') : null;
    if (!currentSyncKey) {
        return Promise.resolve({ success: false, skipped: true, message: 'غير مسجل الدخول' });
    }
    const finishStatus = beginSyncStatus();
    let outcome = 'error';
    const task = _syncDataWithCloud()
        .catch(error => ({ success: false, message: error?.message || 'حدث خطأ أثناء المزامنة' }))
        .then(result => { outcome = result?.success ? 'success' : 'error'; return result; })
        .finally(() => {
            if (activeSync === task) activeSync = null;
            finishStatus(outcome);
        });
    activeSync = task;
    return task;
};

/**
 * 🗑️ Deletes a child from local Dexie DB and Firebase Firestore with full synchronization,
 * tombstone cleanup, and activity logging for Master Logs audit trail.
 *
 * @param {string|number} childId - The ID of the child to delete.
 * @param {object} [cachedChildData] - Optional cached child object.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const deleteChildRecord = (id, cachedChild = null) => deleteChildEverywhere(
    cachedChild || id, JSON.parse(localStorage.getItem('currentServant') || '{}').name || 'خادم'
);
