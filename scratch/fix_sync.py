import re
import sys

with open('/home/arsany/Desktop/mr-gergs/src/db/sync.js', 'r') as f:
    content = f.read()

# Fix 1: formatDetailedList
content = content.replace(
    "const formatDetailedList = (list) => {\n    if (list.length === 0) return \"لا يوجد\";\n    if (list.length <= 4) return list.join('، ');\n    return `${list.slice(0, 4).join('، ')} ... (+${list.length - 4} آخرين)`;\n};",
    "const formatDetailedList = (list) => {\n    const safeList = list || [];\n    if (safeList.length === 0) return \"لا يوجد\";\n    if (safeList.length <= 4) return safeList.join('، ');\n    return `${safeList.slice(0, 4).join('، ')} ... (+${safeList.length - 4} آخرين)`;\n};"
)

# Fix 2: safe length checks in hasPush and hasPull
content = content.replace(
    "let hasPush = pushLog.children.length > 0 || pushLog.attendance.length > 0 || pushLog.events.length > 0 || pushLog.grades.length > 0 || pushLog.exams.length > 0 || pushLog.hymns.length > 0;",
    "let hasPush = (pushLog.children?.length || 0) > 0 || (pushLog.attendance?.length || 0) > 0 || (pushLog.events?.length || 0) > 0 || (pushLog.grades?.length || 0) > 0 || (pushLog.exams?.length || 0) > 0;"
)
content = content.replace(
    "let hasPull = pullLog.childrenAdded.length > 0 || pullLog.childrenUpdated.length > 0 || pullLog.attendanceAdded.length > 0 || pullLog.eventsAdded.length > 0 || pullLog.eventsUpdated.length > 0 || pullLog.gradesAdded.length > 0 || pullLog.gradesUpdated.length > 0 || pullLog.examsAdded.length > 0 || pullLog.examsUpdated.length > 0 || pullLog.hymnsAdded.length > 0 || pullLog.hymnsUpdated.length > 0;",
    "let hasPull = (pullLog.childrenAdded?.length || 0) > 0 || (pullLog.childrenUpdated?.length || 0) > 0 || (pullLog.attendanceAdded?.length || 0) > 0 || (pullLog.eventsAdded?.length || 0) > 0 || (pullLog.eventsUpdated?.length || 0) > 0 || (pullLog.gradesAdded?.length || 0) > 0 || (pullLog.gradesUpdated?.length || 0) > 0 || (pullLog.examsAdded?.length || 0) > 0 || (pullLog.examsUpdated?.length || 0) > 0;"
)
# And replace all occurrences of `pushLog.collection.length` and `pullLog.collection.length` in the `finalMessage +=` statements
content = re.sub(r'pushLog\.([a-zA-Z]+)\.length', r'(pushLog.\1?.length || 0)', content)
content = re.sub(r'pullLog\.([a-zA-Z]+)\.length', r'(pullLog.\1?.length || 0)', content)

# Fix 3: Optional empty arrays for fetch responses
content = content.replace("await db.children.toArray();", "(await db.children.toArray()) || [];")
content = content.replace("await db.attendance.toArray();", "(await db.attendance.toArray()) || [];")
content = content.replace("await db.events.toArray();", "(await db.events.toArray()) || [];")
content = content.replace("await db.exams.toArray();", "(await db.exams.toArray()) || [];")
content = content.replace("await db.grades.toArray();", "(await db.grades.toArray()) || [];")

content = content.replace("childrenSnapshot.docs.map(processCloudDoc).filter(Boolean);", "(childrenSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);")
content = content.replace("attendanceSnapshot.docs.map(processCloudDoc).filter(Boolean);", "(attendanceSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);")
content = content.replace("eventsSnapshot.docs.map(processCloudDoc).filter(Boolean);", "(eventsSnapshot?.docs || []).map(processCloudDoc).filter(Boolean);")

content = content.replace("examsSnapshot.docs\n                .filter", "(examsSnapshot?.docs || [])\n                .filter")
content = content.replace("examsSnapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() })).filter(Boolean);", "(examsSnapshot?.docs || []).map(d => ({ firebaseId: d.id, ...d.data() })).filter(Boolean);")

