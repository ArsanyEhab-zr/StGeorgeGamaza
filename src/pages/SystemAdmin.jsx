/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadImageToCloudinary } from '../utils/cloudinary';
import {
    ShieldAlert, Key, Church, ImagePlus, Lock,
    Trash2, Save, Users, UserPlus, ArrowRight,
    Layers, PlusCircle, FileText, UserCircle, Loader2, BookOpen, X,
    MessageCircle, CheckCircle, XCircle, Clock, WifiOff
} from 'lucide-react';

// 🌟 استدعاءات الفايربيز
import { collection, getDocs, doc, deleteDoc, setDoc, getDoc, addDoc } from 'firebase/firestore';
import { firestore } from '../db/firebase';

const getSettings = () => {
    const defaults = {
        secretPass: "1234",
        deletePass: "مسح",
        adminPass: "admin",
        appUrl: window.location.origin,
        services: [],
        servants: []
    };
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        try {
            const parsed = { ...defaults, ...JSON.parse(saved) };
            if (!parsed.services || parsed.services.length === 0) {
                parsed.services = [{
                    id: Date.now(),
                    name: "كنيسة الشهيد العظيم مارجرجس غمازة الكبري",
                    priest: "الآباء الكهنة",
                    logo: "",
                    osras: [
                        { id: 101, name: "كي جي وحتي ثانية ابتدائي", amin: "", syncKey: "stage_1", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 102, name: "من ثالثة لسادسة", amin: "", syncKey: "stage_2", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 103, name: "اعدادي بنين", amin: "", syncKey: "stage_3", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 104, name: "اعدادي بنات", amin: "", syncKey: "stage_4", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 105, name: "ثانوي بنين", amin: "", syncKey: "stage_5", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 106, name: "ثانوي بنات", amin: "", syncKey: "stage_6", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 107, name: "شباب", amin: "", syncKey: "stage_7", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 108, name: "متزوجين حديثا", amin: "", syncKey: "stage_8", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 109, name: "البابا شنودة للسيدات", amin: "", syncKey: "stage_9", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 110, name: "رجال", amin: "", syncKey: "stage_10", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 111, name: "مريمات", amin: "", syncKey: "stage_11", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 112, name: "اجتماع خدام", amin: "", syncKey: "stage_12", logo: "", curriculumName: "", pdfUrl: "", lessons: [] },
                        { id: 113, name: "اجتماع الراعي الصالح", amin: "", syncKey: "stage_13", logo: "", curriculumName: "", pdfUrl: "", lessons: [] }
                    ]
                }];
            }
            if (!parsed.servants) parsed.servants = [];
            return parsed;
        } catch (e) {
            console.error("Error parsing settings", e);
        }
    }
    return defaults;
};

