import { db } from './database';
import { firestore } from './firebase';
import { collection, collectionGroup, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

// 🌟 استدعاء دوال التشفير وفك التشفير اللي عملناهم
import { encryptData, decryptData } from '../encryption';

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
    if (list.length === 0) return "لا يوجد";
    if (list.length <= 4) return list.join('، ');
    return `${list.slice(0, 4).join('، ')} ... (+${list.length - 4} آخرين)`;
};

const _syncDataWithCloud = async () => {
    try {
        // 🔐 1. هنجيب مفتاح الكلاود 
        const currentSyncKey = localStorage.getItem('currentSyncKey');

        if (!currentSyncKey) {
            return { success: false, message: "❌ غير مصرح! برجاء تسجيل الدخول بمفتاح الكلاود الخاص بأسرتك أولاً." };
        }

        // 🌟 تفاصيل العمليات (Detailed Logs)
        let pushLog = { children: [], attendance: [], events: [], grades: [], exams: [] };
        let pullLog = { 
            childrenAdded: [], childrenUpdated: [], 
            attendanceAdded: [], 
            eventsAdded: [], eventsUpdated: [],
            gradesAdded: [], gradesUpdated: [],
            examsAdded: [], examsUpdated: []
        };

        let pushedChildrenIds = new Set();
        let pushedAttendanceIds = new Set();
        let pushedEventsIds = new Set();
        let pushedGradeKeys = new Set();
        let pushedExamIds = new Set();

        let settingsUpdated = false;

        const isAdmin = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

        // 🌟 2. سحب إعدادات الكنيسة والخدام (System Settings)
        const settingsRef = doc(firestore, 'System', 'mainConfig');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
            const cloudSettings = settingsSnap.data();
            const localSettingsString = localStorage.getItem('appSettings');
            
            if (JSON.stringify(cloudSettings) !== localSettingsString) {
                const hasPendingSettings = localStorage.getItem('pendingStructureSync') === 'true';
                if (!hasPendingSettings) {
                    const localParsed = JSON.parse(localSettingsString || '{}');
                    const mergedSettings = { ...localParsed, ...cloudSettings };
                    localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
                    settingsUpdated = true;
                }
            }
        }
        // -------------------------------------------------------------

        const now = new Date().toISOString();
        const lastSyncTime = localStorage.getItem('lastSyncTime') || '1970-01-01T00:00:00.000Z';

        // 🌟 3. السحب أولاً (Pull) من السحابة 🌟
        let cloudChildren = [];
        let cloudAttendance = [];
        let cloudEvents = [];

        const processCloudDoc = (doc) => {
            const rawData = doc.data();
            return rawData.payload ? decryptData(rawData.payload) : rawData;
        };

        if (isAdmin) {
            const childrenSnapshot = await getDocs(collectionGroup(firestore, 'children'));
            cloudChildren = childrenSnapshot.docs.map(processCloudDoc).filter(Boolean);

            const attendanceSnapshot = await getDocs(collectionGroup(firestore, 'attendance'));
            cloudAttendance = attendanceSnapshot.docs.map(processCloudDoc).filter(Boolean);

            const eventsSnapshot = await getDocs(collectionGroup(firestore, 'events'));
            cloudEvents = eventsSnapshot.docs.map(processCloudDoc).filter(Boolean);
            
        } else {
            const childrenSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'children'));
            cloudChildren = childrenSnapshot.docs.map(processCloudDoc).filter(Boolean);

            const attendanceSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'attendance'));
            cloudAttendance = attendanceSnapshot.docs.map(processCloudDoc).filter(Boolean);

            const eventsSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'events'));
            cloudEvents = eventsSnapshot.docs.map(processCloudDoc).filter(Boolean);
            
        }

        // تحويل داتا الكلاود لخرائط (Maps) عشان المقارنة تبقى بسرعة الصاروخ
        const cloudChildrenMap = new Map(cloudChildren.map(c => [c.id, c]));
        const cloudAttendanceMap = new Map(cloudAttendance.map(a => [`${a.date}_${a.childId}_${a.type}`, a]));
        const cloudEventsMap = new Map(cloudEvents.map(e => [e.id, e]));

        // 4. هنجيب الداتا من الموبايل (أوفلاين)
        const localChildren = await db.children.toArray();
        const localAttendance = await db.attendance.toArray();
        const localEvents = await db.events.toArray();

        // 🚀🚀 5. الرفع للسحابة (Push) "بنظام isDirty" — نرفع الـ dirty بس 🚀🚀
        for (const child of localChildren) {
            if (!child.isDirty) continue; // ✨ Skip clean records
            
            const targetKey = isAdmin ? child.syncKey : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE') continue;

            const docRef = doc(firestore, 'Osras', targetKey, 'children', child.id.toString());

            // 🪦 Tombstone handling: if record is soft-deleted, delete from cloud then purge locally
            if (child.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore if not found */ }
                await db.children.delete(child.id);
                pushLog.children.push(`🗑️${(child.name || '').split(' ')[0]}`);
                pushedChildrenIds.add(child.id);
                continue;
            }

            const encryptedPayload = encryptData(cleanData({ ...child, syncKey: targetKey, isDirty: false, isDeleted: false }));
            await setDoc(docRef, { payload: encryptedPayload }, { merge: true });
            await db.children.update(child.id, { isDirty: false, updatedAt: now });
            pushLog.children.push(child.name.split(' ')[0]); 
            pushedChildrenIds.add(child.id);
        }

        for (const record of localAttendance) {
            if (!record.isDirty) continue; // ✨ Skip clean records

            const targetKey = isAdmin ? record.syncKey : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE') continue;

            const docId = `${record.date}_${record.childId}_${record.type}`;
            const docRef = doc(firestore, 'Osras', targetKey, 'attendance', docId);

            // 🪦 Tombstone: soft-deleted attendance
            if (record.isDeleted) {
                try { await deleteDoc(docRef); } catch (_e) { /* ignore */ }
                await db.attendance.delete(record.id);
                pushLog.attendance.push(`🗑️${record.date}`);
                pushedAttendanceIds.add(docId);
                continue;
            }

            const encryptedPayload = encryptData(cleanData({ ...record, syncKey: targetKey, isDirty: false, isDeleted: false }));
            await setDoc(docRef, { payload: encryptedPayload }, { merge: true });
            await db.attendance.update(record.id, { isDirty: false, updatedAt: now });
            pushLog.attendance.push(record.date); 
            pushedAttendanceIds.add(docId);
        }

        for (const event of localEvents) {
            if (!event.isDirty) continue; // ✨ Skip clean records

            const targetKey = isAdmin ? event.syncKey : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE') continue;

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
        }


        // 📝 5b. رفع الامتحانات (Exams metadata push) — isDirty فقط
        const localExams = await db.exams.toArray();
        for (const exam of localExams) {
            if (!exam.isDirty) continue;

            const targetKey = isAdmin ? (exam.syncKey || currentSyncKey) : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE') continue;

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
        }

        // 🎓 5c. رفع الدرجات (Grades push) — isDirty فقط
        const localGrades = await db.grades.toArray();
        for (const grade of localGrades) {
            if (!grade.isDirty) continue;

            const targetKey = isAdmin ? (grade.syncKey || currentSyncKey) : currentSyncKey;
            if (!targetKey || targetKey === 'MASTER_ACCESS' || targetKey === 'ADMIN_MODE') continue;

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
        }

        // 🌟🌟 6. تحديث داتا الموبايل (Pull) "بنظام updatedAt delta" 🌟🌟
        const localChildrenMap = new Map(localChildren.map(c => [c.id, c]));
        
        for (const cloudChild of cloudChildren) {
            if (pushedChildrenIds.has(cloudChild.id)) continue; // Skip records we just pushed
            
            const localMatch = localChildrenMap.get(cloudChild.id);
            const syncKeyToSave = isAdmin ? (cloudChild.syncKey || currentSyncKey) : currentSyncKey;
            const childToSave = { ...cloudChild, syncKey: String(syncKeyToSave), isDirty: false, isDeleted: false, updatedAt: cloudChild.updatedAt || now };

            if (!localMatch) {
                pullLog.childrenAdded.push(cloudChild.name.split(' ')[0]);
                await db.children.put(childToSave); 
            } else {
                // Pull only if cloud record is newer than our lastSyncTime (timestamp-delta)
                const cloudUpdated = cloudChild.updatedAt || '1970-01-01T00:00:00.000Z';
                if (cloudUpdated > lastSyncTime && !localMatch.isDirty) {
                    pullLog.childrenUpdated.push(cloudChild.name.split(' ')[0]);
                    await db.children.put(childToSave); 
                }
            }
        }

        const localEventsMap = new Map(localEvents.map(e => [e.id, e]));
        for (const cloudEvent of cloudEvents) {
            if (pushedEventsIds.has(cloudEvent.id)) continue;
            
            const localMatch = localEventsMap.get(cloudEvent.id);
            const syncKeyToSave = isAdmin ? (cloudEvent.syncKey || currentSyncKey) : currentSyncKey;
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
        }


        const localAttendanceMap = new Map(localAttendance.map(a => [`${a.date}_${a.childId}_${a.type}`, a]));
        for (const cAtt of cloudAttendance) {
            const docId = `${cAtt.date}_${cAtt.childId}_${cAtt.type}`;
            if (pushedAttendanceIds.has(docId)) continue;
            
            if (!localAttendanceMap.has(docId)) {
                const { id: _id, ...dataToInsert } = cAtt;
                const syncKeyToSave = isAdmin ? (dataToInsert.syncKey || currentSyncKey) : currentSyncKey;
                await db.attendance.add({ ...dataToInsert, syncKey: String(syncKeyToSave), isDirty: false, isDeleted: false, updatedAt: cAtt.updatedAt || now });
                
                const childInfo = await db.children.get(cAtt.childId);
                const kidName = childInfo ? childInfo.name.split(' ')[0] : 'طفل';
                pullLog.attendanceAdded.push(`${kidName}(${cAtt.date.slice(5)})`);
            }
        }

        // 📝 6b. سحب الامتحانات (Exams metadata pull)
        let cloudExamsList = [];
        if (isAdmin) {
            const examsSnapshot = await getDocs(collectionGroup(firestore, 'exams'));
            // Filter only exam-level docs (those under Osras/{key}/exams, not grades subcollections)
            cloudExamsList = examsSnapshot.docs
                .filter(d => d.ref.parent.id === 'exams')
                .map(d => ({ firebaseId: d.id, ...d.data() }))
                .filter(Boolean);
        } else {
            const examsSnapshot = await getDocs(collection(firestore, 'Osras', currentSyncKey, 'exams'));
            cloudExamsList = examsSnapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() })).filter(Boolean);
        }

        const localExamsMap = new Map(localExams.map(e => [e.firebaseId, e]));
        for (const cloudExam of cloudExamsList) {
            if (pushedExamIds.has(cloudExam.firebaseId)) continue;

            const localMatch = localExamsMap.get(cloudExam.firebaseId);
            const syncKeyToSave = isAdmin ? (cloudExam.syncKey || currentSyncKey) : currentSyncKey;
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
        }

        // 🎓 6c. سحب الدرجات (Grades pull)
        // Pull grades for each cloud exam
        for (const cloudExam of cloudExamsList) {
            let cloudGradesDocs = [];
            try {
                const gradesColRef = collection(firestore, 'Osras', isAdmin ? (cloudExam.syncKey || currentSyncKey) : currentSyncKey, 'exams', cloudExam.firebaseId, 'grades');
                const gradesSnapshot = await getDocs(gradesColRef);
                cloudGradesDocs = gradesSnapshot.docs;
            } catch (_e) {
                continue; // Skip if the subcollection doesn't exist
            }

            for (const gradeDoc of cloudGradesDocs) {
                const rawData = gradeDoc.data();
                const gradeData = rawData.payload ? decryptData(rawData.payload) : rawData;
                if (!gradeData || !gradeData.childId) continue;

                const gradeKey = `${cloudExam.firebaseId}_${gradeData.childId}`;
                if (pushedGradeKeys.has(gradeKey)) continue;

                // Find local match by examId + childId
                const localGradeMatch = localGrades.find(
                    g => g.examId === cloudExam.firebaseId && g.childId === gradeData.childId
                );

                const syncKeyToSave = isAdmin ? (gradeData.syncKey || currentSyncKey) : currentSyncKey;
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
        }

        // 🕐 تحديث آخر وقت مزامنة
        localStorage.setItem('lastSyncTime', now);

        // 🌟 7. بناء رسالة التقرير المفصلة والنهائية
        let finalMessage = isAdmin
            ? "👑 تمت المزامنة المركزية بنجاح!\n\n"
            : "☁️ تمت المزامنة لأسرتك بنجاح!\n\n";

        if (settingsUpdated) finalMessage += "⚙️ تم سحب تحديثات الهيكل المركزي.\n\n";

        let hasPush = pushLog.children.length > 0 || pushLog.attendance.length > 0 || pushLog.events.length > 0 || pushLog.grades.length > 0 || pushLog.exams.length > 0 || pushLog.hymns.length > 0;
        if (hasPush) {
            finalMessage += `⬆️ تم الرفع للسحابة:\n`;
            if (pushLog.children.length > 0) finalMessage += `👦 أطفال (${pushLog.children.length}): ${formatDetailedList(pushLog.children)}\n`;
            if (pushLog.attendance.length > 0) finalMessage += `📅 غياب (${pushLog.attendance.length}): ${formatDetailedList(pushLog.attendance)}\n`;
            if (pushLog.events.length > 0) finalMessage += `🏕️ أحداث (${pushLog.events.length}): ${formatDetailedList(pushLog.events)}\n`;
            if (pushLog.exams.length > 0) finalMessage += `📝 امتحانات (${pushLog.exams.length}): ${formatDetailedList(pushLog.exams)}\n`;
            if (pushLog.grades.length > 0) finalMessage += `🎓 درجات (${pushLog.grades.length}): ${formatDetailedList(pushLog.grades)}\n`;
            finalMessage += `\n`;
        }

        let hasPull = pullLog.childrenAdded.length > 0 || pullLog.childrenUpdated.length > 0 || pullLog.attendanceAdded.length > 0 || pullLog.eventsAdded.length > 0 || pullLog.eventsUpdated.length > 0 || pullLog.gradesAdded.length > 0 || pullLog.gradesUpdated.length > 0 || pullLog.examsAdded.length > 0 || pullLog.examsUpdated.length > 0 || pullLog.hymnsAdded.length > 0 || pullLog.hymnsUpdated.length > 0;
        if (hasPull) {
            finalMessage += `⬇️ تم الاستقبال من السحابة:\n`;
            if (pullLog.childrenAdded.length > 0) finalMessage += `➕ أطفال جُداد (${pullLog.childrenAdded.length}): ${formatDetailedList(pullLog.childrenAdded)}\n`;
            if (pullLog.childrenUpdated.length > 0) finalMessage += `🔄 تحديث أطفال (${pullLog.childrenUpdated.length}): ${formatDetailedList(pullLog.childrenUpdated)}\n`;
            if (pullLog.attendanceAdded.length > 0) finalMessage += `➕ غياب مسجل (${pullLog.attendanceAdded.length}): ${formatDetailedList(pullLog.attendanceAdded)}\n`;
            if (pullLog.eventsAdded.length > 0) finalMessage += `➕ رحلات جديدة (${pullLog.eventsAdded.length}): ${formatDetailedList(pullLog.eventsAdded)}\n`;
            if (pullLog.eventsUpdated.length > 0) finalMessage += `🔄 تحديث رحلات (${pullLog.eventsUpdated.length}): ${formatDetailedList(pullLog.eventsUpdated)}\n`;
            if (pullLog.examsAdded.length > 0) finalMessage += `➕ امتحانات جديدة (${pullLog.examsAdded.length}): ${formatDetailedList(pullLog.examsAdded)}\n`;
            if (pullLog.examsUpdated.length > 0) finalMessage += `🔄 تحديث امتحانات (${pullLog.examsUpdated.length}): ${formatDetailedList(pullLog.examsUpdated)}\n`;
            if (pullLog.gradesAdded.length > 0) finalMessage += `➕ درجات جديدة (${pullLog.gradesAdded.length}): ${formatDetailedList(pullLog.gradesAdded)}\n`;
            if (pullLog.gradesUpdated.length > 0) finalMessage += `🔄 تحديث درجات (${pullLog.gradesUpdated.length}): ${formatDetailedList(pullLog.gradesUpdated)}\n`;
        }

        if (!hasPush && !hasPull && !settingsUpdated) {
            finalMessage = "✅ المزامنة تمت، جميع البيانات محدثة بالفعل (لا يوجد جديد للرفع أو السحب).";
        }

        return { success: true, message: finalMessage };
    } catch (error) {
        console.error("Sync Error: ", error);
        return { success: false, message: `حصلت مشكلة: ${error.message}` };
    }
};

export const syncDataWithCloud = async (retryCount = 0) => {
    // 1. Immediate hardware check Before starting
    if (!navigator.onLine) {
        return { success: false, message: "⚠️ لا يوجد اتصال بالإنترنت. يرجى المحاولة لاحقاً." };
    }

    try {
        // We race the entire Sync process against a hard 60-second timeout
        const syncTask = _syncDataWithCloud();

        const timeoutTask = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("NETWORK_TIMEOUT")), 60000)
        );

        return await Promise.race([syncTask, timeoutTask]);

    } catch (error) {
        if (error.message === "NETWORK_TIMEOUT") {
            if (retryCount < 1) {
                console.log("⏱️ Sync timeout. Retrying gracefully...");
                return await syncDataWithCloud(retryCount + 1);
            }
            return { success: false, message: "⏱️ انتهت مهلة الاتصال بالإنترنت أثناء الرفع. الرجاء التأكد من استقرار الشبكة." };
        }
        return { success: false, message: `حصلت مشكلة: ${error.message}` };
    }
};