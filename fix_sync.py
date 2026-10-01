import re

with open('src/db/sync.js', 'r') as f:
    content = f.read()

# Fix 1: formatDetailedList
content = content.replace(
    "const formatDetailedList = (list) => {\n    if (list.length === 0) return \"لا يوجد\";\n    if (list.length <= 4) return list.join('، ');\n    return `${list.slice(0, 4).join('، ')} ... (+${list.length - 4} آخرين)`;\n};",
    "const formatDetailedList = (list) => {\n    const safeList = list || [];\n    if (safeList.length === 0) return \"لا يوجد\";\n    if (safeList.length <= 4) return safeList.join('، ');\n    return `${safeList.slice(0, 4).join('، ')} ... (+${safeList.length - 4} آخرين)`;\n};"
)

# Fix 2: safe length checks in finalMessage
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
content = re.sub(
    r'(for \(const child of localChildren\) \{.*?pushedChildrenIds\.add\(child\.id\);\n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pushing children:", e); }',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'(for \(const record of localAttendance\) \{.*?pushedAttendanceIds\.add\(docId\);\n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pushing attendance:", e); }',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'(for \(const event of localEvents\) \{.*?pushedEventsIds\.add\(event\.id\);\n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pushing events:", e); }',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'(for \(const exam of localExams\) \{.*?pushedExamIds\.add\(examFirebaseId\);\n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pushing exams:", e); }',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'(for \(const grade of localGrades\) \{.*?pushedGradeKeys\.add\(gradeKey\);\n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pushing grades:", e); }',
    content,
    flags=re.DOTALL
)

# Fix 5: wrap pull logic in try-catch
content = re.sub(
    r'(for \(const cloudChild of cloudChildren\) \{.*?\} \n\s*\})',
    r'try { \1 } catch(e) { console.error("Error pulling children:", e); }',
    content,
    flags=re.DOTALL
)
# The above regex for children pull is tricky because there are multiple nested braces.
# I will use a different approach for pulls:
