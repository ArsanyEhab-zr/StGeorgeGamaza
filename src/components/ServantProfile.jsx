import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Camera, 
    Loader2, 
    User, 
    Crown, 
    ShieldCheck, 
    Star, 
    Users, 
    MapPin, 
    Phone, 
    MessageCircle, 
    Calendar, 
    CheckCircle2, 
    X, 
    ArrowRight, 
    Edit3, 
    Save, 
    AlertCircle, 
    Sparkles, 
    BookOpen, 
    Church, 
    Heart, 
    Award,
    Check,
    TrendingUp
} from 'lucide-react';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, query, where, addDoc } from 'firebase/firestore';
import { getAuth, updateProfile } from 'firebase/auth';
import { firestore } from '../db/firebase';
import { db } from '../db/database';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import { logActivity } from '../utils/activityLogger';

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const cleanName = (n) => String(n || '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

// Helper to determine role badge visual style and label
const getRoleBadgeConfig = (role) => {
    const r = String(role || '').trim();
    if (r === 'كاهن' || r === 'الاب الكاهن' || r === 'راعي الخدمة') {
        return {
            label: r,
            bg: 'bg-purple-100 text-purple-700 border-purple-200',
            glow: 'shadow-purple-500/20',
            dot: 'bg-purple-500',
            icon: Crown
        };
    }
    if (r === 'Super Admin' || r === 'أدمن مساعد' || r === 'المسئول العام' || r === 'سوبر أدمن' || r === 'أدمن') {
        return {
            label: r,
            bg: 'bg-amber-100 text-amber-700 border-amber-300',
            glow: 'shadow-amber-500/20',
            dot: 'bg-amber-500',
            icon: ShieldCheck
        };
    }
    if (r.includes('أمين') || r.includes('مسؤول') || r === 'أمين خدمة' || r === 'أمين أسرة' || r === 'أمين مرحلة') {
        return {
            label: r,
            bg: 'bg-blue-100 text-blue-700 border-blue-200',
            glow: 'shadow-blue-500/20',
            dot: 'bg-blue-500',
            icon: Star
        };
    }
    return {
        label: r || 'خادم',
        bg: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        glow: 'shadow-emerald-500/20',
        dot: 'bg-emerald-500',
        icon: Award
    };
};

export default function ServantProfile({ servantData = null, servant = null, isOpen = true, onClose = null, isModal = false }) {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // 1. Identify logged-in servant vs target servant
    const loggedInServant = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('currentServant') || '{}');
        } catch (e) {
            return {};
        }
    }, []);

    // 🌟 Strictly prioritize incoming servant prop (servantData or servant)
    const incomingServant = servantData || servant;
    
    // Only fallback to logged-in user if no specific servant was provided (self-view)
    const targetServant = useMemo(() => {
        if (incomingServant && Object.keys(incomingServant).length > 0) {
            return incomingServant;
        }
        return loggedInServant;
    }, [incomingServant, loggedInServant]);

    // Check if current logged-in user is viewing their OWN profile
    const isSelf = useMemo(() => {
        // If no servant prop was passed at all, this is a self-view
        if (!incomingServant) return true;
        if (!loggedInServant || Object.keys(loggedInServant).length === 0) return false;

        const sId = String(incomingServant.id || incomingServant.uid || '');
        const lId = String(loggedInServant.id || loggedInServant.uid || '');
        if (sId && lId && sId === lId) return true;

        const sPhone = cleanPhone(incomingServant.phone);
        const lPhone = cleanPhone(loggedInServant.phone);
        if (sPhone && lPhone && sPhone === lPhone) return true;

        const sName = cleanName(incomingServant.name);
        const lName = cleanName(loggedInServant.name);
        if (sName && lName && sName === lName) return true;

        return false;
    }, [incomingServant, loggedInServant]);

    // Check if leadership / master / priest
    const isLeadership = useMemo(() => {
        const role = loggedInServant?.role || '';
        const currentSyncKey = localStorage.getItem('currentSyncKey');
        return currentSyncKey === 'MASTER_ACCESS' || 
               currentSyncKey === 'ADMIN_MODE' || 
               role === 'Super Admin' || 
               role === 'كاهن' || 
               role === 'أدمن مساعد' || 
               role === 'المسئول العام' ||
               role === 'أدمن' ||
               role === 'سوبر أدمن';
    }, [loggedInServant]);

    // Can edit: Servant can edit their own profile, leadership can also edit
    const canEdit = isSelf || isLeadership;

    // Profile state initialized strictly from targetServant
    const [profile, setProfile] = useState(() => ({
        id: targetServant?.id || targetServant?.uid || '',
        name: targetServant?.name || '',
        phone: targetServant?.phone || '',
        role: targetServant?.role || 'خادم',
        assignedOsra: targetServant?.assignedOsra || targetServant?.osraName || 'الخدمة العامة',
        syncKey: targetServant?.syncKey || '',
        address: targetServant?.address || '',
        photoURL: targetServant?.photoURL || targetServant?.profileImage || targetServant?.profilePic || '',
        docId: targetServant?.docId || '',
        fatherConfessor: targetServant?.fatherConfessor || '',
        birthDate: targetServant?.birthDate || '',
        notes: targetServant?.notes || ''
    }));

    // Personal & Spiritual data edit state
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [editForm, setEditForm] = useState({
        fatherConfessor: targetServant?.fatherConfessor || '',
        birthDate: targetServant?.birthDate || '',
        address: targetServant?.address || '',
        notes: targetServant?.notes || ''
    });

    // Re-sync profile whenever targetServant changes
    useEffect(() => {
        if (!targetServant || Object.keys(targetServant).length === 0) return;

        setProfile({
            id: targetServant.id || targetServant.uid || '',
            name: targetServant.name || '',
            phone: targetServant.phone || '',
            role: targetServant.role || 'خادم',
            assignedOsra: targetServant.assignedOsra || targetServant.osraName || 'الخدمة العامة',
            syncKey: targetServant.syncKey || '',
            address: targetServant.address || '',
            photoURL: targetServant.photoURL || targetServant.profileImage || targetServant.profilePic || '',
            docId: targetServant.docId || '',
            fatherConfessor: targetServant.fatherConfessor || '',
            birthDate: targetServant.birthDate || '',
            notes: targetServant.notes || ''
        });
        setEditForm({
            fatherConfessor: targetServant.fatherConfessor || '',
            birthDate: targetServant.birthDate || '',
            address: targetServant.address || '',
            notes: targetServant.notes || ''
        });
        setIsEditingProfile(false);
    }, [targetServant]);

    // Photo upload state
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    // Feedback notifications
    const [notification, setNotification] = useState({ type: '', message: '' });

    // Open-ended attendance calculation stats
    const [attendanceStats, setAttendanceStats] = useState({
        totalAttendance: 0,
        totalWeeks: 0,
        liturgies: 0,
        meetings: 0,
        visitations: 0,
        preparations: 0,
        excuses: 0,
        absences: 0,
        lastConfessionDate: '',
        isLoadingStats: true
    });

    // 2. Fetch fresh servant data & attendance from Firestore on targetServant change
    useEffect(() => {
        let isMounted = true;
        if (!targetServant || Object.keys(targetServant).length === 0) return;

        const loadFreshDataAndAttendance = async () => {
            try {
                setAttendanceStats(prev => ({ ...prev, isLoadingStats: true }));

                // A. Fresh Servant profile from Firestore
                let freshAddress = targetServant.address || '';
                let freshPhoto = targetServant.photoURL || targetServant.profileImage || targetServant.profilePic || '';
                let freshFatherConfessor = targetServant.fatherConfessor || '';
                let freshBirthDate = targetServant.birthDate || '';
                let freshNotes = targetServant.notes || '';
                let foundDocId = targetServant.docId || '';

                // Try querying servants collection
                const servantsCol = collection(firestore, 'servants');
                const targetPhone = cleanPhone(targetServant.phone);
                const targetName = cleanName(targetServant.name);
                const tId = String(targetServant.id || targetServant.uid || '');

                const snap = await getDocs(servantsCol);
                snap.forEach(d => {
                    const data = d.data();
                    const dPhone = cleanPhone(data.phone);
                    const dName = cleanName(data.name);
                    const dId = String(data.id || '');

                    if ((tId && dId === tId) || (targetPhone && dPhone && (dPhone === targetPhone || dPhone.endsWith(targetPhone))) || (targetName && dName && dName === targetName)) {
                        foundDocId = d.id;
                        if (data.address) freshAddress = data.address;
                        if (data.fatherConfessor) freshFatherConfessor = data.fatherConfessor;
                        if (data.birthDate) freshBirthDate = data.birthDate;
                        if (data.notes) freshNotes = data.notes;
                        if (data.photoURL || data.profileImage || data.profilePic) {
                            freshPhoto = data.photoURL || data.profileImage || data.profilePic;
                        }
                    }
                });

                // Also check System/mainConfig as supplement/fallback
                try {
                    const configSnap = await getDoc(doc(firestore, 'System', 'mainConfig'));
                    if (configSnap.exists()) {
                        const cfgData = configSnap.data();
                        if (Array.isArray(cfgData.servants)) {
                            const cs = cfgData.servants.find(s => {
                                const sId = String(s.id || s.uid || '');
                                const sPhone = cleanPhone(s.phone);
                                const sName = cleanName(s.name);
                                return (tId && sId === tId) || (targetPhone && sPhone && (sPhone === targetPhone || sPhone.endsWith(targetPhone))) || (targetName && sName && sName === targetName);
                            });
                            if (cs) {
                                if (!freshAddress && cs.address) freshAddress = cs.address;
                                if (!freshFatherConfessor && cs.fatherConfessor) freshFatherConfessor = cs.fatherConfessor;
                                if (!freshBirthDate && cs.birthDate) freshBirthDate = cs.birthDate;
                                if (!freshNotes && cs.notes) freshNotes = cs.notes;
                                if (!freshPhoto && (cs.photoURL || cs.profileImage || cs.profilePic)) {
                                    freshPhoto = cs.photoURL || cs.profileImage || cs.profilePic;
                                }
                            }
                        }
                    }
                } catch (cfgErr) {
                    console.warn("Could not read mainConfig for servant profile:", cfgErr);
                }

                if (isMounted) {
                    const updatedData = {
                        id: targetServant.id || targetServant.uid || '',
                        name: targetServant.name || '',
                        phone: targetServant.phone || '',
                        role: targetServant.role || 'خادم',
                        assignedOsra: targetServant.assignedOsra || targetServant.osraName || 'الخدمة العامة',
                        syncKey: targetServant.syncKey || '',
                        address: freshAddress || targetServant.address || '',
                        fatherConfessor: freshFatherConfessor || targetServant.fatherConfessor || '',
                        birthDate: freshBirthDate || targetServant.birthDate || '',
                        notes: freshNotes || targetServant.notes || '',
                        photoURL: freshPhoto || targetServant.photoURL || targetServant.profileImage || targetServant.profilePic || '',
                        docId: foundDocId || targetServant.docId || ''
                    };

                    setProfile(updatedData);
                    setEditForm({
                        fatherConfessor: updatedData.fatherConfessor,
                        birthDate: updatedData.birthDate,
                        address: updatedData.address,
                        notes: updatedData.notes
                    });
                }

                // B. Dynamic Open-Ended Attendance Calculation from historical records
                const attSnap = await getDocs(collection(firestore, 'ServantAttendance'));
                let totalPresent = 0;
                let totalLiturgies = 0;
                let totalMeetings = 0;
                let totalVisitations = 0;
                let totalPreparations = 0;
                let totalExcuses = 0;
                let totalAbsences = 0;
                let matchedRecordsCount = 0;
                let confessionDates = [];

                attSnap.forEach(d => {
                    const data = d.data();
                    const rUid = String(data.uid || data.id || '').trim();
                    const sId = String(targetServant.id || targetServant.uid || '').trim();
                    const rPhone = cleanPhone(data.phone || data.uid);
                    const rName = cleanName(data.name);

                    const isMatch = (sId && rUid === sId) ||
                        (foundDocId && rUid === foundDocId) ||
                        (targetPhone && rPhone && (rPhone === targetPhone || rPhone.endsWith(targetPhone) || targetPhone.endsWith(rPhone))) ||
                        (targetName && rName && (targetName === rName || (targetName.split(' ')[0] === rName.split(' ')[0] && targetName.split(' ')[1] === rName.split(' ')[1])));

                    if (isMatch) {
                        matchedRecordsCount++;
                        if (data.attendance === 'حضور' || data.attendance === 'حاضر') {
                            totalPresent++;
                        } else if (data.attendance === 'اعتذار') {
                            totalExcuses++;
                        } else if (data.attendance === 'غياب') {
                            totalAbsences++;
                        }

                        if (data.liturgy === true) totalLiturgies++;
                        if (data.meeting === true) totalMeetings++;
                        if (data.visitation === true) totalVisitations++;
                        if (data.preparation === true) totalPreparations++;
                        if (data.confessionDate) confessionDates.push(data.confessionDate);
                    }
                });

                confessionDates.sort().reverse();
                const latestConfession = confessionDates[0] || targetServant.lastConfessionDate || '';

                if (isMounted) {
                    setAttendanceStats({
                        totalAttendance: totalPresent,
                        totalWeeks: matchedRecordsCount,
                        liturgies: totalLiturgies,
                        meetings: totalMeetings,
                        visitations: totalVisitations,
                        preparations: totalPreparations,
                        excuses: totalExcuses,
                        absences: totalAbsences,
                        lastConfessionDate: latestConfession,
                        isLoadingStats: false
                    });
                }
            } catch (err) {
                console.error("Error loading servant profile & stats:", err);
                if (isMounted) {
                    setAttendanceStats(prev => ({ ...prev, isLoadingStats: false }));
                }
            }
        };

        loadFreshDataAndAttendance();

        return () => {
            isMounted = false;
        };
    }, [targetServant]);

    // Clear notification after 4 seconds
    useEffect(() => {
        if (notification.message) {
            const timer = setTimeout(() => setNotification({ type: '', message: '' }), 4000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // 3. Multi-Store Persistent Update Function
    const persistUpdates = async (updatedFields) => {
        const targetId = profile.id;
        const targetPhone = cleanPhone(profile.phone);
        const targetName = cleanName(profile.name);

        // A. LocalStorage: currentServant (if self)
        if (isSelf) {
            try {
                const current = JSON.parse(localStorage.getItem('currentServant') || '{}');
                const merged = { ...current, ...updatedFields };
                localStorage.setItem('currentServant', JSON.stringify(merged));
            } catch (e) {
                console.warn("Failed to update localStorage currentServant:", e);
            }
        }

        // B. LocalStorage: appSettings.servants
        try {
            const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            if (Array.isArray(settings.servants)) {
                let updated = false;
                settings.servants = settings.servants.map(s => {
                    const sId = String(s.id || '');
                    const sPhone = cleanPhone(s.phone);
                    const sName = cleanName(s.name);

                    if ((targetId && sId === String(targetId)) || (targetPhone && sPhone === targetPhone) || (targetName && sName === targetName)) {
                        updated = true;
                        return { ...s, ...updatedFields };
                    }
                    return s;
                });
                if (updated) {
                    localStorage.setItem('appSettings', JSON.stringify(settings));
                }
            }
        } catch (e) {
            console.warn("Failed to update localStorage appSettings:", e);
        }

        // C. Local Dexie: db.servants
        try {
            await db.servants.put({
                id: profile.id || Date.now(),
                name: profile.name,
                syncKey: profile.syncKey,
                phone: profile.phone,
                role: profile.role,
                assignedOsra: profile.assignedOsra,
                address: updatedFields.address !== undefined ? updatedFields.address : profile.address,
                fatherConfessor: updatedFields.fatherConfessor !== undefined ? updatedFields.fatherConfessor : profile.fatherConfessor,
                birthDate: updatedFields.birthDate !== undefined ? updatedFields.birthDate : profile.birthDate,
                notes: updatedFields.notes !== undefined ? updatedFields.notes : profile.notes,
                profilePic: updatedFields.photoURL || updatedFields.profileImage || profile.photoURL,
                photoURL: updatedFields.photoURL || profile.photoURL,
                profileImage: updatedFields.photoURL || profile.photoURL,
                updatedAt: new Date().toISOString()
            });
        } catch (dexieErr) {
            console.warn("Dexie db.servants put error:", dexieErr);
        }

        // D. Firestore: System/mainConfig
        try {
            const configRef = doc(firestore, 'System', 'mainConfig');
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const configData = configSnap.data();
                if (Array.isArray(configData.servants)) {
                    let matched = false;
                    const updatedServants = configData.servants.map(s => {
                        const sId = String(s.id || '');
                        const sPhone = cleanPhone(s.phone);
                        const sName = cleanName(s.name);

                        if ((targetId && sId === String(targetId)) || (targetPhone && sPhone === targetPhone) || (targetName && sName === targetName)) {
                            matched = true;
                            return { ...s, ...updatedFields };
                        }
                        return s;
                    });

                    if (matched) {
                        await setDoc(configRef, { servants: updatedServants }, { merge: true });
                    }
                }
            }
        } catch (configErr) {
            console.warn("Firestore mainConfig update error:", configErr);
        }

        // E. Firestore: servants collection document
        try {
            if (profile.docId) {
                await updateDoc(doc(firestore, 'servants', profile.docId), {
                    ...updatedFields,
                    updatedAt: new Date().toISOString()
                });
            } else {
                // Search for matching doc
                const q = query(collection(firestore, 'servants'), where('phone', '==', profile.phone));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    for (const d of snap.docs) {
                        await updateDoc(doc(firestore, 'servants', d.id), {
                            ...updatedFields,
                            updatedAt: new Date().toISOString()
                        });
                        setProfile(prev => ({ ...prev, docId: d.id }));
                    }
                } else if (profile.id) {
                    const qId = query(collection(firestore, 'servants'), where('id', '==', profile.id));
                    const snapId = await getDocs(qId);
                    if (!snapId.empty) {
                        for (const d of snapId.docs) {
                            await updateDoc(doc(firestore, 'servants', d.id), {
                                ...updatedFields,
                                updatedAt: new Date().toISOString()
                            });
                            setProfile(prev => ({ ...prev, docId: d.id }));
                        }
                    } else {
                        // Create servant document if none exists
                        const newDocRef = await addDoc(collection(firestore, 'servants'), {
                            ...profile,
                            ...updatedFields,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        });
                        setProfile(prev => ({ ...prev, docId: newDocRef.id }));
                    }
                }
            }
        } catch (servantColErr) {
            console.warn("Firestore servants collection update error:", servantColErr);
        }

        // F. Firebase Auth updateProfile (if currentUser exists)
        if (updatedFields.photoURL) {
            try {
                const auth = getAuth();
                if (auth && auth.currentUser) {
                    await updateProfile(auth.currentUser, {
                        photoURL: updatedFields.photoURL
                    });
                }
            } catch (authErr) {
                console.warn("Firebase Auth updateProfile skipped/failed:", authErr);
            }
        }
    };

    // 4. Handle Profile Picture Upload
    const handlePhotoSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input for re-selection
        e.target.value = '';

        if (!file.type.startsWith('image/')) {
            setNotification({ type: 'error', message: 'يرجى اختيار ملف صورة صالح (JPG, PNG, WEBP)' });
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setNotification({ type: 'error', message: 'حجم الصورة كبير جداً، الحد الأقصى المسموح به 10 ميجابايت' });
            return;
        }

        setIsUploadingPhoto(true);
        setNotification({ type: '', message: '' });

        try {
            const secureUrl = await uploadImageToCloudinary(file);
            if (!secureUrl) throw new Error("لم يتم استلام رابط الصورة");

            // Update local UI immediately
            setProfile(prev => ({
                ...prev,
                photoURL: secureUrl
            }));

            // Sync across all stores
            await persistUpdates({
                photoURL: secureUrl,
                profileImage: secureUrl,
                profilePic: secureUrl
            });

            setNotification({ type: 'success', message: 'تم تحديث الصورة الشخصية بنجاح! 📸' });
        } catch (err) {
            console.error("Failed to upload profile photo:", err);
            setNotification({ type: 'error', message: 'فشل رفع الصورة: ' + (err.message || 'تأكد من الاتصال بالإنترنت وحاول ثانية') });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    // 5. Handle Personal & Spiritual Profile Save
    const handleSaveProfile = async (e) => {
        if (e) e.preventDefault();
        setIsSavingProfile(true);
        setNotification({ type: '', message: '' });

        try {
            const updatedFields = {
                fatherConfessor: (editForm.fatherConfessor || '').trim(),
                birthDate: editForm.birthDate || '',
                address: (editForm.address || '').trim(),
                notes: (editForm.notes || '').trim()
            };

            await persistUpdates(updatedFields);

            setProfile(prev => ({ ...prev, ...updatedFields }));
            setIsEditingProfile(false);
            setNotification({ 
                type: 'success', 
                message: 'تم حفظ وتحديث البيانات الشخصية والروحية بنجاح ✝️' 
            });

            // Audit log
            await logActivity(
                'UPDATE_SERVANT_PROFILE',
                `تعديل البيانات الشخصية للخادم "${profile.name}" (أب الاعتراف: ${updatedFields.fatherConfessor || 'لم يحدد'})`,
                loggedInServant
            );
        } catch (err) {
            console.error("Failed to save servant profile:", err);
            setNotification({ 
                type: 'error', 
                message: 'فشل حفظ البيانات، يرجى التأكد من الاتصال بالإنترنت والمحاولة مجدداً.' 
            });
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Calculate age in years
    const calculateAge = (dateStr) => {
        if (!dateStr) return null;
        try {
            const birth = new Date(dateStr);
            if (isNaN(birth.getTime())) return null;
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            return age > 0 ? age : null;
        } catch (e) {
            return null;
        }
    };

    // 6. Handle Address Save (Quick address fallback)
    const handleSaveAddress = async () => {
        const cleanAddr = addressInput.trim();
        setIsSavingAddress(true);
        setNotification({ type: '', message: '' });

        try {
            setProfile(prev => ({ ...prev, address: cleanAddr }));

            await persistUpdates({
                address: cleanAddr
            });

            setIsEditingAddress(false);
            setNotification({ type: 'success', message: 'تم حفظ وتحديث العنوان بنجاح! 📍' });
        } catch (err) {
            console.error("Failed to save address:", err);
            setNotification({ type: 'error', message: 'فشل حفظ العنوان، يرجى المحاولة مرة أخرى' });
        } finally {
            setIsSavingAddress(false);
        }
    };

    // Clean phone number for direct WhatsApp link
    const cleanPhoneForWhatsapp = (phone) => {
        let clean = String(phone || '').replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '2' + clean;
        else if (!clean.startsWith('20') && clean.length > 0) clean = '20' + clean;
        return clean;
    };

    // Badge styling config for role
    const roleConfig = getRoleBadgeConfig(profile.role);
    const RoleIcon = roleConfig.icon;

    // Calculate dynamic attendance percentage
    const attendancePercentage = attendanceStats.totalWeeks > 0 
        ? Math.round((attendanceStats.totalAttendance / attendanceStats.totalWeeks) * 100) 
        : 100;

    // Format Arabic dates cleanly
    const formatArabicDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    };

    if (isModal && !isOpen) return null;

    // Inner Content component (shared between Modal and Page view)
    const contentJSX = (
        <div className="p-5 sm:p-7 relative select-none">
            {/* 🌟 Notification Toast */}
            {notification.message && (
                <div className={`mb-5 p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-300 shadow-md ${
                    notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                    {notification.type === 'success' ? <CheckCircle2 className="text-emerald-500 shrink-0" size={20} /> : <AlertCircle className="text-red-500 shrink-0" size={20} />}
                    <span className="font-bold text-sm">{notification.message}</span>
                </div>
            )}

            {/* 🌟 Header Section: Avatar, Name, Role & Badges */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-slate-100">
                {/* Avatar with Ring & Edit Overlay */}
                <div className="relative group shrink-0">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full ring-4 ring-indigo-500/20 shadow-xl shadow-indigo-500/10 bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center overflow-hidden relative">
                        {profile.photoURL ? (
                            <img 
                                src={profile.photoURL} 
                                alt={profile.name} 
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-indigo-400">
                                <User size={48} strokeWidth={1.5} />
                            </div>
                        )}

                        {/* Uploading Spinner Overlay */}
                        {isUploadingPhoto && (
                            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center text-white z-20">
                                <Loader2 size={30} className="animate-spin text-amber-400 mb-1" />
                                <span className="text-[10px] font-black">جاري الرفع...</span>
                            </div>
                        )}
                    </div>

                    {/* Camera Upload Button */}
                    {canEdit && (
                        <>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingPhoto}
                                aria-label="تغيير الصورة الشخصية"
                                title="تغيير الصورة الشخصية"
                                className="absolute bottom-0 left-0 bg-indigo-600 hover:bg-indigo-700 active:scale-90 text-white p-2.5 rounded-full shadow-lg border-2 border-white transition-all cursor-pointer z-10"
                            >
                                <Camera size={18} />
                            </button>
                            <input 
                                ref={fileInputRef} 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handlePhotoSelect} 
                            />
                        </>
                    )}
                </div>

                {/* Name, Badges & Assigned Class */}
                <div className="flex-1 text-center sm:text-right">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-xs ${roleConfig.bg} ${roleConfig.glow}`}>
                            <RoleIcon size={14} />
                            {roleConfig.label}
                        </span>

                        {!isSelf && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <ShieldCheck size={12} className="text-amber-500" />
                                معاينة إدارية
                            </span>
                        )}
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2 leading-tight">
                        {profile.name || "الخادم غير معروف"}
                    </h1>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs font-bold text-slate-500">
                        <span className="flex items-center gap-1.5 bg-slate-100/80 px-3 py-1 rounded-xl text-slate-700 border border-slate-200/60">
                            <Users size={14} className="text-indigo-600" />
                            {profile.assignedOsra || 'الخدمة العامة'}
                        </span>

                        {profile.syncKey && (
                            <span className="flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-xl text-indigo-700 border border-indigo-100 font-mono text-[11px]">
                                كود الخدمة: {profile.syncKey}
                            </span>
                        )}
                    </div>

                    {/* Quick Contact Buttons */}
                    {profile.phone && (
                        <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <a 
                                href={`tel:${profile.phone}`} 
                                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-black shadow-xs transition-all"
                            >
                                <Phone size={14} className="text-indigo-600" />
                                <span dir="ltr">{profile.phone}</span>
                            </a>

                            <a 
                                href={`https://wa.me/${cleanPhoneForWhatsapp(profile.phone)}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-700 px-3.5 py-1.5 rounded-xl text-xs font-black border border-emerald-200 shadow-xs transition-all"
                            >
                                <MessageCircle size={14} className="text-emerald-600" />
                                واتساب
                            </a>
                        </div>
                    )}
                </div>
            </div>

            {/* 🌟 البيانات الشخصية والروحية (Personal & Spiritual Profile Data) 🌟 */}
            <div className="py-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                        <Church size={18} className="text-purple-600" />
                        البيانات الشخصية والروحية
                    </h3>

                    {canEdit && !isEditingProfile && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditForm({
                                    fatherConfessor: profile.fatherConfessor || '',
                                    birthDate: profile.birthDate || '',
                                    address: profile.address || '',
                                    notes: profile.notes || ''
                                });
                                setIsEditingProfile(true);
                            }}
                            className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
                        >
                            <Edit3 size={13} />
                            تعديل البيانات
                        </button>
                    )}
                </div>

                {isEditingProfile ? (
                    /* 📝 نموذج التعديل المتكامل (Integrated Edit Form) */
                    <div className="bg-slate-50/90 p-5 rounded-3xl border border-indigo-200 shadow-sm animate-in fade-in duration-200">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/70">
                            <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                <Edit3 size={14} className="text-indigo-600" />
                                تعديل بيانات الخادم
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                                يتم الحفظ والمزامنة السحابية فوراً
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* 1. أب الاعتراف (Father of Confession) */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-black text-purple-950 mb-1 flex items-center gap-1.5">
                                    <Church size={14} className="text-purple-600" />
                                    أب الاعتراف (الاب الكاهن)
                                </label>
                                <input
                                    type="text"
                                    value={editForm.fatherConfessor}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, fatherConfessor: e.target.value }))}
                                    placeholder="مثال: أبونا بيشوي كامل، أبونا يوحنا..."
                                    className="w-full bg-white border border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 font-bold outline-none transition-all shadow-xs"
                                    autoFocus
                                />
                            </div>

                            {/* 2. تاريخ الميلاد (Birthdate) */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
                                    <Calendar size={14} className="text-rose-500" />
                                    تاريخ الميلاد
                                </label>
                                <input
                                    type="date"
                                    value={editForm.birthDate}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 font-bold outline-none transition-all shadow-xs"
                                />
                            </div>

                            {/* 3. عنوان السكن (Address) */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
                                    <MapPin size={14} className="text-emerald-500" />
                                    عنوان السكن بالتفصيل
                                </label>
                                <textarea
                                    rows={2}
                                    value={editForm.address}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                                    placeholder="أدخل عنوان السكن (المنطقة، الشارع، رقم العمارة، علامة مميزة)..."
                                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl p-3 text-sm text-slate-800 placeholder-slate-400 font-bold outline-none resize-none transition-all shadow-xs"
                                />
                            </div>

                            {/* 4. ملاحظات الخدمة والمواهب (Notes) */}
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-black text-slate-700 mb-1 flex items-center gap-1.5">
                                    <BookOpen size={14} className="text-blue-500" />
                                    ملاحظات الخدمة والتخصص والمواهب
                                </label>
                                <textarea
                                    rows={2}
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="مواهب الخدمة، التخصص، دراسات إكليريكية أو لاهوتية، ملاحظات روحية..."
                                    className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl p-3 text-sm text-slate-800 placeholder-slate-400 font-bold outline-none resize-none transition-all shadow-xs"
                                />
                            </div>
                        </div>

                        {/* أزرار الحفظ والإلغاء */}
                        <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-slate-200/70">
                            <button
                                type="button"
                                onClick={() => setIsEditingProfile(false)}
                                disabled={isSavingProfile}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                className="flex items-center gap-2 px-5 py-2 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                            >
                                {isSavingProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                حفظ التعديلات والمزامنة
                            </button>
                        </div>
                    </div>
                ) : (
                    /* 📋 عرض البطاقات في وضع المشاهدة (Display Cards in View Mode) */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* 1. أب الاعتراف (Father of Confession) - بطاقة مميزة بلون روحي */}
                        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/90 via-indigo-50/50 to-slate-50 border border-purple-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-purple-300 transition-all">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-purple-800 flex items-center gap-1.5">
                                        <Church size={16} className="text-purple-600" />
                                        أب الاعتراف
                                    </span>
                                    <span className="text-[10px] font-black bg-purple-100/90 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200">
                                        ✝️ رعاية روحية
                                    </span>
                                </div>
                                <p className={`text-sm sm:text-base font-black ${profile.fatherConfessor ? 'text-purple-950' : 'text-slate-400 italic font-medium'}`}>
                                    {profile.fatherConfessor || 'لم يتم تسجيل أب الاعتراف'}
                                </p>
                            </div>

                            {attendanceStats.lastConfessionDate && (
                                <div className="mt-3 pt-2 border-t border-purple-100/70 flex items-center gap-1.5 text-[11px] font-bold text-purple-700">
                                    <span>آخر اعتراف مسجل:</span>
                                    <span className="font-mono">{formatArabicDate(attendanceStats.lastConfessionDate)}</span>
                                </div>
                            )}
                        </div>

                        {/* 2. تاريخ الميلاد (Birthdate) */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                        <Calendar size={15} className="text-rose-500" />
                                        تاريخ الميلاد
                                    </span>
                                    {calculateAge(profile.birthDate) && (
                                        <span className="text-[10px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                                            {calculateAge(profile.birthDate)} سنة
                                        </span>
                                    )}
                                </div>
                                <p className={`text-sm font-black ${profile.birthDate ? 'text-slate-800' : 'text-slate-400 italic font-medium'}`}>
                                    {profile.birthDate ? formatArabicDate(profile.birthDate) : 'غير مسجل'}
                                </p>
                            </div>
                        </div>

                        {/* 3. عنوان السكن (Address) */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                        <MapPin size={15} className="text-emerald-500" />
                                        عنوان السكن
                                    </span>
                                </div>
                                <p className={`text-sm font-bold leading-relaxed ${profile.address ? 'text-slate-800' : 'text-slate-400 italic font-medium'}`}>
                                    {profile.address || 'لم يتم تسجيل العنوان بعد'}
                                </p>
                            </div>
                        </div>

                        {/* 4. ملاحظات ومواهب الخدمة (Notes) */}
                        <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                        <BookOpen size={15} className="text-blue-500" />
                                        ملاحظات وتخصص الخدمة
                                    </span>
                                </div>
                                <p className={`text-xs font-bold leading-relaxed ${profile.notes ? 'text-slate-800' : 'text-slate-400 italic font-medium'}`}>
                                    {profile.notes || 'لا توجد ملاحظات مسجلة'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 🌟 Open-Ended Attendance Counter (إجمالي مرات الحضور) 🌟 */}
            <div className="pt-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-500" />
                        سجل الحضور والالتزام
                    </h3>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                        عداد مفتوح تاريخي
                    </span>
                </div>

                {attendanceStats.isLoadingStats ? (
                    <div className="p-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                        <Loader2 size={32} className="animate-spin text-indigo-500 mb-2" />
                        <span className="text-xs font-bold">جاري حساب إجمالي الحضور التاريخي...</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* 🌟 Big Glowing Stat Card for Total Attendance 🌟 */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-950 to-purple-950 text-white p-6 sm:p-7 rounded-[2rem] shadow-xl shadow-indigo-950/20 border border-indigo-800/40">
                            <div className="absolute top-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                            <div className="absolute bottom-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

                            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                                <div className="text-center sm:text-right">
                                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-300 bg-amber-500/15 border border-amber-400/30 px-3 py-1 rounded-full mb-3">
                                        <TrendingUp size={13} />
                                        إجمالي الحضور الفعلي
                                    </div>
                                    <div className="flex items-baseline justify-center sm:justify-start gap-2">
                                        <span className="text-5xl sm:text-6xl font-black text-white tracking-tight drop-shadow-sm font-sans">
                                            {attendanceStats.totalAttendance}
                                        </span>
                                        <span className="text-lg font-bold text-indigo-200">
                                            مرة حضور
                                        </span>
                                    </div>
                                    <p className="text-xs text-indigo-300 font-bold mt-1.5">
                                        محسوبة بدقة من كل أسابيع الخدمة والقداسات المسجلة
                                    </p>
                                </div>

                                <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
                                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center shadow-inner">
                                        <span className="text-xl font-black text-emerald-400">
                                            {attendancePercentage}%
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-300">
                                            نسبة الالتزام
                                        </span>
                                    </div>
                                    <span className="text-[11px] font-bold text-indigo-200">
                                        من إجمالي {attendanceStats.totalWeeks} أسبوع مسجل
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Sub-stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                            {/* القداسات */}
                            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs flex flex-col items-center text-center">
                                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-1.5">
                                    <Church size={18} />
                                </div>
                                <span className="text-xl font-black text-slate-800">{attendanceStats.liturgies}</span>
                                <span className="text-[11px] font-bold text-slate-400">قداس إلهي</span>
                            </div>

                            {/* اجتماعات الخدمة */}
                            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs flex flex-col items-center text-center">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5">
                                    <Users size={18} />
                                </div>
                                <span className="text-xl font-black text-slate-800">{attendanceStats.meetings}</span>
                                <span className="text-[11px] font-bold text-slate-400">اجتماع خدمة</span>
                            </div>

                            {/* الافتقاد */}
                            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs flex flex-col items-center text-center">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1.5">
                                    <Heart size={18} />
                                </div>
                                <span className="text-xl font-black text-slate-800">{attendanceStats.visitations}</span>
                                <span className="text-[11px] font-bold text-slate-400">افتقاد رعوي</span>
                            </div>

                            {/* التحضير */}
                            <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs flex flex-col items-center text-center">
                                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-1.5">
                                    <BookOpen size={18} />
                                </div>
                                <span className="text-xl font-black text-slate-800">{attendanceStats.preparations}</span>
                                <span className="text-[11px] font-bold text-slate-400">تحضير درس</span>
                            </div>
                        </div>

                        {/* Last Confession Card */}
                        {attendanceStats.lastConfessionDate && (
                            <div className="bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/70 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                                        <Calendar size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-amber-900">آخر موعد اعتراف مسجل</h4>
                                        <p className="text-[11px] font-bold text-amber-700 mt-0.5">
                                            {formatArabicDate(attendanceStats.lastConfessionDate)}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black bg-amber-200/60 text-amber-800 px-2 py-0.5 rounded-md">
                                    سري ومحمي
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // 🌟 Modal Layout Rendering (e.g. Abouna clicking servant card in MasterDashboard)
    if (isModal) {
        return (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
                dir="rtl"
                onClick={(e) => {
                    if (e.target === e.currentTarget && onClose) onClose();
                }}
            >
                <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
                    {/* Modal Top Bar */}
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-black text-sm text-slate-800">
                            <User size={18} className="text-indigo-600" />
                            ملف الخادم الشخصي
                        </div>

                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="إغلاق"
                                className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Scrollable Modal Content */}
                    <div className="max-h-[85vh] overflow-y-auto">
                        {contentJSX}
                    </div>
                </div>
            </div>
        );
    }

    // 🌟 Full Standalone Page Layout (e.g. /servant-profile or /my-profile)
    return (
        <main className="min-h-screen bg-slate-50 relative overflow-x-hidden font-sans pb-16" dir="rtl">
            <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-120 h-120 rounded-full bg-indigo-600/5 blur-[100px]" />
                <div className="absolute bottom-10 -left-20 w-100 h-100 rounded-full bg-amber-500/5 blur-[80px]" />
            </div>

            <div className="relative z-10 max-w-2xl mx-auto px-4 pt-6">
                {/* Page Header with Back Button */}
                <div className="flex items-center justify-between mb-6 bg-white/80 backdrop-blur-md p-4 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                            <User size={22} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-800">
                                {isSelf ? "الملف الشخصي (بروفايلي)" : "ملف الخادم"}
                            </h1>
                            <p className="text-xs font-bold text-slate-400">
                                {isSelf ? "تعديل البيانات الشخصية ومتابعة الحضور" : profile.name}
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={() => navigate(-1)} 
                        aria-label="الرجوع للخلف" 
                        className="flex items-center justify-center w-11 h-11 bg-slate-100 text-slate-600 rounded-full hover:bg-indigo-600 hover:text-white transition-all shadow-sm cursor-pointer"
                    >
                        <ArrowRight size={20} />
                    </button>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200/80 overflow-hidden">
                    {contentJSX}
                </div>
            </div>
        </main>
    );
}
