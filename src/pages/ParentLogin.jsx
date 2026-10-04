import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { ShieldAlert, Key, Phone, User, LogIn, Loader2 } from 'lucide-react';
import { firestore } from '../db/firebase';
import { collection, getDocs, collectionGroup } from 'firebase/firestore';
import { decryptData } from '../encryption';

export default function ParentLogin() {
    const navigate = useNavigate();
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        // Fetch classes from local settings or Firestore
        const fetchClasses = async () => {
            let loadedClasses = [];
            
            // Try local first
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    if (parsed.services) {
                        parsed.services.forEach(srv => {
                            if (srv.osras) {
                                srv.osras.forEach(osra => {
                                    loadedClasses.push({ name: osra.name, syncKey: osra.syncKey });
                                });
                            }
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            // Fallback to Firestore if empty and online
            if (loadedClasses.length === 0 && navigator.onLine) {
                try {
                    const querySnapshot = await getDocs(collection(firestore, "System"));
                    querySnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.services) {
                            data.services.forEach(srv => {
                                if (srv.osras) {
                                    srv.osras.forEach(osra => {
                                        loadedClasses.push({ name: osra.name, syncKey: osra.syncKey });
                                    });
                                }
                            });
                        }
                    });
                } catch (e) {
                    console.error("Error fetching classes from Firestore:", e);
                }
            }
            
            // Remove duplicates
            const uniqueClasses = Array.from(new Set(loadedClasses.map(c => c.name)))
                .map(name => loadedClasses.find(c => c.name === name));
            
            setClasses(uniqueClasses);
        };
        fetchClasses();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setIsLoading(true);

        const cleanPhone = phoneNumber.trim().replace(/\D/g, '');

        try {
            if (!navigator.onLine) {
                setErrorMsg('لا يوجد اتصال بالإنترنت. يرجى الاتصال بالشبكة للمحاولة.');
                setIsLoading(false);
                return;
            }

            const targetClass = classes.find(c => c.name === selectedClass);
            if (!targetClass) {
                setErrorMsg('الفصل المختار غير صالح.');
                setIsLoading(false);
                return;
            }

            // 1. Query Firestore children collection group directly
            const querySnapshot = await getDocs(collectionGroup(firestore, 'children'));
            
            let match = null;

            // 2. Loop and decrypt each child document to search for a match
            for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data();
                if (data) {
                    const decrypted = data.payload ? decryptData(data.payload) : data;
                    if (decrypted) {
                        const docSyncKey = docSnap.ref.parent.parent.id;
                        const childSyncKey = decrypted.syncKey || docSyncKey;

                        // Check if syncKey matches targetClass.syncKey or className matches
                        const matchesClass = childSyncKey === targetClass.syncKey || 
                                             decrypted.className === selectedClass || 
                                             decrypted.osraName === selectedClass;

                        if (matchesClass) {
                            const legacyPhone = decrypted.phone ? String(decrypted.phone).trim().replace(/\D/g, '') : '';
                            const motherPhone = decrypted.motherPhone ? String(decrypted.motherPhone).trim().replace(/\D/g, '') : '';
                            const fatherPhone = decrypted.fatherPhone ? String(decrypted.fatherPhone).trim().replace(/\D/g, '') : '';
                            const personalPhone = decrypted.childPhone ? String(decrypted.childPhone).trim().replace(/\D/g, '') : '';

                            const matchesPhone = cleanPhone &&
                                ((legacyPhone && legacyPhone.includes(cleanPhone)) ||
                                (motherPhone && motherPhone.includes(cleanPhone)) ||
                                (fatherPhone && fatherPhone.includes(cleanPhone)) ||
                                (personalPhone && personalPhone.includes(cleanPhone)));

                            if (matchesPhone) {
                                match = {
                                    id: decrypted.id || docSnap.id,
                                    name: decrypted.name,
                                    syncKey: childSyncKey,
                                    ...decrypted
                                };
                                break;
                            }
                        }
                    }
                }
            }

            if (match) {
                // 3. Save matching details to localStorage
                localStorage.setItem('parentChildId', match.id);
                localStorage.setItem('parentChildName', match.name);
                localStorage.setItem('parentSyncKey', match.syncKey);
                localStorage.setItem('parentClassName', selectedClass);

                // 4. Save matching details and attendance locally to Dexie for offline dashboards
                await db.children.put({
                    id: parseInt(match.id, 10) || match.id,
                    name: match.name,
                    phone: match.phone || '',
                    motherPhone: match.motherPhone || '',
                    fatherPhone: match.fatherPhone || '',
                    childPhone: match.childPhone || '',
                    syncKey: match.syncKey,
                    className: selectedClass
                });

                // Fetch child's attendance from Firestore and save locally
                try {
                    const attendanceSnapshot = await getDocs(collection(firestore, 'Osras', match.syncKey, 'attendance'));
                    const localAttendanceRecords = [];
                    attendanceSnapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data && data.payload) {
                            const record = decryptData(data.payload);
                            if (record && parseInt(record.childId, 10) === parseInt(match.id, 10)) {
                                localAttendanceRecords.push(record);
                            }
                        } else if (data) {
                            if (data.childId === parseInt(match.id, 10)) {
                                localAttendanceRecords.push(data);
                            }
                        }
                    });
                    if (localAttendanceRecords.length > 0) {
                        await db.attendance.bulkPut(localAttendanceRecords);
                    }
                } catch (attErr) {
                    console.error("Error fetching child attendance:", attErr);
                }

                // Redirect to parent dashboard
                navigate('/parent-dashboard');
            } else {
                setErrorMsg('لم يتم العثور على مخدوم مسجل بهذا الرقم في هذا الفصل.');
            }
        } catch (error) {
            console.error(error);
            setErrorMsg('حدث خطأ أثناء الاتصال بالسيرفر. حاول مرة أخرى.');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans" dir="rtl">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-sm w-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
                
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
                        <User size={36} strokeWidth={1.5} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800">دخول أولياء الأمور</h2>
                    <p className="text-sm font-bold text-slate-500 mt-2">تابع حضور وتقييمات مخدومك بسهولة</p>
                </div>

                {errorMsg && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-4 flex items-center gap-2 border border-red-100">
                        <ShieldAlert size={16} /> {errorMsg}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 ml-1">اختر الفصل *</label>
                        <select 
                            value={selectedClass} 
                            onChange={(e) => setSelectedClass(e.target.value)}
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="" disabled>-- اختر الفصل --</option>
                            {classes.map((c, i) => (
                                <option key={i} value={c.name || ''}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-600 ml-1">رقم التليفون (المسجل) *</label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="tel" 
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="01xxxxxxxxx"
                                className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={24} /> : <><LogIn size={20} /> دخول للوحة المتابعة</>}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => navigate('/login')} className="text-xs font-bold text-slate-400 hover:text-slate-600 underline">
                        هل أنت خادم؟ الدخول من هنا
                    </button>
                </div>
            </div>
        </div>
    );
}