export default function SystemAdmin() {
    const navigate = useNavigate();
    const [appSettings, setAppSettings] = useState(getSettings());
    const [isAdminAuth, setIsAdminAuth] = useState(false);
    const [temporarySuperAdmin, setTemporarySuperAdmin] = useState(false);
    const [adminPasswordInput, setAdminPasswordInput] = useState("");
    const [form, setForm] = useState(getSettings());
    const [newServant, setNewServant] = useState({ name: '', role: 'خادم', email: '', phone: '', assignedOsra: '', syncKey: '', password: '' });

    const [curriculumModal, setCurriculumModal] = useState({ isOpen: false, sId: null, oId: null, osraName: '' });
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);

    const [isSavingToCloud, setIsSavingToCloud] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const [joinRequests, setJoinRequests] = useState([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(false);

    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const currentServant = JSON.parse(localStorage.getItem('currentServant') || '{}');

    const isSuperAdmin = temporarySuperAdmin || currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE' || currentServant.role === 'أدمن مساعد';
    const isPriest = currentServant.role === 'كاهن';
    const isAmin = currentServant.role === 'أمين خدمة' || currentServant.role === 'أمين أسرة';

    useEffect(() => {
        if (isSuperAdmin || isPriest || isAmin) {
            setIsAdminAuth(true);
        }

        const handleOnline = async () => {
            setIsOnline(true);
            if (localStorage.getItem('pendingStructureSync') === 'true') {
                const saved = JSON.parse(localStorage.getItem('appSettings'));
                if (saved) {
                    try {
                        const cleanServices = JSON.parse(JSON.stringify(saved.services || []));
                        const cleanServants = JSON.parse(JSON.stringify(saved.servants || []));
                        await setDoc(doc(firestore, "System", "mainConfig"), {
                            services: cleanServices,
                            servants: cleanServants
                        });
                        localStorage.removeItem('pendingStructureSync');
                    } catch (e) { console.error("Auto-sync failed", e); }
                }
            }
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isSuperAdmin, isPriest, isAmin]);

    useEffect(() => {
        if (isAdminAuth) {
            const fetchJoinRequests = async () => {
                if (!navigator.onLine) return;
                setIsLoadingRequests(true);
                try {
                    const querySnapshot = await getDocs(collection(firestore, "JoinRequests"));
                    const requests = [];
                    querySnapshot.forEach((doc) => {
                        requests.push({ id: doc.id, ...doc.data() });
                    });
                    setJoinRequests(requests);
                } catch (error) {
                    console.error("خطأ في جلب الطلبات:", error);
                }
                setIsLoadingRequests(false);
            };
            fetchJoinRequests();
        }
    }, [isAdminAuth]);

    // 🌟🌟 Auto-Pull: سحب الهيكل المركزي تلقائياً عند فتح الصفحة 🌟🌟
    useEffect(() => {
        const autoFetchStructure = async () => {
            if (!navigator.onLine) return;
            try {
                const snap = await getDoc(doc(firestore, "System", "mainConfig"));
                if (!snap.exists()) return;
                const cloudData = snap.data();
                const localSettingsString = localStorage.getItem('appSettings');
                const localParsed = JSON.parse(localSettingsString || '{}');
                // Merge cloud structure into local (cloud wins for structure)
                const mergedSettings = { ...localParsed, services: cloudData.services || localParsed.services, servants: cloudData.servants || localParsed.servants };
                setAppSettings(mergedSettings);
                setForm(mergedSettings);
                localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
                console.log('🔄 [SystemAdmin] Auto-pulled structure from cloud.');
            } catch (e) {
                console.warn('[SystemAdmin] Auto-pull failed (offline?):', e.message);
            }
        };
        if (isAdminAuth) autoFetchStructure();
    }, [isAdminAuth]);

    const updateSettings = async (newSettings) => {
        setAppSettings(newSettings);
        setForm(newSettings);

        localStorage.setItem('appSettings', JSON.stringify(newSettings));

        if (!navigator.onLine) {
            localStorage.setItem('pendingStructureSync', 'true');
            alert("📶 تم الحفظ على الموبايل فقط (أوفلاين). سيتم الرفع للسحابة تلقائياً فور عودة الإنترنت! ✅");
            navigate(-1);
            return;
        }

        setIsSavingToCloud(true);
        try {
            const cleanServices = JSON.parse(JSON.stringify(newSettings.services || []));
            const cleanServants = JSON.parse(JSON.stringify(newSettings.servants || []));
            await setDoc(doc(firestore, "System", "mainConfig"), {
                services: cleanServices,
                servants: cleanServants
            });
            localStorage.removeItem('pendingStructureSync');
            alert("بوووووم! 💥 تم حفظ الهيكل ورفعه للسحابة بنجاح. أي أدمن تاني يقدر يسحبه دلوقتي!");
            navigate(-1);
        } catch (e) {
            console.error("Firebase Save Error:", e);
            localStorage.setItem('pendingStructureSync', 'true');
            alert("⚠️ فشل الرفع للسحابة: " + (e.message || "تأكد من إعدادات فايربيز"));
        } finally {
            setIsSavingToCloud(false);
        }
    };

    const handleSave = (e) => {
        e.preventDefault();
        updateSettings(form);
    };

    const visibleServices = form.services?.filter(service => {
        if (isSuperAdmin) return true;
        return service.osras.some(osra => osra.syncKey === currentSyncKey);
    });

    const handleAddService = () => {
        const newService = { id: Date.now(), name: '', priest: '', logo: '', osras: [] };
        setForm({ ...form, services: [...form.services, newService] });
    };

    const handleUpdateService = (sId, field, value) => {
        const updatedServices = form.services.map(s => s.id === sId ? { ...s, [field]: value } : s);
        setForm({ ...form, services: updatedServices });
    };

    const handleDeleteService = (sId) => {
        if (window.confirm("⚠️ متأكد إنك عايز تمسح الخدمة دي؟ كل أسرها والخدام بتوعها هيتطردوا من النظام!")) {
            const serviceToDelete = form.services.find(s => s.id === sId);
            const osrasNamesInService = serviceToDelete ? serviceToDelete.osras.map(o => o.name) : [];
            const updatedServices = form.services.filter(s => s.id !== sId);
            const updatedServants = form.servants.filter(servant => !osrasNamesInService.includes(servant.assignedOsra));
            setForm({ ...form, services: updatedServices, servants: updatedServants });
        }
    };

    const handleAddOsra = (serviceId) => {
        const newOsra = { id: Date.now(), name: '', amin: '', syncKey: '', logo: '', curriculumName: '', pdfUrl: '', lessons: [] };
        const updatedServices = form.services.map(s => {
            if (s.id === serviceId) return { ...s, osras: [...s.osras, newOsra] };
            return s;
        });
        setForm({ ...form, services: updatedServices });
    };

    const handleUpdateOsra = (serviceId, osraId, field, value) => {
        const updatedServices = form.services.map(s => {
            if (s.id === serviceId) {
                const updatedOsras = s.osras.map(o => o.id === osraId ? { ...o, [field]: value } : o);
                return { ...s, osras: updatedOsras };
            }
            return s;
        });
        setForm({ ...form, services: updatedServices });
    };

    const handleDeleteOsra = (serviceId, osraId) => {
        if (window.confirm("⚠️ متأكد إنك عايز تمسح الأسرة دي؟ كل الخدام اللي فيها هيتطردوا فوراً!")) {
            let osraNameToDelete = "";
            const updatedServices = form.services.map(s => {
                if (s.id === serviceId) {
                    const osraToDelete = s.osras.find(o => o.id === osraId);
                    if (osraToDelete) osraNameToDelete = osraToDelete.name;
                    return { ...s, osras: s.osras.filter(o => o.id !== osraId) };
                }
                return s;
            });
            const updatedServants = form.servants.filter(servant => servant.assignedOsra !== osraNameToDelete);
            setForm({ ...form, services: updatedServices, servants: updatedServants });
        }
    };

    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const handleImageUpload = async (e, type, sId, oId = null) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!navigator.onLine) return alert("لازم نت عشان ترفع الصورة!");

        setIsUploadingImage(true);
        try {
            const url = await uploadImageToCloudinary(file, 'auto');
            if (type === 'service') handleUpdateService(sId, 'logo', url);
            if (type === 'osra') handleUpdateOsra(sId, oId, 'logo', url);
        } catch (err) {
            console.error(err);
            alert("❌ مشكلة في رفع الصورة: " + err.message);
        } finally {
            setIsUploadingImage(false);
        }
    };

    const openCurriculumManager = (sId, oId, osraName) => {
        setCurriculumModal({ isOpen: true, sId, oId, osraName });
    };

    const handlePdfUploadManual = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!navigator.onLine) return alert("لازم نت عشان ترفع المذكرة للسحابة!");

        setIsUploadingPdf(true);
        try {
            const secure_url = await uploadImageToCloudinary(file, 'raw');
            const data = { secure_url };
            if (data.secure_url) {
                const updatedServices = form.services.map(s => {
                    if (s.id === curriculumModal.sId) {
                        const updatedOsras = s.osras.map(o => o.id === curriculumModal.oId ? { ...o, pdfUrl: data.secure_url, curriculumName: file.name } : o);
                        return { ...s, osras: updatedOsras };
                    }
                    return s;
                });
                setForm({ ...form, services: updatedServices });
                alert("✅ تم رفع المذكرة بنجاح للأسرة دي!");
            } else throw new Error("فشل الرفع");
        } catch (err) { alert("❌ مشكلة في الرفع: " + err.message); }
        finally { setIsUploadingPdf(false); }
    };



    const handleAddServant = () => {
        if (!newServant.name || !newServant.phone || !newServant.assignedOsra || !newServant.syncKey) return alert("البيانات ناقصة يا هندسة!");
        const newServantObj = { 
            id: Date.now(),
            name: newServant.name || "",
            role: newServant.role || "خادم",
            email: newServant.email || "",
            phone: newServant.phone || "",
            assignedOsra: newServant.assignedOsra || "",
            syncKey: newServant.syncKey || "",
            password: newServant.password || ""
        };
        const cleanServantObj = JSON.parse(JSON.stringify(newServantObj));
        const updatedServants = [...(form.servants || []), cleanServantObj];
        setForm({ ...form, servants: updatedServants });
        setNewServant({ name: '', role: 'خادم', email: '', phone: '', assignedOsra: '', syncKey: '', password: '' });
    };

    const handleRemoveServant = (id) => {
        if (window.confirm("⚠️ متأكد إنك عايز تحظر الخادم ده وتمسحه من النظام؟ بمجرد الحفظ هيتم طرده!")) {
            const updatedServants = form.servants.filter(s => s.id !== id);
            setForm({ ...form, servants: updatedServants });
        }
    };

    const getActiveOsraData = () => {
        let activePdf = "";
        let activeLessons = [];
        let activeName = "";
        if (curriculumModal.isOpen) {
            form.services.forEach(s => {
                if (s.id === curriculumModal.sId) {
                    const o = s.osras.find(x => x.id === curriculumModal.oId);
                    if (o) {
                        activePdf = o.pdfUrl || "";
                        activeLessons = o.lessons || [];
                        activeName = o.curriculumName || "";
                    }
                }
            });
        }
        return { activePdf, activeLessons, activeName };
    };

    const { activePdf, activeLessons, activeName } = getActiveOsraData();

    const handleApproveRequest = async (request) => {
        if (!navigator.onLine) return alert("لازم نت عشان توافق على طلبات الانضمام!");
        try {
            let targetSyncKey = "";
            form.services?.forEach(srv => {
                if (srv.name === request.serviceName) {
                    const targetOsra = srv.osras.find(o => o.name === request.osraName);
                    if (targetOsra) targetSyncKey = targetOsra.syncKey;
                }
            });

            if (!targetSyncKey) {
                alert("⚠️ مشكلة: لم يتم العثور على مفتاح الكلاود لهذه الأسرة! تأكد إن الأسرة متسجلة فوق.");
                return;
            }

            const newServantObj = {
                id: Date.now(),
                name: request.name || "",
                phone: request.phone || "",
                role: "خادم",
                assignedOsra: request.osraName || "",
                syncKey: targetSyncKey || "",
                email: request.email || "",
                profileImage: request.profileImage || "",
                createdAt: new Date().toISOString()
            };
            
            // 🌟 1. إضافة الخادم لمجموعة servants في الفايربيز وإعطائه uid حقيقي
            const docRef = await addDoc(collection(firestore, "servants"), newServantObj);
            newServantObj.uid = docRef.id;

            // 🌟 2. إضافة الخادم للمجموعة القديمة (للتوافق مع الكود القديم)
            const cleanServantObj = JSON.parse(JSON.stringify(newServantObj));
            const updatedServants = [...(form.servants || []), cleanServantObj];
            setForm({ ...form, servants: updatedServants });

            await deleteDoc(doc(firestore, "JoinRequests", request.id));
            setJoinRequests(joinRequests.filter(r => r.id !== request.id));

            alert(`✅ تم قبول ${request.name} وإضافته بنجاح للأسرة وتم ربطه بفايربيز! (ماتنساش تدوس حفظ واعتماد)`);
        } catch (error) {
            console.error("خطأ في القبول:", error);
            alert("حدث خطأ أثناء القبول.");
        }
    };

    const handleRejectRequest = async (id) => {
        if (!navigator.onLine) return alert("لازم نت عشان ترفض الطلب!");
        if (window.confirm("متأكد إنك عايز ترفض وتمسح الطلب ده؟")) {
            try {
                await deleteDoc(doc(firestore, "JoinRequests", id));
                setJoinRequests(joinRequests.filter(r => r.id !== id));
            } catch (error) {
                console.error("خطأ في الرفض:", error);
            }
        }
    };

    const sendWhatsappMessage = (servantName, servantPhone, osraName, syncKey) => {
        let cleanPhone = String(servantPhone).trim().replace(/\s+/g, '');
        if (cleanPhone.startsWith("0")) cleanPhone = "2" + cleanPhone;

        const message = `نظام إدارة الخدمة المركزية\nإشعار تفعيل حساب خادم\n\nعزيزي الخادم: ${servantName}\nنود إحاطتكم علماً بأنه تم قبول انضمامكم لأسرة (${osraName}) بنجاح.\n\nفيما يلي بيانات تسجيل الدخول الخاصة بكم:\n- رقم الهاتف (المستخدم): ${servantPhone}\n- مفتاح المزامنة (Cloud Key): ${syncKey}\n\nتعليمات هامة:\n1. يرجى تحميل تطبيق الأندرويد واستخدام البيانات المذكورة أعلاه للدخول.\n2. مفتاح المزامنة خاص بأسرتكم فقط، يرجى الحفاظ على سريته لضمان أمن البيانات.\n\nمع تحيات،\nإدارة أنظمة الخدمة`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    if (!isAdminAuth) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
                <div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl border border-slate-700 max-w-sm w-full text-center relative overflow-hidden">
                    <ShieldAlert className="text-red-500 mx-auto mb-4 w-16 h-16" strokeWidth={1.5} />
                    <h2 className="text-2xl font-black text-white mb-2">منطقة محظورة</h2>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        if (adminPasswordInput === appSettings.adminPass) {
                            setIsAdminAuth(true);
                            setTemporarySuperAdmin(true);
                        } else alert("كلمة المرور خاطئة ❌");
                    }} className="space-y-4">
                        <div className="relative">
                            <Key className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-900 border border-slate-600 text-white text-center font-black outline-none" autoFocus />
                        </div>
                        <button type="submit" className="w-full bg-red-600 text-white py-3 rounded-xl font-black shadow-lg">دخول آمن كمسئول</button>
                        <button type="button" onClick={() => navigate(-1)} className="w-full bg-slate-700 text-slate-300 py-3 rounded-xl font-bold shadow-lg hover:bg-slate-600">رجوع للخدمة</button>
                    </form>
                </div>
            </div>
        );
    }

    const allOsrasNames = form.services?.flatMap(s => s.osras.map(o => o.name)) || [];

    return (
        <div className="min-h-screen bg-slate-100 font-sans pb-20" dir="rtl">
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem]">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} aria-label="الرجوع للخلف" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                            <ArrowRight size={20} />
                        </button>
                        <div>
                            <h1 className="text-lg font-black text-red-400 flex items-center gap-2"><ShieldAlert size={20} /> معمل الإدارة المركزية</h1>
                            <p className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                {isOnline ? <span className="text-green-400 flex items-center gap-1">أونلاين</span> : <><WifiOff size={12} className="text-red-400" /> أوفلاين</>}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-6xl mx-auto mt-4 space-y-6 animate-in slide-in-from-bottom-8">

                {/* 🌟 قسم طلبات الانضمام */}
                {isOnline && (
                    <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="text-amber-600" size={24} />
                            <h3 className="text-xl font-black text-amber-900">طلبات الانضمام المعلقة</h3>
                            {joinRequests.length > 0 && (
                                <span className="bg-amber-500 text-white text-xs font-black px-2 py-1 rounded-full">{joinRequests.length}</span>
                            )}
                        </div>

                        {isLoadingRequests ? (
                            <div className="flex items-center justify-center py-4 gap-2 text-amber-600">
                                <Loader2 className="animate-spin" size={20} /> <span className="text-sm font-bold">جاري تحميل الطلبات...</span>
                            </div>
                        ) : joinRequests.length === 0 ? (
                            <div className="text-center text-amber-600/60 font-bold text-sm py-4 border-2 border-dashed border-amber-200 rounded-2xl">
                                لا يوجد طلبات انضمام جديدة حالياً.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {joinRequests.map(request => (
                                    <div key={request.id} className="bg-white p-4 rounded-2xl border border-amber-100 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                                        <div className="flex items-center gap-4 flex-1">
                                            {request.profileImage ? (
                                                <img src={request.profileImage} alt={request.name} className="w-14 h-14 rounded-full object-cover border border-amber-200" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                    <User size={24} />
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-black text-slate-800 text-sm">{request.name}</p>
                                                <p className="text-xs font-bold text-slate-500 mt-1">تليفون: <span className="text-slate-800">{request.phone}</span></p>
                                                <p className="text-[11px] font-bold text-amber-700 mt-1 bg-amber-50 inline-block px-2 py-1 rounded-md">
                                                    يريد الانضمام لـ: {request.serviceName} / {request.osraName}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <button onClick={() => handleApproveRequest(request)} className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all">
                                                <CheckCircle size={16} /> قبول وإضافة
                                            </button>
                                            <button onClick={() => handleRejectRequest(request.id)} className="flex-1 md:flex-none bg-red-100 hover:bg-red-500 hover:text-white text-red-600 px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all">
                                                <XCircle size={16} /> رفض
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-6">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
                        <div className="flex justify-between items-center border-b pb-4 mb-6">
                            <h3 className="font-black text-slate-800 text-xl flex items-center gap-2">
                                <Layers size={24} className="text-indigo-600" /> الهيكل التنظيمي للخدمة
                            </h3>
                            {isSuperAdmin && (
                                <button type="button" onClick={handleAddService} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-md">
                                    <PlusCircle size={18} /> إضافة خدمة
                                </button>
                            )}
                        </div>

                        <div className="space-y-8">
                            {visibleServices?.length === 0 && <p className="text-center text-slate-400 font-bold py-8">لا يوجد خدمات مخصصة لك لعرضها.</p>}

                            {visibleServices?.map((service) => (
                                <div key={service.id} className="bg-slate-50 border border-slate-200 rounded-3xl p-5 relative shadow-sm">
                                    {isSuperAdmin && (
                                        <button type="button" onClick={() => handleDeleteService(service.id)} aria-label="حذف الخدمة" className="absolute top-4 left-4 text-red-400 hover:text-red-600 bg-white p-2 rounded-full shadow-sm"><Trash2 size={16} /></button>
                                    )}

                                    <div className="flex flex-col md:flex-row gap-4 mb-6 pr-4">
                                        <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 relative group cursor-pointer">
                                            {service.logo ? <img src={service.logo} className="w-full h-full object-cover" /> : <Church className="text-slate-400" size={28} />}
                                            {isSuperAdmin && (
                                                <>
                                                    <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white text-[10px] font-bold text-center">تغيير</div>
                                                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'service', service.id)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                                </>
                                            )}
                                            {isUploadingImage && (
                                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                    <Loader2 size={20} className="animate-spin text-indigo-500" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 ml-1">اسم الخدمة</label>
                                                <input type="text" value={service.name} readOnly={!isSuperAdmin} onChange={e => handleUpdateService(service.id, 'name', e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-lg focus:ring-2 focus:ring-indigo-400" required />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 ml-1">الأب الكاهن</label>
                                                <input type="text" value={service.priest} readOnly={!isSuperAdmin} onChange={e => handleUpdateService(service.id, 'priest', e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-black text-indigo-900 flex items-center gap-2"><Users size={18} /> الأسر</h3>
                                            {(isSuperAdmin || isPriest) && (
                                                <button type="button" onClick={() => handleAddOsra(service.id)} className="text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 hover:bg-indigo-100">
                                                    <PlusCircle size={14} /> أسرة جديدة
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {service.osras.filter(o => isSuperAdmin || isPriest || o.syncKey === currentSyncKey).map((osra) => (
                                                <div key={osra.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 relative group">
                                                    {(isSuperAdmin || isPriest) && (
                                                        <button type="button" onClick={() => handleDeleteOsra(service.id, osra.id)} aria-label="حذف الأسرة" className="absolute top-2 left-2 text-red-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                                                    )}

                                                    <div className="flex items-start gap-3 mb-3">
                                                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 relative cursor-pointer">
                                                            {osra.logo ? <img src={osra.logo} width="48" height="48" loading="lazy" className="w-full h-full object-cover" alt="لوجو الأسرة" /> : <ImagePlus className="text-slate-400" size={16} />}
                                                            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'osra', service.id, osra.id)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                                            {isUploadingImage && (
                                                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                                                    <Loader2 size={16} className="animate-spin text-indigo-500" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <input type="text" value={osra.name} onChange={e => handleUpdateOsra(service.id, osra.id, 'name', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg font-black text-sm mb-1" placeholder="اسم الأسرة" />
                                                            <input type="text" placeholder="أمين الأسرة..." value={osra.amin} onChange={e => handleUpdateOsra(service.id, osra.id, 'amin', e.target.value)} className="w-full p-1.5 bg-transparent border-b border-slate-200 text-xs font-bold" />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500">مفتاح الكلاود</label>
                                                            <input type="text" value={osra.syncKey} readOnly={!isSuperAdmin && !isPriest} onChange={e => handleUpdateOsra(service.id, osra.id, 'syncKey', e.target.value)} className="w-full p-2 bg-indigo-50 border border-indigo-100 rounded-lg font-black text-xs text-indigo-700 text-center" dir="ltr" required />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500">منهج الأسرة (PDF)</label>
                                                            <button type="button" onClick={() => openCurriculumManager(service.id, osra.id, osra.name)} className="w-full p-2 bg-emerald-50 border border-emerald-200 rounded-lg font-black text-xs text-emerald-700 flex items-center justify-center gap-1 hover:bg-emerald-100 transition-colors">
                                                                <BookOpen size={14} /> {osra.curriculumName || 'إدارة المنهج'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {isSuperAdmin && (
                        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 space-y-4">
                            <h3 className="font-black text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><Lock size={18} /> إعدادات الحماية (للمطور فقط)</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-red-600 ml-1">باسوورد مطور النظام</label>
                                    <input type="text" value={form.adminPass} onChange={e => setForm({ ...form, adminPass: e.target.value })} className="w-full p-3 bg-red-50 border border-red-200 rounded-xl font-black text-center text-red-800" required />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-600 ml-1">كلمة سر مسح الداتا</label>
                                    <input type="text" value={form.deletePass} onChange={e => setForm({ ...form, deletePass: e.target.value })} className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-black text-center" required />
                                </div>
                            </div>
                        </div>
                    )}

                    <button type="submit" disabled={isSavingToCloud} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black hover:bg-black transition-all shadow-lg flex justify-center items-center gap-2 text-lg">
                        {isSavingToCloud ? <Loader2 className="animate-spin" size={24} /> : <Save size={24} />}
                        {isSavingToCloud ? "جاري الرفع للسحابة..." : (isOnline ? "حفظ واعتماد الهيكل (أونلاين) ☁️" : "حفظ التعديلات (أوفلاين) 📶❌")}
                    </button>
                </form>

                {isSuperAdmin && (
                    <div className="bg-indigo-50 p-6 rounded-[2.5rem] border border-indigo-100 mt-8">
                        <div className="flex items-center gap-2 mb-6">
                            <UserCircle className="text-indigo-600" size={28} />
                            <div>
                                <h3 className="text-xl font-black text-indigo-900">إدارة الخدام والصلاحيات</h3>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-indigo-50 mb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                                <select value={newServant.role} onChange={e => {
                                    const selectedRole = e.target.value;
                                    if (selectedRole === 'كاهن' || selectedRole === 'أدمن مساعد') {
                                        setNewServant({ ...newServant, role: selectedRole, assignedOsra: 'كل الأسر (صلاحية كاملة)', syncKey: 'MASTER_ACCESS' });
                                    } else {
                                        setNewServant({ ...newServant, role: selectedRole, assignedOsra: '', syncKey: '' });
                                    }
                                }} className="p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm">
                                    <option value="خادم">خادم عادي</option>
                                    <option value="تاسوني">تاسوني</option>
                                    <option value="أمين أسرة">أمين أسرة</option>
                                    <option value="كاهن">أب كاهن</option>
                                    <option value="أدمن مساعد">أدمن مساعد</option>
                                </select>

                                <input type="text" placeholder="اسم الخادم..." value={newServant.name} onChange={e => setNewServant({ ...newServant, name: e.target.value })} className="p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm" />
                                <input type="tel" placeholder="رقم التليفون (للدخول)..." value={newServant.phone} onChange={e => setNewServant({ ...newServant, phone: e.target.value })} className="p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm text-left" dir="ltr" />

                                <select value={newServant.assignedOsra} disabled={newServant.role === 'كاهن' || newServant.role === 'أدمن مساعد'} onChange={e => {
                                    const selectedOsraName = e.target.value;
                                    let matchedSyncKey = '';
                                    form.services?.forEach(service => {
                                        const foundOsra = service.osras.find(o => o.name === selectedOsraName);
                                        if (foundOsra) matchedSyncKey = foundOsra.syncKey;
                                    });
                                    setNewServant({ ...newServant, assignedOsra: selectedOsraName, syncKey: matchedSyncKey });
                                }} className={`p-3 rounded-xl border font-bold text-sm ${newServant.role === 'كاهن' || newServant.role === 'أدمن مساعد' ? 'bg-amber-50 border-amber-200 text-amber-700 cursor-not-allowed' : 'border-indigo-200 bg-indigo-50/50 text-indigo-800'}`}>
                                    {newServant.role === 'كاهن' || newServant.role === 'أدمن مساعد' ? (
                                        <option value="كل الأسر (صلاحية كاملة)">كل الأسر (صلاحية كاملة)</option>
                                    ) : (
                                        <>
                                            <option value="">اختر الأسرة...</option>
                                            {allOsrasNames.map((name, i) => <option key={i} value={name}>{name}</option>)}
                                        </>
                                    )}
                                </select>

                                <input type="text" placeholder="مفتاح الكلاود..." value={newServant.syncKey} readOnly className={`p-3 rounded-xl border font-black text-sm text-left cursor-not-allowed ${newServant.syncKey === 'MASTER_ACCESS' ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-inner' : 'bg-slate-100 border-slate-200 text-slate-500'}`} dir="ltr" />
                            </div>
                            <button type="button" onClick={handleAddServant} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black shadow-md hover:bg-indigo-700 flex justify-center items-center gap-2">
                                <UserPlus size={18} /> إضافة الخادم يدوياً
                            </button>
                        </div>

                        <div className="space-y-3">
                            {form.servants?.map(s => (
                                <div key={s.id} className="flex flex-col md:flex-row items-center justify-between p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm gap-4">
                                    <div className="flex flex-col w-full md:w-1/4">
                                        <span className="font-black text-sm text-slate-800 flex items-center gap-1"><Users size={14} className="text-indigo-500" /> {s.role} / {s.name}</span>
                                        <span className="text-xs text-slate-400 font-bold ml-5">{s.phone}</span>
                                    </div>
                                    <div className="flex flex-col w-full md:w-1/4 bg-slate-50 p-2 rounded-xl text-center">
                                        <span className="text-[10px] font-bold text-slate-500">الأسرة: <span className="text-indigo-700">{s.assignedOsra}</span></span>
                                    </div>

                                    <div className="flex w-full md:w-auto gap-2">
                                        <button type="button" onClick={() => sendWhatsappMessage(s.name, s.phone, s.assignedOsra, s.syncKey)} className="flex-1 md:flex-none bg-[#25D366] text-white px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 hover:bg-[#20b858] transition-all shadow-sm">
                                            <MessageCircle size={14} /> إرسال البيانات
                                        </button>
                                        <button type="button" onClick={() => handleRemoveServant(s.id)} className="flex-1 md:flex-none bg-red-50 text-red-500 px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 hover:bg-red-100 transition-all">
                                            <Trash2 size={14} /> مسح وحظر
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {curriculumModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
                            <h2 className="text-lg font-black text-emerald-900 flex items-center gap-2"><BookOpen size={20} /> إدارة منهج ({curriculumModal.osraName})</h2>
                            <button onClick={() => setCurriculumModal({ isOpen: false, sId: null, oId: null })} aria-label="إغلاق" className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="border border-slate-200 p-5 rounded-2xl space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">1. ارفع ملف المذكرة (PDF/Doc):</label>
                                    <input type="file" accept=".pdf,.doc,.docx" onChange={handlePdfUploadManual} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200 cursor-pointer mb-2" />
                                    {isUploadingPdf && <p className="text-blue-500 text-xs font-bold animate-pulse flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> جاري الرفع للسحابة...</p>}
                                </div>
                                <div className="border-t border-slate-100 pt-4">
                                    <label className="block text-sm font-bold text-slate-700 mb-2">أو ضع رابط المذكرة المباشر (PDF Link):</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="url" 
                                            placeholder="https://example.com/file.pdf" 
                                            defaultValue={activePdf}
                                            onBlur={(e) => {
                                                const url = e.target.value;
                                                if (url) {
                                                    const updatedServices = form.services.map(s => {
                                                        if (s.id === curriculumModal.sId) {
                                                            const updatedOsras = s.osras.map(o => o.id === curriculumModal.oId ? { ...o, pdfUrl: url, curriculumName: 'مذكرة مضافة برابط' } : o);
                                                            return { ...s, osras: updatedOsras };
                                                        }
                                                        return s;
                                                    });
                                                    setForm({ ...form, services: updatedServices });
                                                }
                                            }}
                                            className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-left"
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                                {activePdf && !isUploadingPdf && <p className="text-green-600 text-xs font-bold bg-green-50 p-2 rounded-lg break-all">✅ المذكرة جاهزة باللينك: <br /><span className="text-[9px] text-slate-500">{activePdf}</span></p>}
                            </div>


                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}