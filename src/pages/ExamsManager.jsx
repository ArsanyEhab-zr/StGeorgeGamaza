import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Search, Award, ChevronRight, Trash2, Plus } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { useNavigate } from 'react-router-dom';
import { firestore } from '../db/firebase';
import { encryptData } from '../encryption';
import useAutoSync from '../hooks/useAutoSync';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

export default function ExamsManager() {
    const { triggerAutoSync } = useAutoSync();
    const navigate = useNavigate();
    const [examName, setExamName] = useState("");
    const [maxGrade, setMaxGrade] = useState(10);
    const [selectedExamId, setSelectedExamId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

    // 🌟 Offline-first: Fetch children from Dexie
    const children = useLiveQuery(() => {
        if (isMaster) {
            return db.children.filter(c => !c.isDeleted).toArray();
        }
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).filter(c => !c.isDeleted).toArray();
    }, [currentSyncKey, isMaster]);

    // 📝 Offline-first: Fetch exams from Dexie (not Firebase)
    const exams = useLiveQuery(() => {
        if (!currentSyncKey) return [];
        if (isMaster) {
            return db.exams.filter(e => !e.isDeleted).toArray();
        }
        return db.exams.where('syncKey').equals(currentSyncKey).filter(e => !e.isDeleted).toArray();
    }, [currentSyncKey, isMaster]);

    // Sort exams by date descending
    const sortedExams = useMemo(() => {
        if (!exams) return [];
        return [...exams].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [exams]);

    // 🌟 Derive selectedExam reactively from the ID
    const selectedExam = useMemo(() => {
        if (!selectedExamId || !exams) return null;
        return exams.find(e => e.id === selectedExamId || e.firebaseId === selectedExamId) || null;
    }, [selectedExamId, exams]);

    // 🎓 Offline-first: Fetch grades for the selected exam from Dexie
    const examGradesArray = useLiveQuery(() => {
        if (!selectedExam) return [];
        const examId = selectedExam.firebaseId || selectedExam.id?.toString();
        if (!examId) return [];
        return db.grades
            .where('examId').equals(examId)
            .filter(g => !g.isDeleted)
            .toArray();
    }, [selectedExam]);

    // Convert grades array to a map: { childId: grade }
    const examGrades = useMemo(() => {
        if (!examGradesArray) return {};
        const map = {};
        examGradesArray.forEach(g => {
            map[g.childId] = g.grade;
        });
        return map;
    }, [examGradesArray]);

    const filteredChildren = useMemo(() => {
        if (!children) return [];
        if (!searchQuery) return children;
        return children.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [children, searchQuery]);

    // 📝 Create exam — Dexie first, then background Firebase write (dual-write)
    const handleSaveExam = async (e) => {
        e.preventDefault();
        if (!examName.trim()) {
            alert("يرجى إدخال اسم الامتحان أولاً.");
            return;
        }
        try {
            const now = new Date().toISOString();
            const date = now.split('T')[0];
            
            // Generate a Firebase-style ID for consistency
            const firebaseId = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const examData = {
                firebaseId,
                examName: examName.trim(),
                maxGrade: parseInt(maxGrade, 10),
                date,
                syncKey: currentSyncKey,
                isDirty: true,
                updatedAt: now,
                isDeleted: false
            };

            // 1. Write to Dexie FIRST (source of truth)
            const localId = await db.exams.add(examData);

            // 2. Trigger auto-sync pipeline
            triggerAutoSync();

            // 3. Best-effort direct Firebase write (non-blocking)
            if (navigator.onLine) {
                const docRef = doc(firestore, 'Osras', currentSyncKey, 'exams', firebaseId);
                setDoc(docRef, {
                    id: firebaseId,
                    examName: examData.examName,
                    maxGrade: examData.maxGrade,
                    date,
                    syncKey: currentSyncKey,
                    updatedAt: now
                }).then(() => {
                    // Mark clean after successful Firebase write
                    db.exams.update(localId, { isDirty: false, updatedAt: new Date().toISOString() });
                }).catch(err => {
                    console.warn('📝 [ExamSync] Direct Firebase write failed, sync pipeline will retry:', err.message);
                });
            }

            // 4. Select the new exam immediately
            setSelectedExamId(localId);
            setExamName("");
            setMaxGrade(10);
        } catch (error) {
            console.error("Error creating exam:", error);
            alert("حدث خطأ أثناء حفظ الامتحان.");
        }
    };

    // 🗑️ Delete exam — Soft-delete in Dexie, then background Firebase delete
    const handleDeleteExam = async (exam) => {
        if (!confirm("هل أنت متأكد من حذف هذا الامتحان نهائياً؟")) return;
        try {
            const now = new Date().toISOString();

            // 1. Soft-delete in Dexie
            await db.exams.update(exam.id, { isDeleted: true, isDirty: true, updatedAt: now });

            // Also soft-delete all grades for this exam
            const examId = exam.firebaseId || exam.id.toString();
            await db.grades.where('examId').equals(examId).modify({ isDeleted: true, isDirty: true, updatedAt: now });

            // 2. Trigger sync
            triggerAutoSync();

            // 3. Best-effort Firebase delete (non-blocking)
            if (navigator.onLine && exam.firebaseId) {
                const examDocRef = doc(firestore, 'Osras', currentSyncKey, 'exams', exam.firebaseId);
                deleteDoc(examDocRef).catch(err => {
                    console.warn('📝 [ExamSync] Direct Firebase delete failed, sync pipeline will retry:', err.message);
                });
            }

            // Clear selection if this exam was selected
            if (selectedExamId === exam.id || selectedExamId === exam.firebaseId) {
                setSelectedExamId(null);
            }
        } catch (error) {
            console.error("Error deleting exam:", error);
            alert("حدث خطأ أثناء حذف الامتحان.");
        }
    };

    // 🎓 Save/update child grade — Dexie first, then background Firebase write (dual-write)
    const handleGradeChange = async (childId, value) => {
        if (!selectedExam) return;
        const numValue = parseInt(value, 10);
        let gradeVal = isNaN(numValue) ? "" : numValue;
        if (gradeVal !== "") {
            gradeVal = Math.min(Math.max(gradeVal, 0), selectedExam.maxGrade);
        }

        try {
            const now = new Date().toISOString();
            const examId = selectedExam.firebaseId || selectedExam.id?.toString();
            const childIdNum = parseInt(childId, 10);

            // Find existing grade for this child + exam combo
            const existing = await db.grades.where('examId').equals(examId).filter(g => g.childId === childIdNum).toArray();
            const match = existing[0];

            if (gradeVal === "") {
                // Clearing grade — soft-delete
                if (match) {
                    await db.grades.update(match.id, { isDeleted: true, isDirty: true, updatedAt: now });
                }
            } else {
                if (match) {
                    // Update existing grade
                    await db.grades.update(match.id, { grade: gradeVal, isDirty: true, updatedAt: now, isDeleted: false });
                } else {
                    // Insert new grade
                    await db.grades.add({
                        childId: childIdNum,
                        grade: gradeVal,
                        examId,
                        examName: selectedExam.examName,
                        maxGrade: selectedExam.maxGrade,
                        date: selectedExam.date,
                        syncKey: currentSyncKey,
                        isDirty: true,
                        updatedAt: now,
                        isDeleted: false
                    });
                }
            }

            // 2. Trigger auto-sync pipeline
            triggerAutoSync();

            // 3. Best-effort direct Firebase write (non-blocking)
            if (navigator.onLine && examId) {
                const gradeDocRef = doc(firestore, 'Osras', currentSyncKey, 'exams', examId, 'grades', childIdNum.toString());

                if (gradeVal === "") {
                    // Delete from Firebase
                    deleteDoc(gradeDocRef).catch(err => {
                        console.warn('🎓 [GradeSync] Direct Firebase delete failed:', err.message);
                    });
                } else {
                    // Write encrypted grade to Firebase
                    const gradeDataForCloud = {
                        childId: childIdNum,
                        grade: gradeVal,
                        examId,
                        examName: selectedExam.examName,
                        maxGrade: selectedExam.maxGrade,
                        date: selectedExam.date,
                        syncKey: currentSyncKey,
                        updatedAt: now
                    };
                    const encryptedPayload = encryptData(gradeDataForCloud);
                    setDoc(gradeDocRef, { payload: encryptedPayload }, { merge: true }).then(async () => {
                        // Mark the local record clean after successful Firebase write
                        const freshMatch = await db.grades.where('examId').equals(examId).filter(g => g.childId === childIdNum && !g.isDeleted).first();
                        if (freshMatch) {
                            await db.grades.update(freshMatch.id, { isDirty: false, updatedAt: new Date().toISOString() });
                        }
                    }).catch(err => {
                        console.warn('🎓 [GradeSync] Direct Firebase write failed, sync pipeline will retry:', err.message);
                    });
                }
            }
        } catch (error) {
            console.error("Error updating child grade:", error);
        }
    };

    const handleBack = () => {
        if (selectedExam) {
            setSelectedExamId(null);
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-32 font-sans" dir="rtl">
            <header className="bg-white/80 backdrop-blur-md p-4 shadow-sm mb-6 rounded-b-[2.5rem] sticky top-0 z-50">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button onClick={handleBack} aria-label="رجوع" className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                        <ChevronRight size={20} className="text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <Award className="text-amber-500" size={24} /> رصد الامتحانات
                        </h1>
                        <p className="text-xs font-bold text-slate-500">تقييم الأبطال في الحفظ والألحان</p>
                    </div>
                </div>
            </header>

            <main className="px-4 max-w-4xl mx-auto space-y-6">
                {!selectedExam ? (
                    <div className="space-y-6">
                        {/* Exam Creation Form */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-4">
                            <h2 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                                <Plus className="text-amber-500" size={18} /> إضافة امتحان جديد
                            </h2>
                            <form onSubmit={handleSaveExam} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 mb-2">اسم الامتحان أو التقييم *</label>
                                    <input 
                                        type="text" 
                                        value={examName}
                                        onChange={(e) => setExamName(e.target.value)}
                                        placeholder="مثال: تسميع إبؤرو، امتحان نص السنة..."
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 mb-2">الدرجة النهائية *</label>
                                    <input 
                                        type="number" 
                                        value={maxGrade}
                                        onChange={(e) => setMaxGrade(parseInt(e.target.value, 10))}
                                        min="1"
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all"
                                        required
                                    />
                                </div>
                                <button 
                                    type="submit"
                                    className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-amber-500/30 hover:bg-amber-600 active:scale-95 transition-all flex justify-center items-center gap-2"
                                >
                                    حفظ الامتحان والبدء في الرصد
                                </button>
                            </form>
                        </div>

                        {/* List of Created Exams */}
                        <div className="space-y-3">
                            <h2 className="text-sm font-black text-slate-800 px-1">الامتحانات المسجلة</h2>
                            {sortedExams.length > 0 ? (
                                sortedExams.map((exam) => (
                                    <div key={exam.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm hover:border-amber-200 transition-all">
                                        <button 
                                            onClick={() => setSelectedExamId(exam.id)}
                                            className="flex-1 text-right focus:outline-none"
                                        >
                                            <h3 className="font-black text-slate-800 text-sm">{exam.examName}</h3>
                                            <p className="text-xs font-bold text-slate-400 mt-1">الدرجة النهائية: {exam.maxGrade} | تاريخ الرصد: {exam.date}</p>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteExam(exam)}
                                            className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 transition-colors shrink-0"
                                            title="حذف الامتحان"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400 font-bold bg-white rounded-[2rem] border border-slate-200">
                                    لا يوجد امتحانات مسجلة حالياً.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // Child Grading View
                    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex justify-between items-center shadow-sm">
                            <div>
                                <h2 className="font-black text-amber-900">{selectedExam.examName}</h2>
                                <p className="text-xs font-bold text-amber-700 mt-1">الدرجة من {selectedExam.maxGrade}</p>
                            </div>
                            <button 
                                onClick={() => setSelectedExamId(null)} 
                                className="bg-white text-amber-600 px-4 py-2 rounded-xl text-xs font-black shadow-sm hover:bg-amber-100 transition-colors"
                            >
                                تغيير الامتحان
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="ابحث عن بطل..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pr-12 pl-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
                            />
                        </div>

                        <div className="space-y-3">
                            {filteredChildren.map(child => (
                                <div key={child.id} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between shadow-sm">
                                    <span className="font-black text-slate-800 text-sm truncate">{child.name}</span>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            min="0"
                                            max={selectedExam.maxGrade}
                                            value={examGrades[child.id] !== undefined ? examGrades[child.id] : ""}
                                            onChange={(e) => handleGradeChange(child.id, e.target.value)}
                                            placeholder="الدرجة"
                                            className="w-20 text-center p-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-indigo-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <span className="text-xs font-bold text-slate-400">/ {selectedExam.maxGrade}</span>
                                    </div>
                                </div>
                            ))}
                            {filteredChildren.length === 0 && (
                                <div className="text-center py-8 text-slate-400 font-bold bg-white rounded-3xl border border-slate-100">
                                    لا يوجد أبطال مطابقين للبحث.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
            <BottomNav />
        </div>
    );
}
