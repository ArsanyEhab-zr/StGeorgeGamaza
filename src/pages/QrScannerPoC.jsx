/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CameraOff, Trash2, ArrowRight, Volume2, VolumeX, RotateCcw, ScanLine, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { TENANT_CONFIG } from '../config/tenantConfig';

// ─────────────────────────────────────────────
// 🎵 Web Audio API — Zero-dependency sound FX
// ─────────────────────────────────────────────
const AudioCtxRef = { ctx: null };

function getAudioCtx() {
    if (!AudioCtxRef.ctx) {
        AudioCtxRef.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return AudioCtxRef.ctx;
}

function playBeep(frequency = 1200, durationMs = 80, volume = 0.3) {
    try {
        const ctx = getAudioCtx();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + durationMs / 1000);
    } catch (_e) {
        // Audio not supported — fail silently
    }
}

// ─────────────────────────────────────────────
// 🔍 QR Code Prefix Validation
// ─────────────────────────────────────────────
const QR_PREFIX = 'KHD:';

function parseQrCode(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const trimmed = rawText.trim();
    if (trimmed.startsWith(QR_PREFIX)) {
        const id = trimmed.substring(QR_PREFIX.length);
        if (id && !isNaN(Number(id))) {
            return { childId: Number(id), raw: trimmed };
        }
    }
    return null;
}

