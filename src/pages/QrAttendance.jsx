/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useQrScanner from '../hooks/useQrScanner';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';
import {
    Camera, CameraOff, Trash2, ArrowRight, Volume2, VolumeX,
    RotateCcw, ScanLine, CheckCircle2, XCircle, X,
    Church, BookOpen, Calendar, ChevronLeft, Save,
    Users, QrCode, ClipboardList, Sparkles, PartyPopper, Loader2
} from 'lucide-react';

// ─────────────────────────────────────────────
// 📋 Stage Constants
// ─────────────────────────────────────────────
const STAGE = {
    CONFIG: 'config',
    SCANNING: 'scanning',
    REVIEW: 'review',
};

const EVENT_TYPES = [
    { id: 'liturgy', label: 'القداس', icon: Church, color: 'from-blue-600 to-indigo-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', emoji: '⛪' },
    { id: 'service', label: 'الخدمة', icon: BookOpen, color: 'from-emerald-600 to-teal-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', emoji: '📖' },
];

// ─────────────────────────────────────────────
// 📸 Production QR Attendance Component
// ─────────────────────────────────────────────
export default function QrAttendance() {
    const navigate = useNavigate();
    const { triggerAutoSync } = useAutoSync();

    // ─── Session Config State ───
    const [stage, setStage] = useState(STAGE.CONFIG);
    const [eventType, setEventType] = useState(null); // 'liturgy' | 'service'
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

    // ─── Save State ───
    const [isSaving, setIsSaving] = useState(false);
    const [saveResult, setSaveResult] = useState(null); // { success: bool, count: number, message: string } | null

    // ─── QR Scanner Hook ───
    const scanner = useQrScanner();

    // ─── Derived ───
    const activeEventConfig = useMemo(() => EVENT_TYPES.find(e => e.id === eventType), [eventType]);
    const canProceed = eventType && selectedDate;

    // ─── Stage transitions ───
    const goToScanning = () => {
        if (!canProceed) return;
        setStage(STAGE.SCANNING);
    };

    const goToReview = async () => {
        await scanner.stopCamera();
        setStage(STAGE.REVIEW);
    };

    const goBackToScanning = () => {
        setStage(STAGE.SCANNING);
    };

    const goBackToConfig = async () => {
        await scanner.stopCamera();
        scanner.clearAll();
        setStage(STAGE.CONFIG);
    };

    const handleSaveAttendance = useCallback(async () => {
        if (isSaving || scanner.scannedCount === 0) return;
        setIsSaving(true);

        try {
            const currentSyncKey = localStorage.getItem('currentSyncKey');
            const now = new Date().toISOString();
            const type = eventType; // 'liturgy' | 'service'
            const date = selectedDate;
            const childIds = scanner.scannedList.map(item => item.childId);

            // ─── Fetch existing attendance for this date to prevent duplicates ───
            const existingRecords = await db.attendance
                .where('date').equals(date)
                .toArray();
            const existingActive = existingRecords.filter(r => !r.isDeleted);
            const alreadyRecordedSet = new Set(
                existingActive
                    .filter(r => r.type === type)
                    .map(r => r.childId)
            );

            // Filter out children already recorded for this date+type
            const newChildIds = childIds.filter(id => !alreadyRecordedSet.has(id));

            if (newChildIds.length === 0) {
                setSaveResult({
                    success: false,
                    count: 0,
                    message: 'كل الأبطال دول مسجلين حضور بالفعل لليوم ده! مفيش سجلات جديدة.',
                });
                setIsSaving(false);
                return;
            }

            // ─── Atomic Transaction: Insert Attendance + Update Children ───
            await db.transaction('rw', db.attendance, db.children, async () => {
                for (const childId of newChildIds) {
                    // 1. Insert attendance record
                    await db.attendance.add({
                        date,
                        childId,
                        type,
                        syncKey: currentSyncKey,
                        isDirty: true,
                        updatedAt: now,
                        isDeleted: false,
                    });

                    // 2. Update child record (streak + last_liturgy/last_service)
                    const child = await db.children.get(childId);
                    if (child && !child.isDeleted) {
                        const field = type === 'liturgy' ? 'last_liturgy' : 'last_service';
                        const updates = {
                            isDirty: true,
                            updatedAt: now,
                        };

                        // Update last attendance date if this is newer or not set
                        if (!child[field] || date >= child[field]) {
                            updates[field] = date;
                        }

                        // Increment streak only if this is the child's first active attendance for this date
                        const childExistingForDate = existingActive.filter(r => r.childId === childId);
                        if (childExistingForDate.length === 0) {
                            updates.streak = (child.streak || 0) + 1;
                        }

                        await db.children.update(childId, updates);
                    }
                }
            });

            // ─── Post-Save: trigger sync + show success ───
            triggerAutoSync();

            const skipped = childIds.length - newChildIds.length;
            let message = `✅ تم تسجيل حضور ${newChildIds.length} مخدوم بنجاح!`;
            if (skipped > 0) {
                message += `\n⚠️ تم تخطي ${skipped} مخدوم (مسجلين بالفعل).`;
            }

            console.log('💾 [QrAttendance] Saved:', {
                date, type, saved: newChildIds.length, skipped, syncKey: currentSyncKey,
            });

            setSaveResult({
                success: true,
                count: newChildIds.length,
                message,
            });

        } catch (err) {
            console.error('❌ [QrAttendance] Save error:', err);
            setSaveResult({
                success: false,
                count: 0,
                message: `❌ حصل خطأ أثناء الحفظ: ${err.message}`,
            });
        } finally {
            setIsSaving(false);
        }
    }, [isSaving, scanner.scannedList, scanner.scannedCount, eventType, selectedDate, triggerAutoSync]);

    // ─── Dismiss save result and reset session ───
    const handleDismissSaveResult = useCallback(() => {
        const wasSuccess = saveResult?.success;
        setSaveResult(null);
        if (wasSuccess) {
            scanner.clearAll();
            setEventType(null);
            setSelectedDate(new Date().toISOString().split('T')[0]);
            setStage(STAGE.CONFIG);
        }
    }, [saveResult, scanner]);

    const handleExit = async () => {
        await scanner.stopCamera();
        navigate(-1);
    };

    // ─── Header title by stage ───
    const stageTitle = {
        [STAGE.CONFIG]: 'تسجيل حضور QR',
        [STAGE.SCANNING]: activeEventConfig ? `مسح — ${activeEventConfig.label}` : 'المسح',
        [STAGE.REVIEW]: 'مراجعة الحضور',
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans" dir="rtl">

            {/* ─── Header ─── */}
            <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 py-3">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <button
                        onClick={stage === STAGE.CONFIG ? handleExit : stage === STAGE.SCANNING ? goBackToConfig : goBackToScanning}
                        className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors active:scale-90"
                        aria-label="رجوع"
                    >
                        <ArrowRight size={20} />
                    </button>
                    <h1 className="text-sm font-black flex items-center gap-2">
                        <QrCode size={18} className="text-indigo-400" />
                        {stageTitle[stage]}
                    </h1>
                    {stage === STAGE.SCANNING ? (
                        <button
                            onClick={() => scanner.setIsMuted(m => !m)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${scanner.isMuted ? 'bg-red-900/60 text-red-400' : 'bg-slate-800 text-green-400 hover:bg-slate-700'}`}
                            aria-label={scanner.isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
                        >
                            {scanner.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                    ) : (
                        <div className="w-10" /> // spacer
                    )}
                </div>
            </header>

            <main className="max-w-lg mx-auto px-4 pb-32">

                {/* ═══════════════════════════════════════════ */}
                {/* STAGE 1: SESSION CONFIG                     */}
                {/* ═══════════════════════════════════════════ */}
                {stage === STAGE.CONFIG && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

                        {/* Hero */}
                        <div className="mt-8 text-center">
                            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-indigo-500/25 relative">
                                <div className="absolute inset-0 rounded-3xl bg-indigo-500/30 animate-pulse" />
                                <QrCode size={36} className="relative z-10" />
                            </div>
                            <h2 className="text-xl font-black text-white mb-2">تسجيل الحضور بـ QR</h2>
                            <p className="text-sm text-slate-400 font-bold leading-relaxed max-w-xs mx-auto">
                                اختار نوع الحدث والتاريخ عشان تبدأ مسح بطاقات الأبطال
                            </p>
                        </div>

                        {/* Event Type Picker */}
                        <div className="mt-8">
                            <label className="text-xs font-black text-slate-400 mb-3 flex items-center gap-2 px-1">
                                <Sparkles size={14} className="text-amber-400" />
                                نوع الحدث
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {EVENT_TYPES.map(evt => {
                                    const Icon = evt.icon;
                                    const isSelected = eventType === evt.id;
                                    return (
                                        <button
                                            key={evt.id}
                                            onClick={() => setEventType(evt.id)}
                                            className={`relative overflow-hidden rounded-2xl p-5 border-2 transition-all duration-200 active:scale-95 ${
                                                isSelected
                                                    ? `bg-gradient-to-br ${evt.color} border-transparent shadow-xl shadow-${evt.id === 'liturgy' ? 'blue' : 'emerald'}-500/25 scale-[1.02]`
                                                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                                            }`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl ${isSelected ? 'bg-white/20' : evt.bg} flex items-center justify-center mb-3 mx-auto`}>
                                                <Icon size={24} className={isSelected ? 'text-white' : evt.text} />
                                            </div>
                                            <p className={`text-sm font-black ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                {evt.emoji} {evt.label}
                                            </p>
                                            {isSelected && (
                                                <div className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                                                    <CheckCircle2 size={16} className="text-white" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Date Picker */}
                        <div className="mt-6">
                            <label className="text-xs font-black text-slate-400 mb-3 flex items-center gap-2 px-1">
                                <Calendar size={14} className="text-sky-400" />
                                تاريخ الحضور
                            </label>
                            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-1">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full bg-transparent text-white font-bold py-3.5 px-4 rounded-xl outline-none text-sm [color-scheme:dark]"
                                />
                            </div>
                        </div>

                        {/* Proceed Button */}
                        <button
                            onClick={goToScanning}
                            disabled={!canProceed}
                            className={`mt-8 w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${
                                canProceed
                                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.01]'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                            }`}
                        >
                            <Camera size={22} />
                            فتح الماسح
                            <ChevronLeft size={18} />
                        </button>

                        {/* Session Summary Preview */}
                        {canProceed && (
                            <div className="mt-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 flex items-center gap-3 animate-in fade-in duration-300">
                                <div className={`w-10 h-10 rounded-xl ${activeEventConfig.bg} flex items-center justify-center`}>
                                    {React.createElement(activeEventConfig.icon, { size: 20, className: activeEventConfig.text })}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-300">{activeEventConfig.label} — {selectedDate}</p>
                                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">هيتم تسجيل الحضور بالتاريخ والنوع ده</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════ */}
                {/* STAGE 2: ACTIVE SCANNING                    */}
                {/* ═══════════════════════════════════════════ */}
                {stage === STAGE.SCANNING && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

                        {/* Session Indicator Pill */}
                        <div className="mt-4 flex items-center justify-center">
                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${activeEventConfig.bg} border ${activeEventConfig.border}`}>
                                {React.createElement(activeEventConfig.icon, { size: 14, className: activeEventConfig.text })}
                                <span className={`text-xs font-black ${activeEventConfig.text}`}>
                                    {activeEventConfig.label} — {selectedDate}
                                </span>
                            </div>
                        </div>

                        {/* Camera Viewport */}
                        <section className="mt-4 relative">
                            <div className="relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-700 shadow-2xl">
                                <div
                                    id={scanner.containerId}
                                    className="w-full"
                                    style={{ minHeight: scanner.isActive ? '320px' : '0px', transition: 'min-height 0.3s' }}
                                />

                                {/* Flash Overlay */}
                                {scanner.flashColor && (
                                    <div
                                        className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-300 rounded-3xl ${
                                            scanner.flashColor === 'green' ? 'bg-emerald-500/30' :
                                            scanner.flashColor === 'amber' ? 'bg-amber-500/30' :
                                            'bg-red-500/30'
                                        }`}
                                    />
                                )}

                                {/* Idle State (Camera Off) */}
                                {!scanner.isActive && !scanner.cameraError && (
                                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                                        <div className="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6 relative">
                                            <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                                            <Camera size={40} className="text-indigo-400 relative z-10" />
                                        </div>
                                        <h2 className="text-xl font-black text-white mb-2">جاهز للمسح</h2>
                                        <p className="text-sm text-slate-400 font-bold leading-relaxed mb-8">
                                            اضغط عشان تفتح الكاميرا وتبدأ تمسح بطاقات الأبطال
                                        </p>
                                        <button
                                            onClick={scanner.startCamera}
                                            disabled={scanner.isStarting}
                                            className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-8 py-4 rounded-2xl font-black text-base shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {scanner.isStarting ? (
                                                <>
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    جاري فتح الكاميرا...
                                                </>
                                            ) : (
                                                <>
                                                    <Camera size={22} />
                                                    فتح الكاميرا 📸
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Error State */}
                                {scanner.cameraError && (
                                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
                                            <XCircle size={36} className="text-red-400" />
                                        </div>
                                        <p className="text-sm font-bold text-red-300 leading-relaxed mb-6">{scanner.cameraError}</p>
                                        <button
                                            onClick={() => { scanner.setCameraError(null); scanner.startCamera(); }}
                                            className="bg-red-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2"
                                        >
                                            <RotateCcw size={16} />
                                            حاول تاني
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Camera Active Controls */}
                            {scanner.isActive && (
                                <div className="mt-4 flex gap-3">
                                    <button
                                        onClick={scanner.stopCamera}
                                        className="flex-1 bg-red-600/90 hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-lg shadow-red-500/20"
                                    >
                                        <CameraOff size={18} />
                                        إيقاف
                                    </button>
                                    <button
                                        onClick={goToReview}
                                        disabled={scanner.scannedCount === 0}
                                        className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${
                                            scanner.scannedCount > 0
                                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20'
                                                : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                                        }`}
                                    >
                                        <ClipboardList size={18} />
                                        مراجعة
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Toast Notification */}
                        {scanner.toastMessage && (
                            <div
                                className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-black text-sm shadow-2xl backdrop-blur-xl border transition-all animate-in slide-in-from-top-4 fade-in duration-200 max-w-[90vw] ${
                                    scanner.toastMessage.type === 'success' ? 'bg-emerald-600/90 text-white border-emerald-500/50' :
                                    scanner.toastMessage.type === 'warning' ? 'bg-amber-600/90 text-white border-amber-500/50' :
                                    'bg-red-600/90 text-white border-red-500/50'
                                }`}
                            >
                                {scanner.toastMessage.message}
                            </div>
                        )}

                        {/* ─── Running Summary Banner (Fixed at Bottom) ─── */}
                        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 px-4 py-4 safe-area-pb">
                            <div className="max-w-lg mx-auto flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20">
                                        <Users size={20} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">
                                            ✅ {scanner.scannedCount} تم مسحهم
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-bold">
                                            {activeEventConfig.label} — {selectedDate}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={goToReview}
                                    disabled={scanner.scannedCount === 0}
                                    className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 ${
                                        scanner.scannedCount > 0
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    }`}
                                >
                                    <ClipboardList size={14} />
                                    مراجعة
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════ */}
                {/* STAGE 3: REVIEW                             */}
                {/* ═══════════════════════════════════════════ */}
                {stage === STAGE.REVIEW && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

                        {/* Review Header Card */}
                        <div className="mt-6 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-5 shadow-xl">
                            <div className="flex items-center gap-4 mb-4">
                                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${activeEventConfig.color} flex items-center justify-center shadow-lg`}>
                                    {React.createElement(activeEventConfig.icon, { size: 26, className: 'text-white' })}
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white">{activeEventConfig.label}</h2>
                                    <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
                                        <Calendar size={12} />
                                        {selectedDate}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
                                    <p className="text-2xl font-black text-emerald-400">{scanner.scannedCount}</p>
                                    <p className="text-[10px] font-black text-emerald-400/60 mt-0.5">بطل تم مسحهم</p>
                                </div>
                                <div className="flex-1 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
                                    <p className="text-2xl font-black text-blue-400">
                                        {scanner.scannedList.filter(s => s.gender === 'بنت').length}
                                    </p>
                                    <p className="text-[10px] font-black text-blue-400/60 mt-0.5">بنات 👧</p>
                                </div>
                                <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-3 text-center">
                                    <p className="text-2xl font-black text-indigo-400">
                                        {scanner.scannedList.filter(s => s.gender !== 'بنت').length}
                                    </p>
                                    <p className="text-[10px] font-black text-indigo-400/60 mt-0.5">ولاد 👦</p>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-4 flex gap-3">
                            <button
                                onClick={goBackToScanning}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 border border-slate-700"
                            >
                                <ScanLine size={18} />
                                رجوع للمسح
                            </button>
                            <button
                                onClick={() => scanner.clearAll()}
                                disabled={scanner.scannedCount === 0}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 border border-red-500/20"
                            >
                                <Trash2 size={16} />
                                مسح الكل
                            </button>
                        </div>

                        {/* Scanned Children List */}
                        <div className="mt-6">
                            <h3 className="text-sm font-black text-slate-400 mb-3 flex items-center gap-2 px-1">
                                <CheckCircle2 size={16} className="text-emerald-400" />
                                قائمة الأبطال المسحوبين ({scanner.scannedCount})
                            </h3>

                            {scanner.scannedCount === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <ScanLine size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-bold text-sm">مفيش أبطال تم مسحهم</p>
                                    <p className="text-xs mt-1 text-slate-600">ارجع للمسح وابدأ امسح بطاقات</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {scanner.scannedList.map((item, index) => (
                                        <div
                                            key={item.childId}
                                            className="bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between group hover:bg-slate-800 transition-colors animate-in slide-in-from-right-4 fade-in duration-300"
                                            style={{ animationDelay: `${index * 20}ms` }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center border border-indigo-500/20 text-lg">
                                                    {item.gender === 'بنت' ? '👧' : '👦'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-200">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold mt-0.5 font-mono" dir="ltr">
                                                        {item.raw}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => scanner.removeItem(item.childId)}
                                                className="w-9 h-9 rounded-full bg-red-500/10 hover:bg-red-500/25 text-red-400 flex items-center justify-center transition-all opacity-50 group-hover:opacity-100 active:scale-90"
                                                aria-label={`حذف ${item.name}`}
                                            >
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Save Button */}
                        {scanner.scannedCount > 0 && (
                            <button
                                onClick={handleSaveAttendance}
                                disabled={isSaving}
                                className={`mt-8 w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-xl transition-all ${
                                    isSaving
                                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none'
                                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.01] active:scale-95'
                                }`}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 size={22} className="animate-spin" />
                                        جاري الحفظ...
                                    </>
                                ) : (
                                    <>
                                        <Save size={22} />
                                        حفظ الحضور ({scanner.scannedCount} بطل)
                                    </>
                                )}
                            </button>
                        )}

                        {/* Spacer for safe area */}
                        <div className="h-8" />
                    </div>
                )}

            </main>

            {/* ═══════════════════════════════════════════ */}
            {/* SAVE RESULT MODAL                           */}
            {/* ═══════════════════════════════════════════ */}
            {saveResult && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                        {/* Icon */}
                        <div className="flex justify-center mb-5">
                            {saveResult.success ? (
                                <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center relative">
                                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                                    <CheckCircle2 size={40} className="text-emerald-400 relative z-10" />
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
                                    <XCircle size={40} className="text-red-400" />
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <h2 className={`text-lg font-black text-center mb-2 ${
                            saveResult.success ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                            {saveResult.success ? 'تم الحفظ بنجاح! 🎉' : 'حصلت مشكلة'}
                        </h2>

                        {/* Message */}
                        <p className="text-sm text-slate-300 font-bold text-center leading-relaxed whitespace-pre-line mb-2">
                            {saveResult.message}
                        </p>

                        {/* Count badge */}
                        {saveResult.success && saveResult.count > 0 && (
                            <div className="flex justify-center my-4">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-6 py-3 text-center">
                                    <p className="text-3xl font-black text-emerald-400">{saveResult.count}</p>
                                    <p className="text-[10px] font-black text-emerald-400/60 mt-0.5">مخدوم تم تسجيل حضورهم</p>
                                </div>
                            </div>
                        )}

                        {/* Dismiss Button */}
                        <button
                            onClick={handleDismissSaveResult}
                            className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 mt-4 ${
                                saveResult.success
                                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                                    : 'bg-slate-800 text-white border border-slate-700 hover:bg-slate-700'
                            }`}
                        >
                            {saveResult.success ? (
                                <>
                                    <QrCode size={16} />
                                    جلسة جديدة
                                </>
                            ) : (
                                <>
                                    <ArrowRight size={16} />
                                    رجوع
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
