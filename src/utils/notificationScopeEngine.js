// src/utils/notificationScopeEngine.js
// 🌟 محرك النطاق الهرمي للإشعارات وتصنيف المراحل الكنسية (4-Tier Role-Based Notification Scope Engine)

export const CHURCH_STAGES_ORDER = [
    'حضانة / كي جي',
    'ابتدائي',
    'إعدادي',
    'ثانوي',
    'شباب وخريجين',
    'خدمات أخرى'
];

/**
 * 🎭 قراءة بيانات الأسرة التي يتصفحها الكاهن / أمين الخدمة حالياً بوضع "الدخول كخادم للأسرة"
 * @returns {{ syncKey: string, name: string, serviceName?: string, stageName?: string, logo?: string } | null}
 */
export function getImpersonatedOsra() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
        const rawJson = localStorage.getItem('impersonated_osra');
        if (rawJson) {
            const parsed = JSON.parse(rawJson);
            const sk = String(parsed?.syncKey || '').trim();
            if (sk && sk !== 'MASTER_ACCESS' && sk !== 'ADMIN_MODE' && sk !== 'STAGE_ADMIN') {
                return {
                    syncKey: sk,
                    name: String(parsed?.name || localStorage.getItem('assignedOsra') || sk).trim(),
                    serviceName: parsed?.serviceName || 'الخدمة',
                    stageName: parsed?.stageName || inferStageFromClass(parsed?.name || sk),
                    logo: parsed?.logo || ''
                };
            }
        }

        const isLegacyImpersonating = localStorage.getItem('isSuperAdminImpersonating') === 'true';
        if (isLegacyImpersonating) {
            const sk = String(localStorage.getItem('currentSyncKey') || '').trim();
            if (sk && sk !== 'MASTER_ACCESS' && sk !== 'ADMIN_MODE' && sk !== 'STAGE_ADMIN') {
                const name = String(localStorage.getItem('assignedOsra') || sk).trim();
                return {
                    syncKey: sk,
                    name,
                    serviceName: 'الخدمة',
                    stageName: inferStageFromClass(name),
                    logo: ''
                };
            }
        }
    } catch (_e) {
        return null;
    }
    return null;
}

/**
 * 🎭 تفعيل وضع "الدخول كخادم للأسرة" لفصل محدد وتحديث الهوية فوراً
 */
export function startOsraImpersonation(osra, currentMasterSyncKey = null) {
    if (typeof window === 'undefined' || !window.localStorage || !osra?.syncKey) return null;
    const sk = String(osra.syncKey).trim();
    const existingMasterKey = localStorage.getItem('masterSyncKey');
    const currentKey = currentMasterSyncKey || localStorage.getItem('currentSyncKey') || 'MASTER_ACCESS';
    if (!existingMasterKey || existingMasterKey === sk) {
        localStorage.setItem(
            'masterSyncKey',
            currentKey && currentKey !== sk ? currentKey : 'MASTER_ACCESS'
        );
    }

    const payload = {
        syncKey: sk,
        name: String(osra.name || sk).trim(),
        serviceName: osra.serviceName || 'الخدمة',
        stageName: osra.stageName || inferStageFromClass(osra),
        logo: osra.logo || ''
    };

    localStorage.setItem('impersonated_osra', JSON.stringify(payload));
    localStorage.setItem('isSuperAdminImpersonating', 'true');
    localStorage.setItem('currentSyncKey', payload.syncKey);
    localStorage.setItem('assignedOsra', payload.name);

    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('syncKey-changed'));
        window.dispatchEvent(new Event('auth-changed'));
    }
    return payload;
}

/**
 * 🔙 إنهاء وضع "الدخول كخادم للأسرة" والعودة إلى الصلاحية الشاملة (الكاهن / أمين الخدمة)
 */
