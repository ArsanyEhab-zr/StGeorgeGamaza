import { getLocalDateString } from './serviceWeek';

/**
 * Visitation Types & Utilities (Requirement #6)
 * Differentiates visitation into 3 distinct types:
 * 1. home_inside -> "افتقاد داخل البيت 🏠"
 * 2. doorstep    -> "افتقاد سريع (على الباب) 🚪"
 * 3. phone       -> "افتقاد تليفوني 📞"
 */

export const VISITATION_TYPES = [
    {
        id: 'home_inside',
        label: 'افتقاد داخل البيت 🏠',
        shortLabel: 'داخل البيت 🏠',
        description: 'زيارة منزلية وجلوس مع المخدوم وأسرته',
        icon: '🏠',
        color: 'emerald',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    {
        id: 'doorstep',
        label: 'افتقاد سريع (على الباب) 🚪',
        shortLabel: 'على الباب 🚪',
        description: 'زيارة سريعة على باب المنزل للاطمئنان والتسليم',
        icon: '🚪',
        color: 'amber',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
    },
    {
        id: 'phone',
        label: 'افتقاد تليفوني 📞',
        shortLabel: 'تليفوني 📞',
        description: 'مكالمة هاتفية أو رسالة صوتية تفاعلية للاطمئنان',
        icon: '📞',
        color: 'blue',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
    }
];

export const getVisitationInfo = (type) => {
    return VISITATION_TYPES.find(t => t.id === type) || {
        id: type || 'unknown',
        label: type || 'افتقاد عام',
        shortLabel: type || 'افتقاد',
        description: 'افتقاد للمخدوم',
        icon: '🤝',
        color: 'slate',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
    };
};

/**
 * Format last_visited timestamp or string safely
 */
export const formatLastVisitedDate = (val) => {
    if (!val) return null;
    try {
        if (typeof val === 'number' || val instanceof Date) {
            return getLocalDateString(val);
        }
        if (typeof val === 'string') {
            return val.split('T')[0];
        }
    } catch {
        return String(val);
    }
    return null;
};
