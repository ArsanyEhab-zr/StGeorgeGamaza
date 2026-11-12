/**
 * Service Week & Thursday-to-Wednesday Church Cycle Utilities
 * 
 * Thursday-to-Wednesday weekly cycle:
 * - The church service week starts on Thursday 00:00:00 and ends on Wednesday 23:59:59.999.
 * - Thursday classes (e.g., ثانوي بنات, ثانوي أولاد, شباب الأنبا موسى) meet on Thursday.
 * - Friday classes meet on Friday.
 * - Both Thursday and Friday services remain active throughout the entire Thursday-to-Wednesday week!
 */

/**
 * Formats a Date object, timestamp, or date string into local 'YYYY-MM-DD'
 * without any UTC timezone offset shift.
 */
export const getLocalDateString = (d = new Date()) => {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
        return d.trim();
    }
    const target = (typeof d === 'number' || typeof d === 'string') ? new Date(d) : d;
    if (isNaN(target.getTime())) return '';
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Normalizes Arabic text for reliable matching of class/service names.
 */
export const normalizeArabicText = (text = '') => {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/[ىي]/g, 'ي')
        .replace(/[ؤئ]/g, 'ء')
        .replace(/[\u064B-\u065F\u0670]/g, '') // Strip diacritics (Tashkeel)
        .replace(/\s+/g, ' ');
};

/**
 * Resolves class metadata (name, serviceName, serviceDay) from localStorage appSettings if available.
 */
export const resolveClassInfo = (syncKey = '', className = '') => {
    const cleanKey = String(syncKey || '').trim();
    let resolvedName = String(className || '').trim();
    let serviceName = '';
    let serviceDay = null;

    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                const services = parsed?.services || [];
                for (const s of services) {
                    const osras = s?.osras || [];
                    for (const o of osras) {
                        const oKey = String(o?.syncKey || '').trim();
                        const oName = String(o?.name || '').trim();
                        if ((cleanKey && oKey === cleanKey) || (resolvedName && oName === resolvedName)) {
                            if (!resolvedName && oName) resolvedName = oName;
                            serviceName = String(s?.name || '').trim();
                            serviceDay = o?.serviceDay ?? s?.serviceDay ?? null;
                            break;
                        }
                    }
                    if (serviceName || serviceDay !== null) break;
                }
            }

            if (!resolvedName && cleanKey) {
                const currentKey = String(localStorage.getItem('currentSyncKey') || '').trim();
                if (cleanKey === currentKey) {
                    const assignedOsra = localStorage.getItem('assignedOsra') || '';
                    const servantStr = localStorage.getItem('currentServant');
                    const servant = servantStr ? JSON.parse(servantStr) : {};
                    resolvedName = assignedOsra || servant.osraName || servant.assignedOsra || servant.serviceName || '';
                }
            }
        } catch (_e) {
            // Ignore storage parsing errors
        }
    }

    return {
        syncKey: cleanKey,
        className: resolvedName,
        serviceName,
        serviceDay
    };
};

/**
 * Automatically detects whether a class holds its main weekly service on Thursday.
 * Recognizes: اجتماع ثانوي بنات, ثانوي اولاد, ثانوي أولاد, شباب الانبا موسي, شباب الأنبا موسى,
 * or any class/stage containing شباب, ثانوي, خميس, or explicit serviceDay === 'thursday' / 4.
 */
export const isThursdayServiceClass = (syncKey = '', className = '') => {
    const info = resolveClassInfo(syncKey, className);

    if (info.serviceDay === 4 || String(info.serviceDay || '').toLowerCase() === 'thursday' || String(info.serviceDay || '') === 'الخميس') {
        return true;
    }

    const combinedNormalized = normalizeArabicText(`${info.syncKey} ${info.className} ${info.serviceName}`);
    if (!combinedNormalized) return false;

    const thursdayPatterns = [
        'ثانوي بنات',
        'ثانوي اولاد',
        'شباب الانبا موسي',
        'الانبا موسي',
        'انبا موسي',
        'ثانوي',
        'ثانويه',
        'شباب',
        'خميس',
        'thursday',
        'youth',
        'secondary'
    ];

    return thursdayPatterns.some(pattern => combinedNormalized.includes(normalizeArabicText(pattern)));
};

/**
 * Returns { startDate, endDate, startTimestamp, endTimestamp, thursdayDate, fridayDate }
 * spanning Thursday 00:00:00.000 through Wednesday 23:59:59.999 in local time.
 */