export function exitOsraImpersonation() {
    if (typeof window === 'undefined' || !window.localStorage) return 'MASTER_ACCESS';
    const masterKey = localStorage.getItem('masterSyncKey') || 'MASTER_ACCESS';
    localStorage.setItem('currentSyncKey', masterKey);
    localStorage.removeItem('impersonated_osra');
    localStorage.removeItem('isSuperAdminImpersonating');
    localStorage.removeItem('assignedOsra');
    localStorage.removeItem('masterSyncKey');

    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('syncKey-changed'));
        window.dispatchEvent(new Event('auth-changed'));
    }
    return masterKey;
}

/**
 * تطبيع النص العربي لتسهيل المطابقة الذكية لأسماء الفصول والمراحل
 */
function normalizeArabicForMatch(text) {
    if (!text) return '';
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');
}

/**
 * استنتاج اسم المرحلة الكنسية بدقة من بيانات الأسرة/الفصل أو اسمها
 * @param {object|string} osraOrName
 * @returns {string} اسم المرحلة القياسي
 */
export function inferStageFromClass(osraOrName) {
    if (!osraOrName) return 'خدمات أخرى';

    const rawText = typeof osraOrName === 'string'
        ? osraOrName
        : [
            osraOrName.stage,
            osraOrName.stageName,
            osraOrName.name,
            osraOrName.osraName,
            osraOrName.serviceName,
            osraOrName.syncKey
        ].filter(Boolean).join(' ');

    const norm = normalizeArabicForMatch(rawText);
    if (!norm) return 'خدمات أخرى';

    // 1. مرحلة الشباب والخريجين (تفحص أولاً لمنع التداخل)
    if (
        norm.includes('شباب') ||
        norm.includes('جامعه') ||
        norm.includes('خريجين') ||
        norm.includes('انبا موسي') ||
        norm.includes('الانبا موسي') ||
        norm.includes('youth')
    ) {
        return 'شباب وخريجين';
    }

    // 2. مرحلة ثانوي (تفحص قبل ابتدائي لأن الفصل قد يسمى "أولى ثانوي" أو "ثانية ثانوي")
    if (
        norm.includes('ثانوي') ||
        norm.includes('sec') ||
        norm.includes('secondary')
    ) {
        return 'ثانوي';
    }

    // 3. مرحلة إعدادي (تفحص قبل ابتدائي لأن الفصل قد يسمى "أولى إعدادي")
    if (
        norm.includes('اعدادي') ||
        norm.includes('prep')
    ) {
        return 'إعدادي';
    }

    // 4. مرحلة حضانة / كي جي
    if (
        norm.includes('كي جي') ||
        norm.includes('كيجي') ||
        norm.includes('kg') ||
        norm.includes('حضانه') ||
        norm.includes('ملائكه') ||
        norm.includes('تمهيدي') ||
        norm.includes('بيبي')
    ) {
        return 'حضانة / كي جي';
    }

    // 5. مرحلة ابتدائي
    if (
        norm.includes('ابتدائي') ||
        norm.includes('اولي') ||
        norm.includes('ثانيه') ||
        norm.includes('تانيه') ||
        norm.includes('ثالثه') ||
        norm.includes('تالته') ||
        norm.includes('رابعه') ||
        norm.includes('خامسه') ||
        norm.includes('سادسه') ||
        norm.includes('ساته') ||
        norm.includes('primary')
    ) {
        return 'ابتدائي';
    }

    return 'خدمات أخرى';
}

