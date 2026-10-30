/**
 * Service Week & Friday-to-Friday Data Continuity Utilities (Requirement #8)
 * 
 * Friday-to-Thursday weekly cycle:
 * - Friday is the active church service day.
 * - Saturday through Thursday persistently retains and displays the recent Friday's data.
 * - Rolls over to a fresh week only when the new Friday starts.
 */

/**
 * Formats a Date object, timestamp, or date string into local 'YYYY-MM-DD'
 * without any UTC timezone offset shift.
 */
export const getLocalDateString = (d = new Date()) => {
    if (!d) return '';
    const target = (typeof d === 'number' || typeof d === 'string') ? new Date(d) : d;
    if (isNaN(target.getTime())) return '';
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Returns YYYY-MM-DD string of the current service Friday.
 * If today is Friday -> returns today.
 * If today is Saturday -> Thursday -> returns the preceding Friday.
 */
export const getCurrentServiceFridayDate = (refDate = new Date()) => {
    const d = new Date(refDate);
    const day = d.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
    let diffToFriday = 0;
    if (day === 5) {
        diffToFriday = 0; // Today is Friday
    } else if (day === 6) {
        diffToFriday = 1; // Saturday -> 1 day ago
    } else {
        // Sun (0) -> 2 days ago, Mon (1) -> 3, Tue (2) -> 4, Wed (3) -> 5, Thu (4) -> 6
        diffToFriday = day + 2;
    }
    const target = new Date(d);
    target.setDate(d.getDate() - diffToFriday);
    return getLocalDateString(target);
};

/**
 * Returns { startDate, endDate, startTimestamp, endTimestamp, fridayDate }
 * spanning Friday 00:00:00 through Thursday 23:59:59.
 */
export const getServiceWeekRange = (refDate = new Date()) => {
    const fridayStr = getCurrentServiceFridayDate(refDate);
    const fridayDate = new Date(`${fridayStr}T00:00:00`);

    // Thursday is 6 days after Friday
    const thursdayDate = new Date(fridayDate);
    thursdayDate.setDate(thursdayDate.getDate() + 6);
    const thursdayStr = getLocalDateString(thursdayDate);

    const startTimestamp = new Date(`${fridayStr}T00:00:00.000`).getTime();
    const endTimestamp = new Date(`${thursdayStr}T23:59:59.999`).getTime();

    return {
        startDate: fridayStr,
        endDate: thursdayStr,
        startTimestamp,
        endTimestamp,
        fridayDate: fridayStr
    };
};

/**
 * Checks whether a given YYYY-MM-DD or timestamp falls within the current Friday-to-Thursday week
 */
export const isWithinCurrentServiceWeek = (dateVal, refDate = new Date()) => {
    if (!dateVal) return false;
    const { startDate, endDate } = getServiceWeekRange(refDate);
    if (typeof dateVal === 'number' || dateVal instanceof Date) {
        const dStr = getLocalDateString(dateVal);
        return dStr >= startDate && dStr <= endDate;
    }
    const dStr = String(dateVal).split('T')[0];
    return dStr >= startDate && dStr <= endDate;
};

/**
 * Formats a date into a clean Arabic Coptic date string (e.g., '٢٠ بابه ١٧٤٣')
 * stripping any era designations like AM/PM and ensuring standard Arabic month names.
 */
export const formatCopticDate = (d = new Date()) => {
    try {
        const target = (typeof d === 'number' || typeof d === 'string') ? new Date(d) : d;
        if (isNaN(target.getTime())) return 'التقويم القبطي';
        let str = new Intl.DateTimeFormat('ar-EG-u-ca-coptic', { day: 'numeric', month: 'long', year: 'numeric' }).format(target);

        const monthsMap = {
            'tout': 'توت', 'thout': 'توت',
            'baba': 'بابه', 'paopi': 'بابه',
            'hathor': 'هاتور', 'hatur': 'هاتور',
            'kiahk': 'كيهك', 'koiak': 'كيهك',
            'tobi': 'طوبة', 'tubah': 'طوبة', 'toubah': 'طوبة',
            'meshir': 'أمشير', 'emshir': 'أمشير',
            'paremhat': 'برمهات', 'baramhat': 'برمهات',
            'paremoude': 'برمودة', 'baramouda': 'برمودة',
            'pashons': 'بشنس', 'bashans': 'بشنس',
            'paoni': 'بؤونة', 'baounah': 'بؤونة',
            'epip': 'أبيب', 'abib': 'أبيب',
            'mesori': 'مسرى', 'mesra': 'مسرى',
            'nasie': 'نسئ', 'pi kogi enavot': 'نسئ'
        };
        Object.keys(monthsMap).forEach(m => {
            str = str.replace(new RegExp(m, 'gi'), monthsMap[m]);
        });
        // Remove AM, PM, ERA, English characters
        str = str.replace(/\b(AM|PM|ERA\d*|A\.M\.)\b/gi, '').replace(/[a-zA-Z]/g, '').trim();
        str = str.replace(/\s+/g, ' ');
        return str || 'التقويم القبطي';
    } catch {
        return 'التقويم القبطي';
    }
};