// ─────────────────────────────────────────────
// 📸 Main PoC Component
// ─────────────────────────────────────────────
export default function QrScannerPoC() {
    const navigate = useNavigate();
    const scannerRef = useRef(null);
    const scannedIdsRef = useRef(new Set());
    const cooldownRef = useRef(new Map()); // childId → timestamp for 500ms cooldown
    const containerIdRef = useRef('qr-reader-container');

    const [isActive, setIsActive] = useState(false);
    const [scannedList, setScannedList] = useState([]); // [{ childId, raw, timestamp }]
    const [flashColor, setFlashColor] = useState(null); // 'green' | 'amber' | null
    const [toastMessage, setToastMessage] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isStarting, setIsStarting] = useState(false);

    // ─── Toast helper ───
    const showToast = useCallback((message, type = 'success') => {
        setToastMessage({ message, type });
        setTimeout(() => setToastMessage(null), 2000);
    }, []);

    // ─── Flash overlay helper ───
    const triggerFlash = useCallback((color) => {
        setFlashColor(color);
        setTimeout(() => setFlashColor(null), 300);
    }, []);

    // ─── Handle successful QR decode ───
    const handleScanSuccess = useCallback((decodedText) => {
        const parsed = parseQrCode(decodedText);

        if (!parsed) {
            // Not a valid QR code
            triggerFlash('red');
            showToast('⚠️ كود QR غير صالح — ' + TENANT_CONFIG.QR_INVALID_MESSAGE, 'error');
            if (!isMuted) playBeep(300, 150, 0.2);
            return;
        }

        const { childId } = parsed;
        const now = Date.now();

        // Cooldown check — prevent rapid re-fire of the same card within 500ms
        const lastScan = cooldownRef.current.get(childId);
        if (lastScan && now - lastScan < 500) return;
        cooldownRef.current.set(childId, now);

        // Duplicate check
        if (scannedIdsRef.current.has(childId)) {
            triggerFlash('amber');
            showToast(`⚠️ تم مسح الـ ID ${childId} بالفعل`, 'warning');
            if (!isMuted) playBeep(400, 120, 0.2);
            return;
        }

        // ✅ New successful scan
        scannedIdsRef.current.add(childId);
        setScannedList(prev => [{ childId, raw: parsed.raw, timestamp: now }, ...prev]);
        triggerFlash('green');
        showToast(`✅ تم مسح ID: ${childId}`, 'success');
        if (!isMuted) playBeep(1200, 80, 0.3);
    }, [isMuted, triggerFlash, showToast]);

    // ─── Start camera ───
    const startCamera = useCallback(async () => {
        setCameraError(null);
        setIsStarting(true);

        try {
            // Resume AudioContext (required after user gesture on mobile)
            try { getAudioCtx().resume(); } catch (_e) { /* ignore */ }

            // Dynamically import html5-qrcode (code-split)
            const { Html5Qrcode } = await import('html5-qrcode');

            if (scannerRef.current) {
                try { await scannerRef.current.stop(); } catch (_e) { /* already stopped */ }
            }

            const html5QrCode = new Html5Qrcode(containerIdRef.current);
            scannerRef.current = html5QrCode;

            const viewportWidth = Math.min(window.innerWidth - 32, 500);
            const qrboxSize = Math.floor(viewportWidth * 0.65);

            await html5QrCode.start(
                { facingMode: 'environment' },
                {
                    fps: 15,
                    qrbox: { width: qrboxSize, height: qrboxSize },
                    aspectRatio: 1.0,
                    videoConstraints: {
                        facingMode: 'environment',
                        advanced: [{ focusMode: 'continuous' }]
                    }
                },
                (decodedText) => {
                    handleScanSuccess(decodedText);
                },
                (_errorMessage) => {
                    // Scan error (not a QR in frame) — expected, don't surface
                }
            );

            setIsActive(true);
        } catch (err) {
            console.error('Camera start error:', err);
            let errorMsg = '❌ حصلت مشكلة مع الكاميرا.';

            if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
                errorMsg = '🚫 تم رفض إذن الكاميرا. من فضلك اسمح بالوصول للكاميرا من إعدادات المتصفح وحاول تاني.';
            } else if (err.name === 'NotFoundError' || err.message?.includes('Requested device not found')) {
                errorMsg = '📵 مفيش كاميرا متاحة على الجهاز ده.';
            } else if (err.name === 'NotReadableError' || err.message?.includes('Could not start')) {
                errorMsg = '📸 الكاميرا مستخدمة من تطبيق تاني. قفل التطبيقات التانية وحاول تاني.';
            }

            setCameraError(errorMsg);
        } finally {
            setIsStarting(false);
        }
    }, [handleScanSuccess]);

    // ─── Stop camera ───
    const stopCamera = useCallback(async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (_e) { /* already stopped */ }
            scannerRef.current = null;
        }
        setIsActive(false);
    }, []);

    // ─── Remove item from scanned list ───
    const removeItem = useCallback((childId) => {
        scannedIdsRef.current.delete(childId);
        cooldownRef.current.delete(childId);
        setScannedList(prev => prev.filter(item => item.childId !== childId));
    }, []);

    // ─── Clear all scanned ───
    const clearAll = useCallback(() => {
        scannedIdsRef.current.clear();
        cooldownRef.current.clear();
        setScannedList([]);
    }, []);

    // ─── Cleanup on unmount ───
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
                scannerRef.current = null;
            }
        };
    }, []);

    // ─── Pause camera when app is backgrounded ───
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && scannerRef.current) {
                scannerRef.current.stop().catch(() => {});
                scannerRef.current = null;
                setIsActive(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans" dir="rtl">

            {/* ─── Header ─── */}
            <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 py-3">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <button
                        onClick={() => { stopCamera(); navigate(-1); }}
                        className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                        aria-label="رجوع"
                    >
                        <ArrowRight size={20} />
                    </button>
                    <h1 className="text-base font-black flex items-center gap-2">
                        <ScanLine size={20} className="text-indigo-400" />
                        ماسح QR — تجربة أولية
                    </h1>
                    <button
                        onClick={() => setIsMuted(m => !m)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-900/60 text-red-400' : 'bg-slate-800 text-green-400 hover:bg-slate-700'}`}
                        aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
                    >
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                </div>
            </header>

            <main className="max-w-lg mx-auto px-4 pb-32">

                {/* ─── Camera Viewport Section ─── */}
                <section className="mt-6 relative">
                    {/* Camera container — always mounted in DOM for html5-qrcode */}
                    <div className="relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-700 shadow-2xl">
                        <div
                            id={containerIdRef.current}
                            className="w-full"
                            style={{ minHeight: isActive ? '320px' : '0px', transition: 'min-height 0.3s' }}
                        />

                        {/* ─── Flash Overlay ─── */}
                        {flashColor && (
                            <div
                                className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-300 rounded-3xl ${
                                    flashColor === 'green' ? 'bg-emerald-500/30' :
                                    flashColor === 'amber' ? 'bg-amber-500/30' :
                                    'bg-red-500/30'
                                }`}
                            />
                        )}

                        {/* ─── Idle State (Camera Off) ─── */}
                        {!isActive && !cameraError && (
                            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                                <div className="w-24 h-24 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6 relative">
                                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
                                    <Camera size={40} className="text-indigo-400 relative z-10" />
                                </div>
                                <h2 className="text-xl font-black text-white mb-2">جاهز للمسح</h2>
                                <p className="text-sm text-slate-400 font-bold leading-relaxed mb-8">
                                    اضغط على الزرار تحت عشان تفتح الكاميرا وتبدأ تمسح بطاقات QR الأبطال
                                </p>
                                <button
                                    onClick={startCamera}
                                    disabled={isStarting}
                                    className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-8 py-4 rounded-2xl font-black text-base shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isStarting ? (
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

                        {/* ─── Error State ─── */}
                        {cameraError && (
                            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
                                    <XCircle size={36} className="text-red-400" />
                                </div>
                                <p className="text-sm font-bold text-red-300 leading-relaxed mb-6">{cameraError}</p>
                                <button
                                    onClick={() => { setCameraError(null); startCamera(); }}
                                    className="bg-red-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    <RotateCcw size={16} />
                                    حاول تاني
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ─── Camera Active Controls ─── */}
                    {isActive && (
                        <div className="mt-4 flex gap-3">
                            <button
                                onClick={stopCamera}
                                className="flex-1 bg-red-600/90 hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-lg shadow-red-500/20"
                            >
                                <CameraOff size={18} />
                                إيقاف الكاميرا
                            </button>
                        </div>
                    )}
                </section>

                {/* ─── Toast Notification ─── */}
                {toastMessage && (
                    <div
                        className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-black text-sm shadow-2xl backdrop-blur-xl border transition-all animate-in slide-in-from-top-4 fade-in duration-200 max-w-[90vw] ${
                            toastMessage.type === 'success' ? 'bg-emerald-600/90 text-white border-emerald-500/50' :
                            toastMessage.type === 'warning' ? 'bg-amber-600/90 text-white border-amber-500/50' :
                            'bg-red-600/90 text-white border-red-500/50'
                        }`}
                    >
                        {toastMessage.message}
                    </div>
                )}

                {/* ─── Scan Counter Badge ─── */}
                <div className="mt-6 flex items-center justify-between px-1">
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                        تم مسحهم
                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-black min-w-[28px] text-center">
                            {scannedList.length}
                        </span>
                    </h3>
                    {scannedList.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="text-red-400 hover:text-red-300 text-xs font-black flex items-center gap-1 bg-red-500/10 px-3 py-1.5 rounded-xl hover:bg-red-500/20 transition-colors"
                        >
                            <Trash2 size={14} />
                            مسح الكل
                        </button>
                    )}
                </div>

                {/* ─── Scanned List ─── */}
                <div className="mt-4 space-y-2">
                    {scannedList.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <ScanLine size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="font-bold text-sm">مفيش بطاقات تم مسحها لسه</p>
                            <p className="text-xs mt-1 text-slate-600">افتح الكاميرا وابدأ مسح بطاقات الأبطال</p>
                        </div>
                    ) : (
                        scannedList.map((item, index) => (
                            <div
                                key={item.childId}
                                className="bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-3 flex items-center justify-between group hover:bg-slate-800 transition-colors animate-in slide-in-from-right-4 fade-in duration-300"
                                style={{ animationDelay: `${index * 30}ms` }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 font-black text-sm border border-indigo-500/20">
                                        {item.childId}
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-200">ID: {item.childId}</p>
                                        <p className="text-[10px] text-slate-500 font-bold mt-0.5 font-mono" dir="ltr">{item.raw}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeItem(item.childId)}
                                    className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors opacity-50 group-hover:opacity-100"
                                    aria-label={`حذف ID ${item.childId}`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* ─── PoC Info Banner ─── */}
                <div className="mt-8 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
                    <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-amber-300 mb-1">وضع التجربة (PoC)</p>
                        <p className="text-[11px] text-amber-400/70 font-bold leading-relaxed">
                            دي نسخة تجريبية للكاميرا والمسح. الـ IDs بتتجمع في الذاكرة بس ومش بتتحفظ في قاعدة البيانات. في المرحلة الجاية هنربط كل حاجة بأسماء الأبطال وقاعدة البيانات.
                        </p>
                    </div>
                </div>

            </main>
        </div>
    );
}
