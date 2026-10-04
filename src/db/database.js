import Dexie from 'dexie';

export const db = new Dexie('KhedmatyAppDB');

// زودنا الإصدار لـ 2 وضفنا (address, isBrother, gotClothes)
db.version(2).stores({
    children: '++id, name, phone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes',
    attendance: '++id, date, childId, type',
    events: 'id, syncKey, date, createdBy'
});

// 🔐 الإصدار 3: إضافة فهرس syncKey على الأطفال والغياب لعزل البيانات 100% لكل أسرة
db.version(3).stores({
    children: '++id, name, syncKey, phone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes',
    attendance: '++id, date, childId, type, syncKey',
    events: 'id, syncKey, date, createdBy'
});

// 🌟 الإصدار 4: إضافة جداول الدرجات (grades) والألحان (hymns) لخدمة الشمامسة
db.version(4).stores({
    children: '++id, name, syncKey, phone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes',
    attendance: '++id, date, childId, type, syncKey',
    events: 'id, syncKey, date, createdBy',
    grades: '++id, examName, date, childId, grade, maxGrade, syncKey, isDirty, synced',

});

// 🚀 الإصدار 5: Background Auto-Sync — إضافة isDirty و updatedAt و isDeleted لكل الجداول
db.version(5).stores({
    children: '++id, name, syncKey, phone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted',
    attendance: '++id, date, childId, type, syncKey, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examName, date, childId, grade, maxGrade, syncKey, isDirty, synced, updatedAt',

}).upgrade(tx => {
    const now = new Date().toISOString();
    return Promise.all([
        tx.table('children').toCollection().modify({ isDirty: true, updatedAt: now, isDeleted: false }),
        tx.table('attendance').toCollection().modify({ isDirty: true, updatedAt: now, isDeleted: false }),
        tx.table('events').toCollection().modify({ isDirty: true, updatedAt: now, isDeleted: false }),
        tx.table('grades').toCollection().modify({ isDirty: true, updatedAt: now }),

    ]);
});

// 📱 الإصدار 6: إضافة childPhone (رقم المخدوم الشخصي) — يدعم الشمامسة الكبار للدخول والافتقاد المباشر
db.version(6).stores({
    children: '++id, name, syncKey, phone, childPhone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted',
    attendance: '++id, date, childId, type, syncKey, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examName, date, childId, grade, maxGrade, syncKey, isDirty, synced, updatedAt',

}).upgrade(tx => {
    const now = new Date().toISOString();
    // 🌟 نضيف childPhone بشكل آمن — لو السجل معهوش الحقل ده نضيفه فارغ ونعمله dirty عشان يتحمّل على السحابة
    return tx.table('children').toCollection().modify(child => {
        if (child.childPhone === undefined) {
            child.childPhone = '';
            child.isDirty = true;
            child.updatedAt = now;
        }
    });
});

// 📝 الإصدار 7: إضافة جدول الامتحانات (exams) للتخزين المحلي — Offline-First Exam Metadata
db.version(7).stores({
    children: '++id, name, syncKey, phone, childPhone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted',
    attendance: '++id, date, childId, type, syncKey, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examId, examName, date, childId, grade, maxGrade, syncKey, isDirty, updatedAt, isDeleted',

    exams: '++id, firebaseId, syncKey, examName, maxGrade, date, isDirty, updatedAt, isDeleted'
});

// 📝 الإصدار 8: تحديث جدول الألحان (hymns) ليتوافق مع المزامنة (Offline-First Sync)
db.version(8).stores({
    children: '++id, name, syncKey, phone, childPhone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted',
    attendance: '++id, date, childId, type, syncKey, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examId, examName, date, childId, grade, maxGrade, syncKey, isDirty, updatedAt, isDeleted',

    exams: '++id, firebaseId, syncKey, examName, maxGrade, date, isDirty, updatedAt, isDeleted'
});

// 📝 الإصدار 9: تحديث الجداول للمتطلبات الجديدة للعميل (RBAC، تتبع الخدام، حضور بـ 3 حالات، وغيرها)
db.version(9).stores({
    children: '++id, name, syncKey, phone, childPhone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted, massAttendance, preparation, serviceMeetingAttendance, visitationParticipation, lastConfessionDate, activityParticipation, medicalStatus',
    servants: '++id, name, syncKey, phone, role, assignedStages, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, address, profilePic, isDirty, updatedAt, isDeleted, massAttendance, preparation, serviceMeetingAttendance, visitationParticipation, lastConfessionDate, activityParticipation, medicalStatus',
    attendance: '++id, date, childId, type, syncKey, status, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examId, examName, date, childId, grade, maxGrade, syncKey, isDirty, updatedAt, isDeleted',

    exams: '++id, firebaseId, syncKey, examName, maxGrade, date, isDirty, updatedAt, isDeleted'
});

// 📝 الإصدار 11: حذف الجداول القديمة تماماً لتجاوز خطأ تغيير الـ Primary Key
db.version(11).stores({
    children: null,
    servants: null
});

// 📝 الإصدار 12: إعادة إنشاء الجداول بالـ Primary Key الجديد (نص)
db.version(12).stores({
    children: 'id, name, syncKey, phone, childPhone, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, last_reward_date, address, profilePic, isBrother, gotClothes, isDirty, updatedAt, isDeleted, massAttendance, preparation, serviceMeetingAttendance, visitationParticipation, lastConfessionDate, activityParticipation, medicalStatus',
    servants: 'id, name, syncKey, phone, role, assignedStages, gender, streak, last_liturgy, last_service, last_visited, last_birthday_gift, address, profilePic, isDirty, updatedAt, isDeleted, massAttendance, preparation, serviceMeetingAttendance, visitationParticipation, lastConfessionDate, activityParticipation, medicalStatus',
    attendance: '++id, date, childId, type, syncKey, status, isDirty, updatedAt, isDeleted',
    events: 'id, syncKey, date, createdBy, isDirty, updatedAt, isDeleted',
    grades: '++id, examId, examName, date, childId, grade, maxGrade, syncKey, isDirty, updatedAt, isDeleted',
    exams: '++id, firebaseId, syncKey, examName, maxGrade, date, isDirty, updatedAt, isDeleted'
});