export const DEFAULT_CHURCH_OSRAS = [
    { syncKey: 'كي جي 1', name: 'كي جي 1', serviceName: 'خدمة حضانة وكي جي', stageName: 'حضانة / كي جي' },
    { syncKey: 'كي جي 2', name: 'كي جي 2', serviceName: 'خدمة حضانة وكي جي', stageName: 'حضانة / كي جي' },
    { syncKey: 'أولى ابتدائي', name: 'أولى ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'ثانية ابتدائي', name: 'ثانية ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'ثالثة ابتدائي', name: 'ثالثة ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'رابعة ابتدائي', name: 'رابعة ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'خامسة ابتدائي', name: 'خامسة ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'سادسة ابتدائي', name: 'سادسة ابتدائي', serviceName: 'خدمة ابتدائي', stageName: 'ابتدائي' },
    { syncKey: 'أولى إعدادي', name: 'أولى إعدادي', serviceName: 'خدمة إعدادي', stageName: 'إعدادي' },
    { syncKey: 'ثانية إعدادي', name: 'ثانية إعدادي', serviceName: 'خدمة إعدادي', stageName: 'إعدادي' },
    { syncKey: 'ثالثة إعدادي', name: 'ثالثة إعدادي', serviceName: 'خدمة إعدادي', stageName: 'إعدادي' },
    { syncKey: 'اجتماع ثانوي بنات', name: 'اجتماع ثانوي بنات', serviceName: 'خدمة ثانوي', stageName: 'ثانوي' },
    { syncKey: 'ثانوي اولاد', name: 'ثانوي اولاد', serviceName: 'خدمة ثانوي', stageName: 'ثانوي' },
    { syncKey: 'شباب الانبا موسي', name: 'شباب الانبا موسي', serviceName: 'خدمة الشباب والخريجين', stageName: 'شباب وخريجين' }
];

/**
 * استخراج جميع الفصول/الأسر من إعدادات النظام مع إثرائها بالمرحلة الكنسية المستنتجة
 * @param {object} [appSettingsInput]
 * @param {string[]} [extraSyncKeys]
 * @param {object} [options]
 * @returns {Array<{syncKey: string, name: string, serviceName: string, stageName: string, logo?: string}>}
 */
export function extractAllOsrasFromSettings(appSettingsInput = null, extraSyncKeys = [], options = {}) {
    let settings = appSettingsInput;
    if (!settings && typeof window !== 'undefined') {
        try {
            settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        } catch (_e) {
            settings = {};
        }
    }
    settings = settings || {};

    const osraMap = new Map();
    const services = Array.isArray(settings.services) ? settings.services : [];

    for (const service of services) {
        const serviceName = service?.name || 'الخدمة';
        const osras = Array.isArray(service?.osras) ? service.osras : [];
        for (const osra of osras) {
            const sk = String(osra?.syncKey || '').trim();
            if (!sk || sk === 'MASTER_ACCESS' || sk === 'ADMIN_MODE' || sk === 'STAGE_ADMIN') continue;
            const stageName = inferStageFromClass({ ...osra, serviceName });
            osraMap.set(sk, {
                ...osra,
                syncKey: sk,
                name: osra.name || sk,
                serviceName,
                serviceId: service.id,
                stageName,
                logo: osra.logo || service.logo || ''
            });
        }
    }

    // تضمين أي فصول إضافية موجودة في قاعدة البيانات المحلية ولم ترد في الإعدادات
    if (Array.isArray(extraSyncKeys)) {
        for (const rawKey of extraSyncKeys) {
            const sk = String(rawKey || '').trim();
            if (!sk || sk === 'MASTER_ACCESS' || sk === 'ADMIN_MODE' || sk === 'STAGE_ADMIN' || sk === 'all') continue;
            if (!osraMap.has(sk)) {
                osraMap.set(sk, {
                    syncKey: sk,
                    name: sk,
                    serviceName: 'الخدمة',
                    stageName: inferStageFromClass(sk),
                    logo: ''
                });
            }
        }
    }

    // توفير الفصول الافتراضية للواجهة فقط عندما لا يكون هناك هيكل محمل بعد في المتصفح
    if (osraMap.size === 0 && options?.includeFallback && !Array.isArray(settings.services)) {
        for (const fallbackOsra of DEFAULT_CHURCH_OSRAS) {
            osraMap.set(fallbackOsra.syncKey, { ...fallbackOsra, logo: '' });
        }
    }

    return Array.from(osraMap.values());
}

/**
 * تحديد المستوى الهرمي الدقيق للخادم ونطاق الإشعارات المسموح له
 * المستويات الـ 4:
 * 1. class_servant: خادم فصل (أو أمين أسرة فصل واحد) -> إشعارات فصله + إعلانات مرحلته
 * 2. stage_servant: خادم مرحلة (أو مسؤول عن عدة فصول في المرحلة) -> إشعارات فصول مرحلته
 * 3. stage_leader_detailed: أمين مرحلة -> إشعارات مفصلة لكل فصل في مرحلته
 * 4. master_detailed: أمين الخدمة العام / الأب الكاهن / Super Admin -> إشعارات مفصلة شاملة لكل مراحل وفصول الكنيسة
 *
 * @param {object} [currentServantInput]
 * @param {Array} [allOsrasInput]
 * @param {string} [currentSyncKeyOverride]
 */
export function resolveServantNotificationScope(
    currentServantInput = null,
    allOsrasInput = null,
    currentSyncKeyOverride = null,
    options = {}
) {
    let servant = currentServantInput;
    if (!servant && typeof window !== 'undefined') {
        try {
            servant = JSON.parse(localStorage.getItem('currentServant') || '{}');
        } catch (_e) {
            servant = {};
        }
    }
    servant = servant || {};

    const impersonatedOsra = !options?.ignoreImpersonation ? getImpersonatedOsra() : null;
    const isImpersonating = Boolean(impersonatedOsra?.syncKey);

    const rawSyncKey = isImpersonating
        ? impersonatedOsra.syncKey
        : (currentSyncKeyOverride ?? (typeof window !== 'undefined' ? localStorage.getItem('currentSyncKey') : '') ?? '');
    const currentSyncKey = String(rawSyncKey || servant.syncKey || '').trim();
    const assignedOsraName = isImpersonating
        ? (impersonatedOsra.name || '')
        : ((typeof window !== 'undefined' ? localStorage.getItem('assignedOsra') : '') || servant.assignedOsra || servant.osraName || '');

    const allOsras = Array.isArray(allOsrasInput) && allOsrasInput.length > 0
        ? allOsrasInput.map(o => ({
            ...o,
            syncKey: String(o.syncKey || '').trim(),
            name: o.name || String(o.syncKey || '').trim(),
            stageName: o.stageName || inferStageFromClass(o)
        }))
        : extractAllOsrasFromSettings();

    const osraMapBySyncKey = new Map();
    const osrasByStage = new Map();

    for (const stage of CHURCH_STAGES_ORDER) {
        osrasByStage.set(stage, []);
    }

    for (const osra of allOsras) {
        if (!osra.syncKey) continue;
        osraMapBySyncKey.set(osra.syncKey, osra);
        const stg = osra.stageName || inferStageFromClass(osra);
        if (!osrasByStage.has(stg)) {
            osrasByStage.set(stg, []);
        }
        osrasByStage.get(stg).push(osra);
    }

    if (isImpersonating && !osraMapBySyncKey.has(impersonatedOsra.syncKey)) {
        const enrichedImp = {
            ...impersonatedOsra,
            stageName: impersonatedOsra.stageName || inferStageFromClass(impersonatedOsra)
        };
        osraMapBySyncKey.set(impersonatedOsra.syncKey, enrichedImp);
    }

    const roleRaw = String(servant.role || '').trim();
    const roleNorm = normalizeArabicForMatch(roleRaw).replace(/الخدمه/g, 'خدمه').replace(/المرحله/g, 'مرحله');
    const allowedClassesRaw = Array.isArray(servant.allowedClasses)
        ? servant.allowedClasses.map(k => String(k || '').trim()).filter(Boolean)
        : [];

    // فحص المستوى الرابع: أمين الخدمة العام / الأب الكاهن / Super Admin
    const isMasterSyncKey = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
    const isMasterRole =
        roleNorm.includes('كاهن') ||
        roleNorm.includes('ابونا') ||
        roleNorm.includes('امين خدمه') ||
        roleNorm.includes('امين عام') ||
        roleNorm.includes('ادمن مساعد') ||
        roleNorm.includes('super admin') ||
        roleNorm.includes('super_admin') ||
        roleNorm.includes('master');

    // فحص المستوى الثالث: أمين مرحلة
    const isStageLeaderRole =
        currentSyncKey === 'STAGE_ADMIN' ||
        roleNorm === 'stage_admin' ||
        roleNorm.includes('امين مرحله') ||
        roleNorm.includes('أمين مرحلة');

    // فحص المستوى الثاني: خادم مرحلة أو خادم له عدة فصول في نفس المرحلة
    const isStageServantRole =
        roleNorm === 'data_entry' ||
        roleNorm.includes('خادم مرحله') ||
        (!isMasterSyncKey && !isMasterRole && !isStageLeaderRole && allowedClassesRaw.length > 1);

    let tier = 'class_servant';
    if (isImpersonating) {
        // 🎭 عند تفعيل "الدخول كخادم للأسرة"، يتحول النطاق النشط إلى خادم فصل واحد لهذا الفصل تحديداً
        tier = 'class_servant';
    } else if (isMasterSyncKey || isMasterRole) {
        tier = 'master_detailed';
    } else if (isStageLeaderRole) {
        tier = 'stage_leader_detailed';
    } else if (isStageServantRole) {
        tier = 'stage_servant';
    }

    // تحديد الفصل الأساسي للخادم (إن وجد)
    const isSpecialSyncKey =
        !currentSyncKey ||
        currentSyncKey === 'MASTER_ACCESS' ||
        currentSyncKey === 'ADMIN_MODE' ||
        currentSyncKey === 'STAGE_ADMIN';

    const primarySyncKey = isImpersonating
        ? impersonatedOsra.syncKey
        : (!isSpecialSyncKey
            ? currentSyncKey
            : (allowedClassesRaw[0] || String(servant.syncKey || '').trim() || ''));

    const primaryOsraObj = osraMapBySyncKey.get(primarySyncKey) || (isImpersonating ? impersonatedOsra : null);
    const primaryClassName = primaryOsraObj?.name || assignedOsraName || primarySyncKey || 'الفصل';

    // تحديد اسم المرحلة للخادم
    let stageName = 'خدمات أخرى';
    if (isImpersonating) {
        stageName = primaryOsraObj?.stageName || inferStageFromClass(primaryOsraObj || primaryClassName);
    } else if (tier === 'master_detailed') {
        stageName = 'كل مراحل الكنيسة';
    } else if (servant.stageName || servant.stage) {
        stageName = inferStageFromClass(servant.stageName || servant.stage);
    } else if (allowedClassesRaw.length > 0) {
        const firstAllowedOsra = osraMapBySyncKey.get(allowedClassesRaw[0]);
        stageName = inferStageFromClass(firstAllowedOsra || allowedClassesRaw[0]);
    } else if (primaryOsraObj) {
        stageName = primaryOsraObj.stageName || inferStageFromClass(primaryOsraObj);
    } else if (primaryClassName) {
        stageName = inferStageFromClass(primaryClassName);
    }

    // تحديد فصول المرحلة (stageSyncKeys)
    const stageOsras = osrasByStage.get(stageName) || [];
    const assignedStages = Array.isArray(servant.assignedStages) ? servant.assignedStages.map(String) : [];
    const assignedStageKeys = allOsras.filter(o => assignedStages.includes('all') || [o.stageId, o.serviceId, o.stageName, o.serviceName].some(v => v != null && assignedStages.includes(String(v)))).map(o => o.syncKey);
    const inferredStageKeys = assignedStages.length ? assignedStageKeys : stageOsras.map(o => o.syncKey);

    let stageSyncKeys = [];
    if (isImpersonating) {
        stageSyncKeys = stageOsras.length > 0 ? stageOsras.map(o => o.syncKey) : [primarySyncKey];
    } else if (tier === 'master_detailed') {
        stageSyncKeys = Array.from(osraMapBySyncKey.keys());
    } else if (assignedStages.length > 0) {
        stageSyncKeys = assignedStageKeys;
    } else if (allowedClassesRaw.length > 0) {
        stageSyncKeys = Array.from(new Set([...allowedClassesRaw, ...inferredStageKeys]));
    } else {
        stageSyncKeys = inferredStageKeys.length > 0
            ? inferredStageKeys
            : (primarySyncKey ? [primarySyncKey] : []);
    }

    // تحديد الفصول المسموح للخادم برؤية بياناتها (allowedSyncKeys)
    let allowedSyncKeys = [];
    if (isImpersonating) {
        allowedSyncKeys = [primarySyncKey];
    } else if (tier === 'master_detailed') {
        allowedSyncKeys = Array.from(osraMapBySyncKey.keys());
    } else if (tier === 'stage_leader_detailed' || tier === 'stage_servant') {
        allowedSyncKeys = allowedClassesRaw.length > 0 ? allowedClassesRaw : stageSyncKeys;
        if (allowedSyncKeys.length === 0 && primarySyncKey && assignedStages.length === 0) {
            allowedSyncKeys = [primarySyncKey];
        }
    } else {
        // خادم الفصل: يرى فصله الأساسي فقط في الإحصائيات التفصيلية، مع استقبال إعلانات مرحلته
        allowedSyncKeys = primarySyncKey ? [primarySyncKey] : [];
    }

    // مسميات العرض الواضحة لكل مستوى
    let roleTitle = roleRaw || 'خادم';
    let tierLabel = '';
    if (isImpersonating) {
        roleTitle = `تصفح كخادم — ${primaryClassName}`;
        tierLabel = `وضع تصفح أسرة: ${primaryClassName} (مرحلة ${stageName})`;
    } else if (tier === 'master_detailed') {
        if (roleNorm.includes('كاهن') || roleNorm.includes('ابونا')) {
            roleTitle = 'الأب الكاهن';
            tierLabel = 'الأب الكاهن (تفصيل شامل لكل المراحل والفصول)';
        } else {
            roleTitle = roleRaw || 'أمين الخدمة العام';
            tierLabel = `${roleTitle} (تفصيل شامل لكل المراحل والفصول)`;
        }
    } else if (tier === 'stage_leader_detailed') {
        roleTitle = roleRaw || 'أمين مرحلة';
        tierLabel = `أمين مرحلة ${stageName} (تقرير مفصل لفصول المرحلة)`;
    } else if (tier === 'stage_servant') {
        roleTitle = roleRaw || 'خادم مرحلة';
        tierLabel = `خادم مرحلة ${stageName} (${allowedSyncKeys.length} فصول)`;
    } else {
        roleTitle = roleRaw || 'خادم فصل';
        tierLabel = `${roleTitle} — ${primaryClassName} (مرحلة ${stageName})`;
    }

    const canBroadcast =
        isMasterRole ||
        tier === 'master_detailed' ||
        tier === 'stage_leader_detailed' ||
        roleNorm.includes('امين اسره') ||
        roleNorm.includes('أمين أسرة');

    return {
        tier,
        tierLabel,
        roleTitle,
        servantName: servant.name || roleTitle,
        servantPhone: servant.phone || '',
        primarySyncKey,
        primaryClassName,
        stageName,
        stageSyncKeys,
        allowedSyncKeys,
        canBroadcast,
        isImpersonating,
        impersonatedOsra: isImpersonating ? (primaryOsraObj || impersonatedOsra) : null,
        allOsras,
        osraMapBySyncKey,
        osrasByStage
    };
}

/**
 * التحقق مما إذا كان إشعار البث الموجه (Broadcast) يخص نطاق هذا الخادم
 */
export function doesBroadcastMatchScope(broadcast, scope) {
    if (!broadcast || !scope) return false;
    if (scope.tier === 'master_detailed') return true;

    const targetType = broadcast.targetType || 'all';
    const targetValue = String(broadcast.targetValue || '').trim();

    if (targetType === 'all') return true;

    if (targetType === 'stage') {
        const normTarget = normalizeArabicForMatch(targetValue);
        const normMyStage = normalizeArabicForMatch(scope.stageName);
        return normTarget === normMyStage || targetValue === scope.stageName;
    }

    if (targetType === 'class') {
        return (
            targetValue === scope.primarySyncKey ||
            (Array.isArray(scope.allowedSyncKeys) && scope.allowedSyncKeys.includes(targetValue))
        );
    }

    return false;
}
