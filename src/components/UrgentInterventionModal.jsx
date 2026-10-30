import React, { useState } from 'react';
import { X, Phone, MessageCircle, AlertTriangle, CheckCircle, Clock, ShieldAlert, User, Search, MapPin } from 'lucide-react';
import LogVisitationModal from './LogVisitationModal';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';

export default function UrgentInterventionModal({ isOpen, onClose, urgentCases = [] }) {
    const { triggerAutoSync } = useAutoSync();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedChildForVisit, setSelectedChildForVisit] = useState(null);
    const [snoozingId, setSnoozingId] = useState(null);

    if (!isOpen) return null;

    const filteredCases = urgentCases.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (c.name || '').toLowerCase().includes(q) || (c.osraName || '').toLowerCase().includes(q);
    });

    const cleanPhone = (phone) => {
        let p = String(phone || '').replace(/\D/g, '');
        if (p.startsWith('0')) p = '2' + p;
        else if (!p.startsWith('20') && p.length > 0) p = '20' + p;
        return p;
    };

    const getPrimaryPhone = (c) => {
        return c.phone || c.fatherPhone || c.motherPhone || c.childPhone || '';
    };

    const getWhatsAppUrl = (c) => {
        const phone = cleanPhone(getPrimaryPhone(c));
        if (!phone) return null;
        const firstName = (c.name || '').split(' ')[0] || 'مخدومنا الغالي';
        const msg = `سلام ونعمة يا ${firstName}.. قدسك والخدام بنطمن عليك وافتقدناك جداً في الكنيسة، بنصلي تكون بكل خير ومستنيينك الجمعة الجاية تنورنا! 🕊️✨`;
        return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
    };

    const handleSnooze = async (childId) => {
        try {
            setSnoozingId(childId);
            const snoozeUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
            try {
                await db.children.update(childId, {
                    alertSnoozedUntil: snoozeUntil,
                    isDirty: true,
                    updatedAt: Date.now()
                });
            } catch {
                await db.children.update(Number(childId), {
                    alertSnoozedUntil: snoozeUntil,
                    isDirty: true,
                    updatedAt: Date.now()
                });
            }
            triggerAutoSync();
        } catch (err) {
            console.error('Error snoozing alert:', err);
        } finally {
            setSnoozingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
            <div 
                className="bg-white rounded-3xl sm:rounded-4xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-red-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-5 sm:p-6 text-white relative">
                    <button 
                        onClick={onClose}
                        className="absolute left-4 top-4 w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition-colors"
                        aria-label="إغلاق"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
                            <ShieldAlert size={28} className="text-white animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg sm:text-xl font-black">حالات التدخل العاجل للآباء الكهنة</h2>
                                <span className="bg-white text-red-700 text-xs font-black px-2.5 py-0.5 rounded-full shadow-sm">
                                    {urgentCases.length}
                                </span>
                            </div>
                            <p className="text-xs text-red-100 font-bold mt-1">
                                مخدومون متغيبون 3 جُمع متتالية دون افتقاد قريب، أو بحاجة لرعاية كهنوتية خاصة
                            </p>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                {urgentCases.length > 3 && (
                    <div className="p-3 bg-slate-50 border-b border-slate-100">
                        <div className="relative">
                            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="بحث باسم المخدوم أو الفصل..."
                                className="w-full pr-10 pl-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                        </div>
                    </div>
                )}

                {/* Cases List */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
                    {filteredCases.length === 0 ? (
                        <div className="text-center py-12 px-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="font-black text-slate-800 text-base mb-1">
                                {searchQuery ? 'لا توجد نتائج مطابقة لبحثك' : 'الحمد لله، لا توجد حالات تدخل عاجل!'}
                            </h3>
                            <p className="text-xs font-bold text-slate-400">
                                {searchQuery ? 'جرب البحث بكلمة أخرى' : 'جميع المخدومين يواظبون بانتظام أو تم افتقادهم مؤخراً'}
                            </p>
                        </div>
                    ) : (
                        filteredCases.map((item) => {
                            const rawPhone = getPrimaryPhone(item);
                            const waUrl = getWhatsAppUrl(item);

                            return (
                                <div 
                                    key={item.id}
                                    className="p-4 rounded-2xl sm:rounded-3xl border border-red-100 bg-red-50/30 hover:bg-red-50/60 transition-all flex flex-col gap-3"
                                >
                                    {/* Top Row: Info */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-11 h-11 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-black text-sm shrink-0 border border-rose-200">
                                                {item.child?.profilePic ? (
                                                    <img 
                                                        src={item.child.profilePic} 
                                                        alt={item.name} 
                                                        className="w-full h-full rounded-full object-cover" 
                                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    item.name ? item.name.charAt(0) : <User size={20} />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-black text-slate-900 text-sm sm:text-base truncate">
                                                    {item.name}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                    {item.osraName && (
                                                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                                                            {item.osraName}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded-md border border-red-200">
                                                        {item.reason}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status / Last Visited */}
                                        <div className="text-left shrink-0">
                                            <div className="text-[10px] font-bold text-slate-400">آخر افتقاد</div>
                                            <div className="text-[11px] font-black text-slate-700">
                                                {item.lastVisited || 'لم يُفتقد بعد'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Missed Dates if present */}
                                    {item.missedDates && item.missedDates.length > 0 && (
                                        <div className="text-[11px] font-bold text-slate-500 bg-white/80 p-2 rounded-xl border border-slate-100 flex items-center gap-1.5">
                                            <Clock size={13} className="text-amber-500 shrink-0" />
                                            <span>جُمع الغياب:</span>
                                            <span className="text-red-700 font-mono text-[10px] dir-ltr">{item.missedDates.join(' ، ')}</span>
                                        </div>
                                    )}

                                    {/* Action Buttons Row */}
                                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-100/70">
                                        {/* Direct Phone Call */}
                                        {rawPhone ? (
                                            <a 
                                                href={`tel:${rawPhone}`}
                                                className="flex-1 min-w-[90px] py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                                                title={`اتصال هاتفي: ${rawPhone}`}
                                            >
                                                <Phone size={14} /> اتصال
                                            </a>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-400 px-2">بدون هاتف</span>
                                        )}

                                        {/* Direct WhatsApp */}
                                        {waUrl && (
                                            <a 
                                                href={waUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 min-w-[90px] py-2 px-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                                            >
                                                <MessageCircle size={14} /> واتساب
                                            </a>
                                        )}

                                        {/* Log Visitation */}
                                        <button 
                                            onClick={() => setSelectedChildForVisit(item.child)}
                                            className="flex-1 min-w-[110px] py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                                        >
                                            <MapPin size={14} /> تسجيل افتقاد
                                        </button>

                                        {/* Snooze 7 days */}
                                        <button 
                                            onClick={() => handleSnooze(item.id)}
                                            disabled={snoozingId === item.id}
                                            className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-50"
                                            title="تأجيل التنبيه لمدة أسبوع إذا تم التواصل معه"
                                        >
                                            {snoozingId === item.id ? 'جاري الحفظ...' : 'تأجيل أسبوع ⏳'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>💡 تسجيل الافتقاد يحل الحالة تلقائياً ويزيلها من قائمة التدخل العاجل.</span>
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
            </div>

            {/* Sub-modal: Log Visitation Modal */}
            {selectedChildForVisit && (
                <LogVisitationModal 
                    isOpen={Boolean(selectedChildForVisit)}
                    child={selectedChildForVisit}
                    onClose={() => setSelectedChildForVisit(null)}
                    onSuccess={() => {
                        setSelectedChildForVisit(null);
                    }}
                />
            )}
        </div>
    );
}