export const getServiceWeekRange = (refDate = new Date()) => {
    const d = (refDate instanceof Date) ? new Date(refDate.getTime()) : new Date(refDate);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    validDate.setHours(12, 0, 0, 0);

    const dayOfWeek = validDate.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
    // Church week starts on Thursday (dayOfWeek === 4)
    const diffToThursday = (dayOfWeek - 4 + 7) % 7;

    const thursdayDateObj = new Date(validDate);
    thursdayDateObj.setDate(validDate.getDate() - diffToThursday);
    const startDate = getLocalDateString(thursdayDateObj);

    // Friday is 1 day after Thursday
    const fridayDateObj = new Date(thursdayDateObj);
    fridayDateObj.setDate(thursdayDateObj.getDate() + 1);
    const fridayDate = getLocalDateString(fridayDateObj);

    // Wednesday is 6 days after Thursday
    const wednesdayDateObj = new Date(thursdayDateObj);
    wednesdayDateObj.setDate(thursdayDateObj.getDate() + 6);
    const endDate = getLocalDateString(wednesdayDateObj);

    const startTimestamp = new Date(`${startDate}T00:00:00.000`).getTime();
    const endTimestamp = new Date(`${endDate}T23:59:59.999`).getTime();

    return {
        startDate,
        endDate,
        startTimestamp,
        endTimestamp,
        thursdayDate: startDate,
        fridayDate
    };
};

/**
 * Smart Default Service Date Resolver for a given class:
 * - Always follows the configured class day, including when a new cycle starts on Thursday.
 * - If the class is a Thursday service class (isThursdayServiceClass), returns the Thursday of the current service week (startDate).
 * - Otherwise (Friday service class on Friday through Wednesday), returns the Friday of the current service week (startDate + 1 day).
 */
export const getDefaultServiceDateForClass = (syncKey = '', className = '', now = new Date()) => {
    const d = (now instanceof Date) ? new Date(now.getTime()) : new Date(now);
    const validNow = isNaN(d.getTime()) ? new Date() : d;
    const { startDate, fridayDate } = getServiceWeekRange(validNow);

    // 2. If this class is a Thursday service class, default to the Thursday of the active week
    if (isThursdayServiceClass(syncKey, className)) {
        return startDate;
    }

    // 3. Otherwise (Friday service class on Friday–Wednesday), default to the Friday of the active week
    return fridayDate;
};

/**
 * Backward-compatible helper that returns the active service date for the current week.
 * Smartly respects Thursday classes and Thursday attendance entry.
 */
export const getCurrentServiceFridayDate = (refDate = new Date(), syncKey = null, className = null) => {
    let activeKey = syncKey;
    let activeName = className;

    if (typeof window !== 'undefined' && window.localStorage) {
        if (!activeKey) {
            const storedClassKey = sessionStorage.getItem('dashboard_activeClassKey');
            const currentKey = localStorage.getItem('currentSyncKey');
            activeKey = (storedClassKey && storedClassKey !== 'all') ? storedClassKey : currentKey;
        }
        if (!activeName) {
            activeName = localStorage.getItem('assignedOsra') || '';
        }
    }

    return getDefaultServiceDateForClass(activeKey, activeName, refDate);
};

/**
 * Checks whether a given YYYY-MM-DD or timestamp falls within the current Thursday-to-Wednesday week.
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
 * Calculates the elapsed scheduled service dates (Thursdays for Thursday classes, Fridays for Friday classes)
 * within [startDateStr, endDateStr] up to todayStr, combined with any actual recorded service dates for that class.
 */
export const getElapsedServiceDatesForClass = (startDateStr, endDateStr, {
    syncKey = '',
    className = '',
    actualServiceDates = [],
    todayStr = getLocalDateString(new Date())
} = {}) => {
    const isThursday = isThursdayServiceClass(syncKey, className);
    const targetDayOfWeek = isThursday ? 4 : 5; // 4 = Thursday, 5 = Friday

    const datesSet = new Set();
    const start = new Date(`${startDateStr}T12:00:00`);
    const end = new Date(`${endDateStr}T12:00:00`);

    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const cur = new Date(start);
        while (cur <= end) {
            if (cur.getDay() === targetDayOfWeek) {
                const dStr = getLocalDateString(cur);
                if (dStr && dStr <= todayStr) {
                    datesSet.add(dStr);
                }
            }
            cur.setDate(cur.getDate() + 1);
        }
    }

    // Also include any actual dates in the period where service attendance was recorded for this class
    if (Array.isArray(actualServiceDates)) {
        actualServiceDates.forEach(dStr => {
            if (dStr && dStr >= startDateStr && dStr <= endDateStr && dStr <= todayStr) {
                datesSet.add(dStr);
            }
        });
    }

    return Array.from(datesSet).sort();
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
