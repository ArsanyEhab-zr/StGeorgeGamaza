/* eslint-disable no-unused-vars */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { QRCodeCanvas } from 'qrcode.react';
import {
    ArrowRight, Printer, Users, Search, Filter,
    QrCode, CreditCard, ChevronDown, Download
} from 'lucide-react';

// ─────────────────────────────────────────────
// 🎴 QR ID Card Generator
// ─────────────────────────────────────────────
export default function QrCardGenerator() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [genderFilter, setGenderFilter] = useState('all'); // 'all' | 'boys' | 'girls'
    const [cardSize, setCardSize] = useState('standard'); // 'standard' | 'compact'

    // ─── Fetch children (syncKey-scoped like the rest of the app) ───
    const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

    const children = useLiveQuery(() => {
        if (isMaster) return db.children.toArray();
        if (!currentSyncKey) return [];
        return db.children.where('syncKey').equals(currentSyncKey).toArray();
    }, [currentSyncKey, isMaster]);

    // ─── App settings for khedma/osra names ───
    const appSettings = useMemo(() => {
        try {
            const saved = localStorage.getItem('appSettings');
            if (!saved) return { khedmaName: 'الخدمة', osraName: 'الأسرة' };
            const parsed = JSON.parse(saved);

            if (isMaster) {
                return {
                    khedmaName: parsed.services?.[0]?.name || parsed.khedmaName || 'الخدمة',
                    osraName: 'كل الأسر',
                };
            }

            // Find the servant's osra
            if (parsed.services && Array.isArray(parsed.services)) {
                for (const service of parsed.services) {
                    const foundOsra = (service.osras || []).find(
                        o => String(o.syncKey).trim() === String(currentSyncKey).trim()
                    );
                    if (foundOsra) {
                        return { khedmaName: service.name, osraName: foundOsra.name };
                    }
                }
            }
            return { khedmaName: parsed.khedmaName || 'الخدمة', osraName: parsed.osraName || 'الأسرة' };
        } catch (_e) {
            return { khedmaName: 'الخدمة', osraName: 'الأسرة' };
        }
    }, [currentSyncKey, isMaster]);

    // ─── Filtered children ───
    const filteredChildren = useMemo(() => {
        if (!children) return [];
        return children
            .filter(c => !c.isDeleted)
            .filter(c => {
                if (genderFilter === 'boys' && c.gender === 'بنت') return false;
                if (genderFilter === 'girls' && c.gender !== 'بنت') return false;
                return true;
            })
            .filter(c => {
                if (!searchQuery) return true;
                return c.name?.toLowerCase().includes(searchQuery.toLowerCase());
            })
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    }, [children, genderFilter, searchQuery]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            {/* ─── Screen-only UI (hidden when printing) ─── */}
            <div className="min-h-screen bg-slate-50 font-sans print:hidden" dir="rtl">

                {/* Header */}
                <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-4 py-3 shadow-sm">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors active:scale-90 text-slate-600"
                            aria-label="رجوع"
                        >
                            <ArrowRight size={20} />
                        </button>
                        <h1 className="text-sm font-black text-indigo-900 flex items-center gap-2">
                            <CreditCard size={18} className="text-indigo-500" />
                            طباعة كارنيهات QR
                        </h1>
                        <button
                            onClick={handlePrint}
                            disabled={filteredChildren.length === 0}
                            className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
                            aria-label="طباعة"
                        >
                            <Printer size={18} />
                        </button>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-4 pb-8">

                    {/* Controls Bar */}
                    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="ابحث عن مخدوم..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 border border-slate-200"
                            />
                        </div>

                        <div className="flex gap-2 items-center flex-wrap">
                            {/* Gender Filter */}
                            <div className="flex gap-1.5 flex-1 min-w-[200px]">
                                {[
                                    { id: 'all', label: 'الكل 🌟' },
                                    { id: 'boys', label: 'ولاد 👦' },
                                    { id: 'girls', label: 'بنات 👧' },
                                ].map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setGenderFilter(f.id)}
                                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                            genderFilter === f.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* Card Size Toggle */}
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setCardSize('standard')}
                                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                        cardSize === 'standard'
                                            ? 'bg-amber-500 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    عادي
                                </button>
                                <button
                                    onClick={() => setCardSize('compact')}
                                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                        cardSize === 'compact'
                                            ? 'bg-amber-500 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    مدمج
                                </button>
                            </div>
                        </div>

                        {/* Count */}
                        <div className="flex items-center justify-between text-xs font-black text-slate-500 pt-1">
                            <span className="flex items-center gap-1.5">
                                <Users size={14} className="text-indigo-500" />
                                {filteredChildren.length} مخدوم
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-400">
                                <Printer size={12} />
                                {cardSize === 'standard' ? '4 كروت/صفحة' : '8 كروت/صفحة'}
                            </span>
                        </div>
                    </div>

                    {/* Print Button (Large) */}
                    <button
                        onClick={handlePrint}
                        disabled={filteredChildren.length === 0}
                        className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Printer size={22} />
                        🖨️ طباعة الكارنيهات ({filteredChildren.length})
                    </button>

                    {/* Preview Cards */}
                    <div className="mt-6">
                        <h3 className="text-sm font-black text-slate-500 mb-3 flex items-center gap-2 px-1">
                            <QrCode size={16} className="text-indigo-500" />
                            معاينة الكارنيهات
                        </h3>
                        <div className={`grid gap-4 ${cardSize === 'standard' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'}`}>
                            {filteredChildren.map(child => (
                                <IdCard
                                    key={child.id}
                                    child={child}
                                    khedmaName={appSettings.khedmaName}
                                    osraName={appSettings.osraName}
                                    compact={cardSize === 'compact'}
                                />
                            ))}
                        </div>
                        {filteredChildren.length === 0 && (
                            <div className="text-center py-16 text-slate-400">
                                <QrCode size={48} className="mx-auto mb-3 opacity-20" />
                                <p className="font-bold text-sm">مفيش مخدومين</p>
                                <p className="text-xs mt-1">تأكد من تسجيل الدخول وجود بيانات مخدومين</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* ─── Print-only Layout (visible ONLY when printing) ─── */}
            <div className="hidden print:block" dir="rtl">
                <div className={`print-grid ${cardSize === 'compact' ? 'print-grid-compact' : ''}`}>
                    {filteredChildren.map(child => (
                        <IdCard
                            key={child.id}
                            child={child}
                            khedmaName={appSettings.khedmaName}
                            osraName={appSettings.osraName}
                            compact={cardSize === 'compact'}
                            forPrint
                        />
                    ))}
                </div>
            </div>

            {/* ─── Print Styles ─── */}
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 8mm;
                    }

                    body {
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    .print-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 6mm;
                        padding: 0;
                    }

                    .print-grid-compact {
                        grid-template-columns: repeat(4, 1fr);
                        gap: 4mm;
                    }

                    .print-card {
                        break-inside: avoid;
                        page-break-inside: avoid;
                        border: 1.5px solid #cbd5e1;
                        border-radius: 12px;
                        padding: 10px 8px;
                        text-align: center;
                        background: white;
                    }

                    .print-card-compact {
                        padding: 6px 4px;
                        border-radius: 8px;
                    }
                }
            `}</style>
        </>
    );
}

// ─────────────────────────────────────────────
// 🪪 Individual ID Card Component
// ─────────────────────────────────────────────
function IdCard({ child, khedmaName, osraName, compact = false, forPrint = false }) {
    const qrValue = `KHD:${child.id}`;
    const genderEmoji = child.gender === 'بنت' ? '👧' : '👦';
    const canvasId = `qr-canvas-${child.id}`;

    const downloadQR = () => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `${child.name || 'بدون اسم'}_QR.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };

    if (forPrint) {
        // Print-optimized card (minimal, no shadows/gradients)
        return (
            <div className={`print-card ${compact ? 'print-card-compact' : ''}`}>
                {/* Header */}
                <div style={{ fontSize: compact ? '7px' : '8px', fontWeight: 900, color: '#312e81', marginBottom: compact ? '2px' : '4px', letterSpacing: '-0.02em' }}>
                    {khedmaName}
                </div>

                {/* Profile */}
                <div style={{ margin: '0 auto', marginBottom: compact ? '4px' : '6px' }}>
                    {child.profilePic ? (
                        <img
                            src={child.profilePic}
                            alt={child.name}
                            style={{
                                width: compact ? '32px' : '44px',
                                height: compact ? '32px' : '44px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid #e2e8f0',
                                margin: '0 auto',
                                display: 'block',
                            }}
                        />
                    ) : (
                        <div style={{
                            width: compact ? '32px' : '44px',
                            height: compact ? '32px' : '44px',
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            border: '2px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: compact ? '16px' : '22px',
                            margin: '0 auto',
                        }}>
                            {genderEmoji}
                        </div>
                    )}
                </div>

                {/* Name */}
                <div style={{ fontSize: compact ? '9px' : '11px', fontWeight: 900, color: '#1e293b', marginBottom: compact ? '2px' : '4px', lineHeight: 1.3 }}>
                    {child.name || 'بدون اسم'}
                </div>

                {/* Gender tag */}
                <div style={{ fontSize: '7px', fontWeight: 700, color: '#64748b', marginBottom: compact ? '4px' : '6px' }}>
                    {child.gender === 'بنت' ? 'بنت' : 'ولد'} — {osraName}
                </div>

                {/* QR Code */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: compact ? '2px' : '4px' }}>
                    <QRCodeCanvas
                        value={qrValue}
                        size={compact ? 52 : 72}
                        level="M"
                        includeMargin={false}
                    />
                </div>

                {/* ID */}
                <div style={{ fontSize: '7px', fontWeight: 700, color: '#94a3b8', fontFamily: 'monospace', direction: 'ltr' }}>
                    {qrValue}
                </div>
            </div>
        );
    }

    // Screen preview card
    return (
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow relative ${compact ? 'p-2.5' : 'p-4 flex flex-col h-full'}`}>

            {/* Header */}
            <div className={`text-center ${compact ? 'mb-1' : 'mb-2'}`}>
                <p className={`font-black text-indigo-900 truncate ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                    {khedmaName}
                </p>
            </div>

            {/* Profile Picture */}
            <div className="flex justify-center">
                {child.profilePic ? (
                    <img
                        src={child.profilePic}
                        alt={child.name}
                        className={`rounded-full object-cover border-2 border-slate-200 ${compact ? 'w-10 h-10' : 'w-14 h-14'}`}
                    />
                ) : (
                    <div className={`rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center ${compact ? 'w-10 h-10 text-xl' : 'w-14 h-14 text-2xl'}`}>
                        {genderEmoji}
                    </div>
                )}
            </div>

            {/* Name */}
            <h3 className={`font-black text-slate-800 text-center truncate mt-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                {child.name || 'بدون اسم'}
            </h3>

            {/* Gender & Osra */}
            <p className={`text-slate-500 font-bold text-center truncate ${compact ? 'text-[7px] mt-0.5' : 'text-[9px] mt-1'}`}>
                {child.gender === 'بنت' ? 'بنت' : 'ولد'} — {osraName}
            </p>

            {/* QR Code */}
            <div className={`flex justify-center ${compact ? 'mt-2 mb-1' : 'mt-auto mb-3'}`}>
                <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                    <QRCodeCanvas
                        id={canvasId}
                        value={qrValue}
                        size={compact ? 56 : 80}
                        level="M"
                        includeMargin={false}
                    />
                </div>
            </div>

            {/* Footer: ID & Download */}
            <div className="flex items-center justify-between print:justify-center mt-1">
                <p className={`font-bold text-slate-400 font-mono text-center print:flex-none print:w-full ${compact ? 'text-[8px]' : 'text-[10px] pl-2'}`} dir="ltr">
                    {qrValue}
                </p>
                <button
                    onClick={downloadQR}
                    className={`flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors print:hidden shrink-0 ${compact ? 'w-6 h-6' : 'px-2.5 py-1.5 gap-1.5'}`}
                    title="تحميل QR Code"
                >
                    <Download size={compact ? 12 : 14} />
                    {!compact && <span className="text-[10px] font-black">تحميل</span>}
                </button>
            </div>
        </div>
    );
}
