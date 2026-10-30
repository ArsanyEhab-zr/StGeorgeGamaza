import React, { useState, useEffect } from 'react';
import { X, Save, User, Phone, Users, Shield, Calendar, Heart, Loader2, CheckCircle2 } from 'lucide-react';
import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import { db } from '../db/database';
import { logActivity } from '../utils/activityLogger';

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const cleanName = (n) => String(n || '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');

const STANDARD_ROLES = [
    "خادم",
    "أمين أسرة",
    "مساعد أمين أسرة",
    "أمين خدمة",
    "أمين مرحلة",
    "أمين مساعد",
    "راعي الخدمة",
    "كاهن",
    "Super Admin"
];

export default function EditServantModal({ isOpen, servant, services: initialServices, onClose, onSaved }) {
    if (!isOpen || !servant) return null;

    const [formData, setFormData] = useState({
        name: servant.name || '',
        phone: servant.phone || '',
        assignedOsra: servant.assignedOsra || servant.osraName || '',
        syncKey: servant.syncKey || '',
        role: servant.role || 'خادم',
        birthDate: servant.birthDate || servant.birthdate || '',
        confessionFather: servant.confessionFather || servant.fatherConfessor || ''
    });

    const [servicesList, setServicesList] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        // Populate services and osras for the dropdown
        try {
            if (Array.isArray(initialServices) && initialServices.length > 0) {
                setServicesList(initialServices);
            } else {
                const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
                if (Array.isArray(settings.services) && settings.services.length > 0) {
                    setServicesList(settings.services);
                }
            }
        } catch (e) {
            console.warn("Failed to load services for EditServantModal:", e);
        }
    }, [initialServices]);

    // Handle Osra Selection
    const handleOsraSelect = (e) => {
        const selectedOsraName = e.target.value;
        let matchedSyncKey = formData.syncKey;

        // Find matching syncKey
        servicesList.forEach(srv => {
            (srv.osras || []).forEach(o => {
                if (o.name === selectedOsraName) {
                    matchedSyncKey = o.syncKey;
                }
            });
        });

        setFormData(prev => ({
            ...prev,
            assignedOsra: selectedOsraName,
            syncKey: matchedSyncKey
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!formData.name.trim()) {
            setErrorMsg('يرجى إدخال اسم الخادم');
            return;
        }

        if (!formData.phone.trim()) {
            setErrorMsg('يرجى إدخال رقم هاتف الخادم');
            return;
        }

        setIsSaving(true);
        try {
            const updatedFields = {
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                role: formData.role.trim() || 'خادم',
                assignedOsra: formData.assignedOsra.trim(),
                syncKey: formData.syncKey.trim() || servant.syncKey || '',
                birthDate: formData.birthDate || '',
                confessionFather: formData.confessionFather.trim(),
                fatherConfessor: formData.confessionFather.trim(),
                updatedAt: new Date().toISOString()
            };

            const updatedServant = {
                ...servant,
                ...updatedFields
            };

            const targetId = servant.id || servant.uid;
            const targetPhone = cleanPhone(servant.phone);
            const targetName = cleanName(servant.name);

            // 1. Update Firestore: System/mainConfig
            try {
                const configRef = doc(firestore, 'System', 'mainConfig');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const configData = configSnap.data();
                    if (Array.isArray(configData.servants)) {
                        let matched = false;
                        const updatedServantsList = configData.servants.map(s => {
                            const sId = String(s.id || s.uid || '');
                            const sPhone = cleanPhone(s.phone);
                            const sName = cleanName(s.name);

                            if ((targetId && sId === String(targetId)) ||
                                (targetPhone && sPhone === targetPhone) ||
                                (targetName && sName === targetName)) {
                                matched = true;
                                return {
                                    ...s,
                                    ...updatedFields
                                };
                            }
                            return s;
                        });

                        if (matched) {
                            await setDoc(configRef, { servants: updatedServantsList }, { merge: true });
                        }
                    }
                }
            } catch (err) {
                console.warn("Error updating System/mainConfig:", err);
            }

            // 2. Update Firestore: servants collection
            try {
                if (servant.docId) {
                    await updateDoc(doc(firestore, 'servants', servant.docId), updatedFields);
                } else {
                    const q = query(collection(firestore, 'servants'), where('phone', '==', servant.phone));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        for (const d of snap.docs) {
                            await updateDoc(doc(firestore, 'servants', d.id), updatedFields);
                        }
                    } else if (servant.uid) {
                        const uidRef = doc(firestore, 'servants', servant.uid);
                        const uidSnap = await getDoc(uidRef);
                        if (uidSnap.exists()) {
                            await updateDoc(uidRef, updatedFields);
                        }
                    }
                }
            } catch (err) {
                console.warn("Error updating servants collection:", err);
            }

            // 3. Update localStorage: appSettings
            try {
                const appSettingsStr = localStorage.getItem('appSettings');
                if (appSettingsStr) {
                    const appSettings = JSON.parse(appSettingsStr);
                    if (Array.isArray(appSettings.servants)) {
                        appSettings.servants = appSettings.servants.map(s => {
                            const sId = String(s.id || s.uid || '');
                            const sPhone = cleanPhone(s.phone);
                            const sName = cleanName(s.name);
                            if ((targetId && sId === String(targetId)) ||
                                (targetPhone && sPhone === targetPhone) ||
                                (targetName && sName === targetName)) {
                                return { ...s, ...updatedFields };
                            }
                            return s;
                        });
                        localStorage.setItem('appSettings', JSON.stringify(appSettings));
                    }
                }

                // If current logged-in servant is being edited
                const curServantStr = localStorage.getItem('currentServant');
                if (curServantStr) {
                    const curServant = JSON.parse(curServantStr);
                    const curId = String(curServant.id || curServant.uid || '');
                    const curPhone = cleanPhone(curServant.phone);
                    if ((targetId && curId === String(targetId)) || (targetPhone && curPhone === targetPhone)) {
                        localStorage.setItem('currentServant', JSON.stringify({ ...curServant, ...updatedFields }));
                    }
                }
            } catch (err) {
                console.warn("Error updating localStorage appSettings:", err);
            }

            // 4. Update Dexie: db.servants
            try {
                if (db.servants) {
                    const dId = String(targetId || Date.now());
                    await db.servants.put({
                        ...servant,
                        ...updatedFields,
                        id: dId
                    });
                }
            } catch (err) {
                console.warn("Dexie db.servants put error:", err);
            }

            // 5. Broadcast real-time events across windows & components
            window.dispatchEvent(new CustomEvent('servant-profile-updated', {
                detail: { servantId: targetId, phone: formData.phone, updatedFields }
            }));
            window.dispatchEvent(new Event('storage'));

            // 6. Audit activity log
            await logActivity(
                'EDIT_SERVANT',
                `تعديل بيانات الخادم "${formData.name}" (الأسرة: ${formData.assignedOsra || 'غير محدد'} - الرتبة: ${formData.role})`
            );

            setSuccessMsg('تم حفظ وتحديث بيانات الخادم بنجاح! ✅');

            if (onSaved) {
                onSaved(updatedServant);
            }

            setTimeout(() => {
                onClose();
            }, 700);

        } catch (err) {
            console.error("Failed to update servant:", err);
            setErrorMsg('حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <User size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white">تعديل بيانات الخادم</h2>
                            <p className="text-xs text-slate-300 font-bold">{servant.name || 'بدون اسم'}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
                    {errorMsg && (
                        <div className="bg-rose-50 text-rose-700 p-3 rounded-xl text-xs font-bold border border-rose-200 animate-in shake duration-300">
                            {errorMsg}
                        </div>
                    )}

                    {successMsg && (
                        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-2">
                            <CheckCircle2 size={16} /> {successMsg}
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <User size={14} className="text-indigo-600" /> اسم الخادم الثلاثي أو الرباعي:
                        </label>
                        <input 
                            type="text" 
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="مثال: يوسف ماهر عزيز"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                        />
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Phone size={14} className="text-emerald-600" /> رقم الموبايل (المستخدم لتسجيل الدخول والواتساب):
                        </label>
                        <input 
                            type="tel" 
                            required
                            dir="ltr"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="012xxxxxxxx"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-right"
                        />
                    </div>

                    {/* Role & Assigned Osra Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Role */}
                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <Shield size={14} className="text-amber-600" /> الرتبة / الدور:
                            </label>
                            <select 
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-500 outline-none transition-all"
                            >
                                {STANDARD_ROLES.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                                {!STANDARD_ROLES.includes(formData.role) && (
                                    <option value={formData.role}>{formData.role}</option>
                                )}
                            </select>
                        </div>

                        {/* Assigned Osra */}
                        <div>
                            <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                                <Users size={14} className="text-indigo-600" /> الأسرة المنسوب إليها:
                            </label>
                            <select 
                                value={formData.assignedOsra}
                                onChange={handleOsraSelect}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                            >
                                <option value="">-- اختر الأسرة --</option>
                                {servicesList.map(service => (
                                    <optgroup key={service.id || service.name} label={`خدمة ${service.name}`}>
                                        {(service.osras || []).map(osra => (
                                            <option key={osra.id || osra.name} value={osra.name}>
                                                {osra.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                                {formData.assignedOsra && !servicesList.some(s => (s.osras || []).some(o => o.name === formData.assignedOsra)) && (
                                    <option value={formData.assignedOsra}>{formData.assignedOsra}</option>
                                )}
                            </select>
                        </div>
                    </div>

                    {/* Birthdate */}
                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Calendar size={14} className="text-blue-600" /> تاريخ الميلاد:
                        </label>
                        <input 
                            type="date" 
                            value={formData.birthDate}
                            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none transition-all cursor-pointer"
                        />
                    </div>

                    {/* Confession Father */}
                    <div>
                        <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <Heart size={14} className="text-purple-600" /> أب الاعتراف:
                        </label>
                        <input 
                            type="text" 
                            value={formData.confessionFather}
                            onChange={(e) => setFormData({ ...formData, confessionFather: e.target.value })}
                            placeholder="مثال: أبونا بيشوي كامل"
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-purple-500 outline-none transition-all"
                        />
                    </div>

                    {/* Footer / Buttons */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            disabled={isSaving}
                            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                        >
                            إلغاء
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSaving}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    جاري الحفظ...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    حفظ التعديلات
                                </>
                            )}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}
