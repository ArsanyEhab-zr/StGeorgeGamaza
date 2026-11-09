// src/components/ScopedNotificationCenter.jsx
// 🌟 مركز الإشعارات الهرمي الذكي وبث الإشعارات الفورية للموبايل بأيقونة البرنامج

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    BellRing,
    X,
    CheckCheck,
    ChevronDown,
    ChevronUp,
    Send,
    Smartphone,
    ShieldCheck,
    Layers,
    Users,
    Sparkles,
    ExternalLink
} from 'lucide-react';
import { useScopedNotifications } from '../hooks/useScopedNotifications';
import { CHURCH_STAGES_ORDER } from '../utils/notificationScopeEngine';

export default function ScopedNotificationCenter({ variant = 'light' }) {
    const navigate = useNavigate();
    const {
        scope,
        notifications,
        unreadCount,
        stageBreakdowns,
        churchSummary,
        permission,
        markAllAsRead,
        markSingleAsRead,
        handleEnableNotifications,
        handleTestMobileNotification,
        sendInstantBroadcast
    } = useScopedNotifications();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'attendance' | 'visitation' | 'stage_admin'
    const [expandedIds, setExpandedIds] = useState({});
    const [showBroadcastForm, setShowBroadcastForm] = useState(false);

    // نموذج إرسال إشعار فوري للخدام
    const [bcastTitle, setBcastTitle] = useState('');
    const [bcastBody, setBcastBody] = useState('');
    const [bcastTargetType, setBcastTargetType] = useState(() => {
        if (scope.tier === 'master_detailed') return 'all';
        if (scope.tier === 'stage_leader_detailed') return 'stage';
        return 'class';
    });
    const [bcastTargetValue, setBcastTargetValue] = useState(() => {
        if (scope.tier === 'master_detailed') return 'all';
        if (scope.tier === 'stage_leader_detailed') return scope.stageName;
        return scope.primarySyncKey;
    });
    const [bcastUrgent, setBcastUrgent] = useState(true);
    const [isSendingBcast, setIsSendingBcast] = useState(false);
    const [testFeedback, setTestFeedback] = useState('');

    const toggleExpand = (id) => {
        setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const filteredNotifications = notifications.filter(n => {
        if (activeTab === 'all') return true;
        return n.category === activeTab;
    });

    const handleTriggerTest = async () => {
        const ok = await handleTestMobileNotification();
        if (ok) {
            setTestFeedback('✅ تم إرسال إشعار تجريبي للموبايل بأيقونة البرنامج!');
            setTimeout(() => setTestFeedback(''), 4000);
        }
    };

    const handleSendBroadcastSubmit = async (e) => {
        e.preventDefault();
        if (!bcastTitle.trim() || !bcastBody.trim()) {
            alert('يرجى إدخال عنوان ونص الإشعار.');
            return;
        }
        try {
            setIsSendingBcast(true);
            let finalTargetValue = bcastTargetValue;
            if (bcastTargetType === 'all') finalTargetValue = 'all';
            else if (bcastTargetType === 'stage' && (!finalTargetValue || finalTargetValue === 'all')) {
                finalTargetValue = scope.stageName !== 'كل مراحل الكنيسة' ? scope.stageName : CHURCH_STAGES_ORDER[0];
            } else if (bcastTargetType === 'class' && (!finalTargetValue || finalTargetValue === 'all')) {
                finalTargetValue = scope.primarySyncKey || scope.allOsras?.[0]?.syncKey || '';
            }

            await sendInstantBroadcast({
                title: bcastTitle,
                body: bcastBody,
                targetType: bcastTargetType,
                targetValue: finalTargetValue,
                urgent: bcastUrgent
            });

            setBcastTitle('');
            setBcastBody('');
            setShowBroadcastForm(false);
            setTestFeedback('📣 تم إرسال الإشعار الفوري للخدام بنجاح!');
            setTimeout(() => setTestFeedback(''), 4000);
        } catch (err) {
            alert('حدث خطأ أثناء إرسال الإشعار: ' + err.message);
        } finally {
            setIsSendingBcast(false);
        }
    };

    // تنسيق زر الجرس حسب خلفية الهيدر (Light في Home، Dark في Dashboard، Amber في MasterDashboard)
    const buttonStyles =
        variant === 'dark'
            ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
            : variant === 'amber'
            ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-md'
            : 'bg-amber-50 hover:bg-amber-500 text-amber-700 hover:text-white ring-2 ring-amber-500/20';

    const modalContent = isOpen && typeof document !== 'undefined' ? createPortal(
        <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
            dir="rtl"
            onClick={() => setIsOpen(false)}
        >
            <div
                className="bg-slate-50 w-full sm:max-w-2xl max-h-[92vh] sm:rounded-[2.25rem] rounded-t-[2.25rem] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Header ─── */}
                <div className="bg-linear-to-l from-indigo-900 via-indigo-800 to-slate-900 text-white p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                                <img
                                    src="/pwa-192x192.png"
                                    alt="أيقونة البرنامج"
                                    className="w-8 h-8 rounded-xl object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base sm:text-lg font-black">مركز إشعارات الخدمة الذكي</h2>
                                    {unreadCount > 0 && (
                                        <span className="text-[11px] font-black bg-rose-500 text-white px-2.5 py-0.5 rounded-full">
                                            {unreadCount} جديد
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] font-bold text-indigo-200 mt-0.5 flex items-center gap-1">
                                    <ShieldCheck size={13} className="text-amber-400 shrink-0" />
                                    <span>نطاق الإشعارات: {scope.tierLabel}</span>
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                            aria-label="إغلاق"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* شريط تفعيل وتجربة إشعار الموبايل + إرسال إشعار للخدام */}
                    <div className="mt-3 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {permission !== 'granted' ? (
                                <button
                                    type="button"
                                    onClick={handleEnableNotifications}
                                    className="text-[11px] font-black bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                                >
                                    <Smartphone size={14} />
                                    <span>تفعيل إشعارات الموبايل بأيقونة البرنامج</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleTriggerTest}
                                    className="text-[11px] font-black bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                >
                                    <BellRing size={13} />
                                    <span>🔔 تجربة إشعار على الموبايل الآن</span>
                                </button>
                            )}

                            {scope.canBroadcast && (
                                <button
                                    type="button"
                                    onClick={() => setShowBroadcastForm(prev => !prev)}
                                    className="text-[11px] font-black bg-white/15 hover:bg-white/25 text-white border border-white/25 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                                >
                                    <Send size={13} className="text-amber-300" />
                                    <span>📣 إرسال إشعار فوري للخدام</span>
                                </button>
                            )}
                        </div>

                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                className="text-[11px] font-bold text-indigo-200 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                                <CheckCheck size={14} />
                                <span>تحديد الكل كمقروء</span>
                            </button>
                        )}
                    </div>

                    {testFeedback && (
                        <div className="mt-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 text-xs font-black px-3 py-1.5 rounded-xl text-center">
                            {testFeedback}
                        </div>
                    )}
                </div>

                {/* ─── نموذج إرسال إشعار فوري للخدام (Broadcast Form) ─── */}
                {showBroadcastForm && scope.canBroadcast && (
                    <form
                        onSubmit={handleSendBroadcastSubmit}
                        className="bg-amber-50/90 border-b border-amber-200 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs sm:text-sm font-black text-amber-900 flex items-center gap-1.5">
                                <Send size={15} className="text-amber-600" />
                                <span>إرسال إشعار فوري يصل لهواتف الخدام بأيقونة البرنامج</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowBroadcastForm(false)}
                                className="text-xs font-bold text-amber-700 hover:text-amber-950"
                            >
                                إلغاء ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                                <label className="block text-[11px] font-black text-slate-700 mb-1">توجيه الإشعار إلى:</label>
                                <select
                                    value={bcastTargetType}
                                    onChange={(e) => {
                                        const t = e.target.value;
                                        setBcastTargetType(t);
                                        if (t === 'all') setBcastTargetValue('all');
                                        else if (t === 'stage') setBcastTargetValue(scope.stageName !== 'كل مراحل الكنيسة' ? scope.stageName : CHURCH_STAGES_ORDER[0]);
                                        else if (t === 'class') setBcastTargetValue(scope.primarySyncKey || scope.allOsras?.[0]?.syncKey || '');
                                    }}
                                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                                >
                                    {scope.tier === 'master_detailed' && (
                                        <option value="all">🌍 كل خدام الكنيسة (جميع المراحل)</option>
                                    )}
                                    {(scope.tier === 'master_detailed' || scope.tier === 'stage_leader_detailed') && (
                                        <option value="stage">🏛️ خدام مرحلة محددة</option>
                                    )}
                                    <option value="class">👥 خدام فصل محدد</option>
                                </select>
                            </div>

                            {bcastTargetType === 'stage' && (
                                <div>
                                    <label className="block text-[11px] font-black text-slate-700 mb-1">اختر المرحلة:</label>
                                    <select
                                        value={bcastTargetValue}
                                        onChange={(e) => setBcastTargetValue(e.target.value)}
                                        disabled={scope.tier === 'stage_leader_detailed'}
                                        className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                                    >
                                        {CHURCH_STAGES_ORDER.map(stg => (
                                            <option key={stg} value={stg}>مرحلة {stg}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {bcastTargetType === 'class' && (
                                <div>
                                    <label className="block text-[11px] font-black text-slate-700 mb-1">اختر الفصل:</label>
                                    <select
                                        value={bcastTargetValue}
                                        onChange={(e) => setBcastTargetValue(e.target.value)}
                                        className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                                    >
                                        {(scope.tier === 'master_detailed'
                                            ? scope.allOsras
                                            : scope.allOsras.filter(o => scope.allowedSyncKeys.includes(o.syncKey))
                                        ).map(osra => (
                                            <option key={osra.syncKey} value={osra.syncKey}>
                                                {osra.name} ({osra.stageName})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <input
                            type="text"
                            placeholder="عنوان الإشعار (مثال: تذكير هام بتسجيل حضور الخدمة / اجتماع الخدام)"
                            value={bcastTitle}
                            onChange={(e) => setBcastTitle(e.target.value)}
                            className="w-full bg-white border border-amber-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                        />

                        <textarea
                            rows={2}
                            placeholder="تفاصيل الإشعار التي ستظهر على شاشة موبايل الخدام..."
                            value={bcastBody}
                            onChange={(e) => setBcastBody(e.target.value)}
                            className="w-full bg-white border border-amber-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 resize-none"
                        />

                        <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={bcastUrgent}
                                    onChange={(e) => setBcastUrgent(e.target.checked)}
                                    className="rounded text-indigo-600"
                                />
                                <span>إشعار عاجل (اهتزاز وتنبيه فوري على الموبايل)</span>
                            </label>

                            <button
                                type="submit"
                                disabled={isSendingBcast}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                            >
                                <Send size={13} />
                                <span>{isSendingBcast ? 'جاري الإرسال...' : 'إرسال الإشعار الآن'}</span>
                            </button>
                        </div>
                    </form>
                )}

                {/* ─── Filter Tabs ─── */}
                <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
                    {[
                        { id: 'all', label: `الكل (${notifications.length})` },
                        { id: 'attendance', label: '✅ الحضور والغياب' },
                        { id: 'visitation', label: '🏡 الافتقاد والتدخل العاجل' },
                        { id: 'stage_admin', label: '🏛️ المرحلة والإدارة' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                                activeTab === tab.id
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ─── Notifications List ─── */}
                <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1">
                    {/* شريط الملخص السريع لأمين الخدمة العام وأمين المرحلة */}
                    {(scope.tier === 'master_detailed' || scope.tier === 'stage_leader_detailed') && (
                        <div className="bg-gradient-to-l from-indigo-50 to-amber-50 border border-indigo-200/80 rounded-2xl p-3.5 shadow-2xs">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                    <Layers size={15} className="text-indigo-600" />
                                    {scope.tier === 'master_detailed'
                                        ? 'ملخص الكنيسة اللحظي (كل المراحل والفصول)'
                                        : `ملخص مرحلة ${scope.stageName} اللحظي`}
                                </span>
                                <span className="text-[10px] font-black bg-indigo-600 text-white px-2.5 py-0.5 rounded-full">
                                    {scope.tier === 'master_detailed' ? 'تفصيل شامل' : 'تفصيل المرحلة'}
                                </span>
                            </div>

                            {scope.tier === 'master_detailed' ? (
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-white/90 rounded-xl p-2 border border-indigo-100">
                                        <div className="text-sm sm:text-base font-black text-indigo-700">
                                            {churchSummary.recordedClassesCount}/{churchSummary.totalClasses}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500">فصول سجلت</div>
                                    </div>
                                    <div className="bg-white/90 rounded-xl p-2 border border-emerald-100">
                                        <div className="text-sm sm:text-base font-black text-emerald-700">
                                            {churchSummary.presentCount}/{churchSummary.totalChildren}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500">إجمالي الحضور</div>
                                    </div>
                                    <div className="bg-white/90 rounded-xl p-2 border border-purple-100">
                                        <div className="text-sm sm:text-base font-black text-purple-700">
                                            {churchSummary.visitedCount}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500">افتقاد الأسبوع</div>
                                    </div>
                                    <div className="bg-white/90 rounded-xl p-2 border border-rose-100">
                                        <div className="text-sm sm:text-base font-black text-rose-600">
                                            {churchSummary.urgentCount}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-500">تدخل عاجل</div>
                                    </div>
                                </div>
                            ) : (
                                (() => {
                                    const stg = stageBreakdowns.find(s => s.stageName === scope.stageName) || {
                                        recordedClassesCount: 0,
                                        totalClasses: scope.allowedSyncKeys.length,
                                        presentCount: 0,
                                        totalChildren: 0,
                                        visitedCount: 0,
                                        urgentCount: 0
                                    };
                                    return (
                                        <div className="grid grid-cols-4 gap-2 text-center">
                                            <div className="bg-white/90 rounded-xl p-2 border border-indigo-100">
                                                <div className="text-sm sm:text-base font-black text-indigo-700">
                                                    {stg.recordedClassesCount}/{stg.totalClasses}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500">فصول المرحلة</div>
                                            </div>
                                            <div className="bg-white/90 rounded-xl p-2 border border-emerald-100">
                                                <div className="text-sm sm:text-base font-black text-emerald-700">
                                                    {stg.presentCount}/{stg.totalChildren}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500">حضور المرحلة</div>
                                            </div>
                                            <div className="bg-white/90 rounded-xl p-2 border border-purple-100">
                                                <div className="text-sm sm:text-base font-black text-purple-700">
                                                    {stg.visitedCount}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500">افتقاد المرحلة</div>
                                            </div>
                                            <div className="bg-white/90 rounded-xl p-2 border border-rose-100">
                                                <div className="text-sm sm:text-base font-black text-rose-600">
                                                    {stg.urgentCount}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-500">حالات عاجلة</div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    )}

                    {filteredNotifications.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 font-bold text-sm">
                            لا توجد إشعارات في هذا التبويب حالياً.
                        </div>
                    ) : (
                        filteredNotifications.map((notif) => {
                            const isExpanded = Boolean(expandedIds[notif.id]);
                            const hasDetails = Array.isArray(notif.detailsList) && notif.detailsList.length > 0;

                            const borderStyle =
                                notif.priority === 'critical'
                                    ? 'border-rose-300 bg-rose-50/40'
                                    : !notif.isRead
                                    ? 'border-indigo-200 bg-white'
                                    : 'border-slate-200 bg-white/80';

                            return (
                                <div
                                    key={notif.id}
                                    onClick={() => markSingleAsRead(notif.id)}
                                    className={`rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition-all ${borderStyle}`}
                                >
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                                                {notif.icon || '🔔'}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 leading-snug">
                                                        {notif.title}
                                                    </h3>
                                                    {!notif.isRead && (
                                                        <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs font-bold text-slate-600 mt-1 leading-relaxed">
                                                    {notif.body}
                                                </p>
                                                {notif.meta && (
                                                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                                                        {notif.meta}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {hasDetails && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleExpand(notif.id);
                                                    }}
                                                    className="text-[11px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                                                >
                                                    <span>{isExpanded ? 'إخفاء التفصيل' : 'عرض التفصيل'}</span>
                                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                </button>
                                            )}
                                            {notif.url && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        markSingleAsRead(notif.id);
                                                        setIsOpen(false);
                                                        const cleanPath = notif.url.replace(/^\/#/, '') || '/';
                                                        navigate(cleanPath);
                                                    }}
                                                    className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                                    title="فتح الشاشة المختصة"
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* ─── القائمة التفصيلية القابلة للطي (مفصلة لأمين المرحلة وأمين الخدمة) ─── */}
                                    {hasDetails && isExpanded && (
                                        <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2 animate-in fade-in duration-150">
                                            {notif.detailsList.map((detail, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`p-2.5 rounded-xl border text-xs ${
                                                        detail.status === 'danger'
                                                            ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                                                            : detail.status === 'warning'
                                                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                                                            : detail.status === 'success'
                                                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                                                            : 'bg-slate-50 border-slate-200 text-slate-800'
                                                    }`}
                                                >
                                                    <div className="font-black">{detail.label}</div>
                                                    <div className="font-bold text-[11px] opacity-90 mt-0.5">{detail.value}</div>
                                                    {Array.isArray(detail.subItems) && detail.subItems.length > 0 && (
                                                        <div className="mt-1.5 pt-1.5 border-t border-black/10 space-y-1">
                                                            {detail.subItems.map((sub, sIdx) => (
                                                                <div key={sIdx} className="text-[11px] font-bold pr-2 border-r-2 border-indigo-400">
                                                                    {sub}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label="إشعارات الخدمة"
                title={`إشعارات الخدمة (${scope.roleTitle})`}
                className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer ${buttonStyles}`}
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-rose-600 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white shadow-xs">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>
            {modalContent}
        </>
    );
}