content = content.replace("cloudGradesDocs = gradesSnapshot.docs;", "cloudGradesDocs = gradesSnapshot?.docs || [];")

# Fix 4: wrap push logic in try-catch
content = content.replace("for (const child of localChildren) {", "try { for (const child of localChildren) {")
content = content.replace("pushedChildrenIds.add(child.id);\n        }", "pushedChildrenIds.add(child.id);\n        } } catch(e) { console.error('Error syncing children push:', e); }")

content = content.replace("for (const record of localAttendance) {", "try { for (const record of localAttendance) {")
content = content.replace("pushedAttendanceIds.add(docId);\n        }", "pushedAttendanceIds.add(docId);\n        } } catch(e) { console.error('Error syncing attendance push:', e); }")

content = content.replace("for (const event of localEvents) {", "try { for (const event of localEvents) {")
content = content.replace("pushedEventsIds.add(event.id);\n        }", "pushedEventsIds.add(event.id);\n        } } catch(e) { console.error('Error syncing events push:', e); }")

content = content.replace("for (const exam of localExams) {", "try { for (const exam of localExams) {")
content = content.replace("pushedExamIds.add(examFirebaseId);\n        }", "pushedExamIds.add(examFirebaseId);\n        } } catch(e) { console.error('Error syncing exams push:', e); }")

content = content.replace("for (const grade of localGrades) {", "try { for (const grade of localGrades) {")
content = content.replace("pushedGradeKeys.add(gradeKey);\n        }", "pushedGradeKeys.add(gradeKey);\n        } } catch(e) { console.error('Error syncing grades push:', e); }")


# Fix 5: wrap pull logic in try-catch
content = content.replace("for (const cloudChild of cloudChildren) {", "try { for (const cloudChild of cloudChildren) {")
content = content.replace("await db.children.put(childToSave); \n                }\n            }\n        }", "await db.children.put(childToSave); \n                }\n            }\n        } } catch(e) { console.error('Error syncing children pull:', e); }")

content = content.replace("for (const cloudEvent of cloudEvents) {", "try { for (const cloudEvent of cloudEvents) {")
content = content.replace("await db.events.put(eventToSave);\n                }\n            }\n        }", "await db.events.put(eventToSave);\n                }\n            }\n        } } catch(e) { console.error('Error syncing events pull:', e); }")

content = content.replace("for (const cAtt of cloudAttendance) {", "try { for (const cAtt of cloudAttendance) {")
content = content.replace("pullLog.attendanceAdded.push(`${kidName}(${cAtt.date.slice(5)})`);\n            }\n        }", "pullLog.attendanceAdded.push(`${kidName}(${cAtt.date.slice(5)})`);\n            }\n        } } catch(e) { console.error('Error syncing attendance pull:', e); }")

content = content.replace("for (const cloudExam of cloudExamsList) {", "try { for (const cloudExam of cloudExamsList) {")
# Note: cloudExamsList loop has a different end structure
content = content.replace("await db.exams.update(localMatch.id, examToSave);\n                }\n            }\n        }", "await db.exams.update(localMatch.id, examToSave);\n                }\n            }\n        } } catch(e) { console.error('Error syncing exams pull:', e); }")

# Grades pull has two loops, we wrap the outer one
content = content.replace("// Pull grades for each cloud exam\n        for (const cloudExam of cloudExamsList) {", "// Pull grades for each cloud exam\n        try { for (const cloudExam of cloudExamsList) {")
content = content.replace("await db.grades.update(localGradeMatch.id, gradeToSave);\n                    }\n                }\n            }\n        }", "await db.grades.update(localGradeMatch.id, gradeToSave);\n                    }\n                }\n            }\n        } } catch(e) { console.error('Error syncing grades pull:', e); }")


with open('/home/arsany/Desktop/mr-gergs/src/db/sync.js', 'w') as f:
    f.write(content)
print("done")
