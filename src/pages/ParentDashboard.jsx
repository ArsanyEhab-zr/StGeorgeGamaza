import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { LogOut, Award, CheckCheck, Music, Play, Pause, UserCircle } from 'lucide-react';
import { firestore } from '../db/firebase';
import { doc, collection, collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { decryptData } from '../encryption';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function ParentDashboard() {
    const navigate = useNavigate();
    const childId = localStorage.getItem('parentChildId');
    const childName = localStorage.getItem('parentChildName');
    const syncKey = localStorage.getItem('parentSyncKey');
    const className = localStorage.getItem('parentClassName');

    const [childInfo, setChildInfo] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [grades, setGrades] = useState([]);

    useEffect(() => {
        if (!childId) {
            navigate('/parent-login');
        }
    }, [childId, navigate]);

    useEffect(() => {
        if (!childId || !syncKey) return;

        // 1. Real-time listener for child's core document info
        const childRef = doc(firestore, 'Osras', syncKey, 'children', childId.toString());
        const unsubscribeChild = onSnapshot(childRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const decrypted = data.payload ? decryptData(data.payload) : data;
                setChildInfo(decrypted);
            }
        }, (err) => {
            console.error("Error listening to child info:", err);
        });

        // 2. Real-time listener for attendance sub-collection
        const attendanceRef = collection(firestore, 'Osras', syncKey, 'attendance');
        const unsubscribeAttendance = onSnapshot(attendanceRef, (querySnapshot) => {
            const list = [];
            const targetIdStr = String(childId).trim();

            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data) {
                    const decrypted = data.payload ? decryptData(data.payload) : data;
                    if (decrypted) {
                        const recordChildIdStr = decrypted.childId ? String(decrypted.childId).trim() : '';
                        if (recordChildIdStr === targetIdStr || (parseInt(recordChildIdStr, 10) === parseInt(targetIdStr, 10) && !isNaN(parseInt(targetIdStr, 10)))) {
                            list.push({ id: docSnap.id, ...decrypted });
                        }
                    }
                }
            });
            setAttendance(list);
        }, (err) => {
            console.error("Error listening to attendance:", err);
        });

        return () => {
            unsubscribeChild();
            unsubscribeAttendance();
        };
    }, [childId, syncKey, className]);

    // 4. Real-time listener for exams list and matching child grades
    useEffect(() => {
        if (!childId || !syncKey) return;

        const examsRef = collection(firestore, 'Osras', syncKey, 'exams');
        let activeGradeUnsubscribes = {};
        const gradesMap = {};

        const unsubscribeExams = onSnapshot(examsRef, (examsSnapshot) => {
            const examsList = [];
            const newGradeUnsubscribes = {};

            const updateGradesState = () => {
                const combinedGrades = examsList.map(exam => {
                    const gradeObj = gradesMap[exam.id];
                    return {
                        examName: exam.examName,
                        date: exam.date,
                        grade: gradeObj ? gradeObj.grade : null,
                        maxGrade: exam.maxGrade
                    };
                }).filter(g => g.grade !== null);
                setGrades(combinedGrades);
            };

            examsSnapshot.forEach((examDoc) => {
                const examData = examDoc.data();
                const examId = examDoc.id;
                examsList.push({ id: examId, ...examData });

                // Check if we already have an active listener for this examId
                if (activeGradeUnsubscribes[examId]) {
                    newGradeUnsubscribes[examId] = activeGradeUnsubscribes[examId];
                    delete activeGradeUnsubscribes[examId]; // keep it alive
                } else {
                    // Create a new listener
                    const gradeDocRef = doc(firestore, 'Osras', syncKey, 'exams', examId, 'grades', childId.toString());
                    const unsubGrade = onSnapshot(gradeDocRef, (gradeDocSnap) => {
                        if (gradeDocSnap.exists()) {
                            const gradeData = gradeDocSnap.data();
                            const decrypted = gradeData.payload ? decryptData(gradeData.payload) : gradeData;
                            if (decrypted) {
                                gradesMap[examId] = decrypted;
                            }
                        } else {
                            delete gradesMap[examId];
                        }
                        updateGradesState();
                    }, (err) => {
                        console.error("Error listening to grade:", err);
                    });
                    newGradeUnsubscribes[examId] = unsubGrade;
                }
            });

            // Any listener left in activeGradeUnsubscribes is no longer needed (the exam was deleted)
            Object.values(activeGradeUnsubscribes).forEach(unsub => unsub());

            // Save the new active listeners
            activeGradeUnsubscribes = newGradeUnsubscribes;

            if (examsSnapshot.empty) {
                setGrades([]);
            } else {
                updateGradesState();
            }
        }, (err) => {
            console.error("Error listening to exams:", err);
        });

        return () => {
            unsubscribeExams();
            Object.values(activeGradeUnsubscribes).forEach(unsub => unsub());
        };
    }, [childId, syncKey]);

    const handleLogout = () => {
        localStorage.removeItem('parentChildId');
        localStorage.removeItem('parentChildName');
        localStorage.removeItem('parentSyncKey');
        localStorage.removeItem('parentClassName');
        navigate('/parent-login');
    };

    // Calculations
    const totalServices = attendance ? attendance.filter(a => a.type === 'service').length : 0;
    const totalLiturgies = attendance ? attendance.filter(a => a.type === 'liturgy').length : 0;

    const displayName = childInfo?.name || childName || 'المخدوم';
    const displayClass = childInfo?.className || childInfo?.osraName || className || TENANT_CONFIG.APP_NAME;
    const childImg = childInfo?.profilePic || childInfo?.image || childInfo?.photo;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans" dir="rtl">
            <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-b-[2.5rem] shadow-lg sticky top-0 z-50">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-black mb-1">أهلاً بك يا مخدوم</h1>
                        <p className="text-sm font-bold text-blue-100">{displayName} - {displayClass}</p>
                    </div>
                    <button onClick={handleLogout} className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors">
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <main className="p-4 max-w-4xl mx-auto mt-6 space-y-6">
                {/* Hero Profile Card */}
                <div className="bg-indigo-900 rounded-[2rem] p-6 sm:p-8 shadow-xl relative overflow-hidden flex flex-col sm:flex-row items-center gap-6 text-center sm:text-right border border-amber-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                    {/* Decorative background elements */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -ml-16 -mb-16 pointer-events-none" />
                    
                    {/* Avatar / Photo */}
                    <div className="relative shrink-0">
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-amber-500 shadow-lg shadow-amber-500/20 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-amber-900/30">
                            {childImg ? (
                                <img 
                                    src={childImg} 
                                    alt={displayName} 
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/40 to-amber-500/20">
                                    <UserCircle className="w-16 h-16 text-amber-400 stroke-[1.5]" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Deacon Info Details */}
                    <div className="flex-1 space-y-2">
                        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
                            {displayName}
                        </h2>
                        <p className="text-sm sm:text-base font-bold text-amber-500">
                            {displayClass}
                        </p>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                            {childInfo?.gender !== 'بنت' && childInfo?.isOrdained && (
                                <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    👑 {childInfo.ordinationRank || 'شماس'}
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/10">
                                ☦️ {TENANT_CONFIG.APP_NAME}
                            </span>
                            {childInfo?.fatherConfessor && (
                                <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    أب الاعتراف: {childInfo.fatherConfessor}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* QR Code Section */}
                <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center animate-in slide-in-from-bottom-2">
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 shadow-inner mb-3 inline-block">
                        <QRCodeCanvas value={`KHD:${childId}`} size={160} level="M" includeMargin={false} />
                    </div>
                    <p className="font-bold text-slate-500 font-mono text-sm tracking-wide" dir="ltr">
                        كود المخدوم: {childId}
                    </p>
                    <p className="text-xs font-bold text-slate-400 mt-2">يمكن استخدام هذا الكود لتسجيل الحضور بسرعة</p>
                </section>

                {/* Attendance Summary */}
                <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-4">
                    <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                        <CheckCheck className="text-emerald-500" /> ملخص الحضور
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center">
                            <span className="text-xs font-bold text-emerald-600 mb-1">الخدمة</span>
                            <span className="text-3xl font-black text-emerald-700">{totalServices}</span>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col items-center">
                            <span className="text-xs font-bold text-blue-600 mb-1">القداس</span>
                            <span className="text-3xl font-black text-blue-700">{totalLiturgies}</span>
                        </div>
                    </div>
                </section>

                {/* Exams and Grades */}
                <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6">
                    <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                        <Award className="text-amber-500" /> درجات التقييمات
                    </h2>
                    <div className="space-y-3">
                        {grades && grades.length > 0 ? grades.map((g, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div>
                                    <h3 className="font-black text-slate-700 text-sm">{g.examName}</h3>
                                    <p className="text-xs font-bold text-slate-400 mt-1">{g.date}</p>
                                </div>
                                <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl font-black text-sm">
                                    {g.grade} / {g.maxGrade}
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-6 text-slate-400 font-bold text-sm">
                                لا يوجد درجات مسجلة حالياً.
                            </div>
                        )}
                    </div>
                </section>


            </main>
        </div>
    );
}
