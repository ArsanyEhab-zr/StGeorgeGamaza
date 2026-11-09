// src/hooks/useScopedNotifications.js
// 🌟 الهوك المركزي للإشعارات الهرمية الذكية حسب الدور والمستوى (4-Tier Scoped Notifications Hook)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, onSnapshot, setDoc, getDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { firestore } from '../db/firebase';
import {
    CHURCH_STAGES_ORDER,
    extractAllOsrasFromSettings,
    resolveServantNotificationScope,
    doesBroadcastMatchScope
} from '../utils/notificationScopeEngine';
import {
    dispatchNativeAppNotification,
    updateAppIconBadgeCount,
    getReadNotificationIds,
    markNotificationsAsRead,
    requestAppNotificationPermission,
    sendTestMobileNotification
} from '../utils/pwaNotificationService';
import { useChurchDataEngine } from './useChurchDataEngine';
import { useWeeklyClassActivity } from './useWeeklyClassActivity';
import { useUrgentInterventionAlerts } from './useUrgentInterventionAlerts';
import { isThursdayServiceClass } from '../utils/serviceWeek';
import { logActivity } from '../utils/activityLogger';

export function useScopedNotifications() {
    const [appSettings, setAppSettings] = useState(() => {
        if (typeof window === 'undefined') return {};
        try {
            return JSON.parse(localStorage.getItem('appSettings') || '{}');
        } catch (_e) {
            return {};
        }
    });

    const [currentServant, setCurrentServant] = useState(() => {
        if (typeof window === 'undefined') return {};
        try {
            return JSON.parse(localStorage.getItem('currentServant') || '{}');
        } catch (_e) {
            return {};
        }
    });

    const [currentSyncKey, setCurrentSyncKey] = useState(() => {
        if (typeof window === 'undefined') return '';
        return String(localStorage.getItem('currentSyncKey') || '');
    });

    const [permission, setPermission] = useState(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            return Notification.permission;
        }
        return 'default';
    });

    const [readIds, setReadIds] = useState(() => getReadNotificationIds());
    const [broadcastList, setBroadcastList] = useState([]);
    const [recentActivityLogs, setRecentActivityLogs] = useState([]);

    // تحديث الإعدادات والهوية عند تغيير الفصل أو الإعدادات
    useEffect(() => {
        const refreshIdentity = () => {
            try {
                setAppSettings(JSON.parse(localStorage.getItem('appSettings') || '{}'));
                setCurrentServant(JSON.parse(localStorage.getItem('currentServant') || '{}'));
                setCurrentSyncKey(String(localStorage.getItem('currentSyncKey') || ''));
            } catch (_e) {}
        };
        window.addEventListener('syncKey-changed', refreshIdentity);
        window.addEventListener('storage', refreshIdentity);
        return () => {
            window.removeEventListener('syncKey-changed', refreshIdentity);
            window.removeEventListener('storage', refreshIdentity);
        };
    }, []);

    // 1. جلب البيانات الموحدة (SSOT) من محرك الكنيسة
    const {
        canonicalData,
        allScopedChildren,
        classCounts,
        weekRange
    } = useChurchDataEngine();

    const { activityByClass } = useWeeklyClassActivity();
    const { urgentCases } = useUrgentInterventionAlerts('all');

    // 2. استخراج جميع الفصول وحساب النطاق الهرمي للخادم الحالي
    const allOsras = useMemo(() => {
        const extraKeys = canonicalData?.childrenByClassMap
            ? Array.from(canonicalData.childrenByClassMap.keys())
            : [];
        return extractAllOsrasFromSettings(appSettings, extraKeys);
    }, [appSettings, canonicalData]);

    const scope = useMemo(() => {
        return resolveServantNotificationScope(currentServant, allOsras, currentSyncKey);
    }, [currentServant, allOsras, currentSyncKey]);

    // 3. الاستماع اللحظي لإشعارات البث المباشر (System/broadcastNotifications)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const broadcastDocRef = doc(firestore, 'System', 'broadcastNotifications');
        const unsubscribe = onSnapshot(
            broadcastDocRef,
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    const items = Array.isArray(data?.items) ? data.items : [];
                    // ترتيب تنازلي حسب وقت الإرسال
                    const sorted = [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    setBroadcastList(sorted.slice(0, 30));
                } else {
                    setBroadcastList([]);
                }
            },
            (_err) => {
                // تجاهل أخطاء الأوفلاين بهدوء
            }
        );
        return () => unsubscribe();
    }, []);

    // 4. الاستماع اللحظي لسجل أنشطة الخدام (activityLogs) لإشعار أمين الخدمة وأمين المرحلة وزملاء الفصل
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const logsQuery = query(
                collection(firestore, 'activityLogs'),
                orderBy('clientTimestamp', 'desc'),
                limit(25)
            );
            const unsubscribe = onSnapshot(
                logsQuery,
                (snap) => {
                    const logs = [];
                    snap.forEach((docSnap) => {
                        logs.push({ id: docSnap.id, ...docSnap.data() });
                    });
                    setRecentActivityLogs(logs);
                },
                (_err) => {}
            );
            return () => unsubscribe();
        } catch (_e) {}
    }, []);

    // 5. بناء التقارير التفصيلية لكل فصل ولكل مرحلة (Class & Stage Detailed Reports)
    const {
        classReportsBySyncKey,
        stageBreakdowns,
        churchSummary
    } = useMemo(() => {
        const currentMonth = new Date().getMonth() + 1;
        const nowMs = Date.now();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

        const reportsMap = new Map();
        const childrenByClassMap = canonicalData?.childrenByClassMap || new Map();

        // ضمان وجود جميع الفصول المعرفة في الإعدادات أو في الداتا
        const allSyncKeysSet = new Set([
            ...allOsras.map(o => o.syncKey),
            ...Array.from(childrenByClassMap.keys())
        ]);

        for (const sk of allSyncKeysSet) {
            if (!sk || sk === 'MASTER_ACCESS' || sk === 'ADMIN_MODE' || sk === 'STAGE_ADMIN' || sk === 'all') continue;
            const osraInfo = scope.osraMapBySyncKey.get(sk) || {
                syncKey: sk,
                name: sk,
                stageName: 'خدمات أخرى'
            };
            const classKids = childrenByClassMap.get(sk) || [];
            const act = activityByClass[sk] || {};
            const totalChildren = classCounts[sk]?.total ?? classKids.length;
            const presentCount = Math.min(act.presentCount || 0, totalChildren);
            const liturgyCount = Math.min(act.liturgyCount || 0, totalChildren);
            const tasbehaCount = Math.min(act.tasbehaCount || 0, totalChildren);
            const visitedCount = Math.min(act.visitedCount || 0, totalChildren);
            const hasRecordedAttendance = Boolean(act.hasRecordedAttendance || presentCount > 0);
            const attendanceRate = totalChildren > 0 ? Math.round((presentCount / totalChildren) * 100) : 0;

            const whoAttendedServiceList = act.whoAttendedServiceList || [];
            const whoAbsentServiceList = act.whoAbsentServiceList || [];

            // المخدومون الذين يحتاجون افتقاد (غائبون هذا الأسبوع ولم يُفتقدوا خلال آخر 14 يوماً)
            const needsVisitationList = classKids.filter(child => {
                const lastVisMs = child.last_visited ? new Date(child.last_visited).getTime() : 0;
                const notVisitedRecently = !lastVisMs || isNaN(lastVisMs) || (nowMs - lastVisMs > fourteenDaysMs);
                return notVisitedRecently;
            });

            // الحالات الحرجة والتدخل العاجل في هذا الفصل
            const classUrgentCases = (urgentCases || []).filter(
                u => String(u.syncKey || '').trim() === sk
            );

            // أعياد ميلاد الشهر الحالي في هذا الفصل
            const birthdaysThisMonthList = classKids.filter(child => {
                if (!child.birthDate) return false;
                const parts = String(child.birthDate).split('-');
                if (parts.length >= 2) {
                    return parseInt(parts[1], 10) === currentMonth;
                }
                return false;
            });

            reportsMap.set(sk, {
                syncKey: sk,
                name: osraInfo.name || sk,
                stageName: osraInfo.stageName || 'خدمات أخرى',
                serviceName: osraInfo.serviceName || 'الخدمة',
                isThursday: isThursdayServiceClass(sk, osraInfo.name),
                totalChildren,
                presentCount,
                absentCount: Math.max(0, totalChildren - presentCount),
                liturgyCount,
                tasbehaCount,
                visitedCount,
                hasRecordedAttendance,
                attendanceRate,
                whoAttendedServiceList,
                whoAbsentServiceList,
                needsVisitationList,
                urgentCasesList: classUrgentCases,
                birthdaysThisMonthList
            });
        }

        // تجميع التقارير حسب المراحل الكنسية
        const stagesList = [];
        let churchTotalClasses = 0;
        let churchRecordedClasses = 0;
        let churchTotalChildren = 0;
        let churchTotalPresent = 0;
        let churchTotalLiturgy = 0;
        let churchTotalVisited = 0;
        let churchTotalUrgent = 0;

        for (const stageName of CHURCH_STAGES_ORDER) {
            const stageClassReports = Array.from(reportsMap.values()).filter(
                r => r.stageName === stageName
            );
            if (stageClassReports.length === 0) continue;

            const recordedClasses = stageClassReports.filter(c => c.hasRecordedAttendance);
            const unrecordedClasses = stageClassReports.filter(c => !c.hasRecordedAttendance);
            const totalKidsInStage = stageClassReports.reduce((sum, c) => sum + c.totalChildren, 0);
            const totalPresentInStage = stageClassReports.reduce((sum, c) => sum + c.presentCount, 0);
            const totalLiturgyInStage = stageClassReports.reduce((sum, c) => sum + c.liturgyCount, 0);
            const totalVisitedInStage = stageClassReports.reduce((sum, c) => sum + c.visitedCount, 0);
            const totalUrgentInStage = stageClassReports.reduce((sum, c) => sum + c.urgentCasesList.length, 0);
            const stageAttendanceRate = totalKidsInStage > 0
                ? Math.round((totalPresentInStage / totalKidsInStage) * 100)
                : 0;

            stagesList.push({
                stageName,
                totalClasses: stageClassReports.length,
                recordedClassesCount: recordedClasses.length,
                unrecordedClassesCount: unrecordedClasses.length,
                recordedClasses,
                unrecordedClasses,
                totalChildren: totalKidsInStage,
                presentCount: totalPresentInStage,
                liturgyCount: totalLiturgyInStage,
                visitedCount: totalVisitedInStage,
                urgentCount: totalUrgentInStage,
                attendanceRate: stageAttendanceRate,
                classes: stageClassReports
            });

            churchTotalClasses += stageClassReports.length;
            churchRecordedClasses += recordedClasses.length;
            churchTotalChildren += totalKidsInStage;
            churchTotalPresent += totalPresentInStage;
            churchTotalLiturgy += totalLiturgyInStage;
            churchTotalVisited += totalVisitedInStage;
            churchTotalUrgent += totalUrgentInStage;
        }

        return {
            classReportsBySyncKey: reportsMap,
            stageBreakdowns: stagesList,
            churchSummary: {
                totalClasses: churchTotalClasses,
                recordedClassesCount: churchRecordedClasses,
                unrecordedClassesCount: Math.max(0, churchTotalClasses - churchRecordedClasses),
                totalChildren: churchTotalChildren,
                presentCount: churchTotalPresent,
                liturgyCount: churchTotalLiturgy,
                visitedCount: churchTotalVisited,
                urgentCount: churchTotalUrgent,
                attendanceRate: churchTotalChildren > 0
                    ? Math.round((churchTotalPresent / churchTotalChildren) * 100)
                    : 0
            }
        };
    }, [canonicalData, allOsras, scope.osraMapBySyncKey, activityByClass, classCounts, urgentCases]);

    // 6. توليد قائمة الإشعارات المخصصة حسب المستوى الهرمي (4-Tier Scoped Notifications)
    const notifications = useMemo(() => {
        const list = [];
        const weekId = weekRange?.startDate || 'current-week';

        // ─── أ) إشعارات البث الإداري الفوري (Broadcasts) الموجهة لنطاق الخادم ───
        for (const b of broadcastList) {
            if (!doesBroadcastMatchScope(b, scope)) continue;
            const bId = `broadcast_${b.id}`;
            let targetBadge = 'كل خدام الكنيسة';
            if (b.targetType === 'stage') targetBadge = `مرحلة ${b.targetValue}`;
            else if (b.targetType === 'class') {
                const cObj = scope.osraMapBySyncKey.get(b.targetValue);
                targetBadge = `فصل ${cObj?.name || b.targetValue}`;
            }

            list.push({
                id: bId,
                fingerprint: bId,
                category: 'stage_admin',
                priority: b.urgent ? 'critical' : 'high',
                urgent: Boolean(b.urgent),
                icon: '📣',
                title: b.title || 'إشعار هام من قيادة الخدمة',
                body: b.body || '',
                meta: `مرسل بواسطة: ${b.senderName || 'أمين الخدمة'} • النطاق: ${targetBadge}`,
                timestamp: b.createdAt ? new Date(b.createdAt).toLocaleString('ar-EG') : 'الآن',
                shouldPushToMobile: true,
                url: '/#/'
            });
        }

        // ─── ب) المستوى الرابع: أمين الخدمة العام والأب الكاهن (ULTRA-DETAILED) ───
        if (scope.tier === 'master_detailed') {
            // 1. الملخص التنفيذي الشامل لحضور الكنيسة
            const allUnrecorded = stageBreakdowns.flatMap(s => s.unrecordedClasses);
            const allRecorded = stageBreakdowns.flatMap(s => s.recordedClasses);

            list.push({
                id: `master_exec_summary_${weekId}_${churchSummary.recordedClassesCount}_${churchSummary.presentCount}`,
                fingerprint: `master_exec_${weekId}_${churchSummary.recordedClassesCount}`,
                category: 'attendance',
                priority: 'high',
                urgent: false,
                icon: '👑',
                title: `التقرير التنفيذي الشامل للكنيسة (${churchSummary.recordedClassesCount}/${churchSummary.totalClasses} فصول سجلت الحضور)`,
                body: `إجمالي الحضور الموثق هذا الأسبوع: ${churchSummary.presentCount} من ${churchSummary.totalChildren} مخدوم (${churchSummary.attendanceRate}%) • القداس: ${churchSummary.liturgyCount} • الافتقاد الأسبوعي: ${churchSummary.visitedCount} مخدوم.`,
                meta: `دورة الأسبوع: الخميس ${weekRange.startDate} إلى الأربعاء ${weekRange.endDate}`,
                detailsList: stageBreakdowns.map(stg => ({
                    label: `مرحلة ${stg.stageName} (${stg.recordedClassesCount}/${stg.totalClasses} فصول)`,
                    value: `حضور: ${stg.presentCount}/${stg.totalChildren} (${stg.attendanceRate}%) • افتقاد: ${stg.visitedCount} • عاجل: ${stg.urgentCount}`,
                    status: stg.unrecordedClassesCount === 0 ? 'success' : 'warning',
                    subItems: stg.classes.map(c =>
                        `${c.hasRecordedAttendance ? '✅' : '⏳'} ${c.name}: حضور (${c.presentCount}/${c.totalChildren}) • قداس (${c.liturgyCount}) • افتقاد (${c.visitedCount})${c.urgentCasesList.length > 0 ? ` • 🚨 عاجل (${c.urgentCasesList.length})` : ''}`
                    )
                })),
                shouldPushToMobile: churchSummary.recordedClassesCount > 0,
                url: '/#/master-dashboard'
            });

            // 2. تنبيه الفصول التي لم تسجل الحضور هذا الأسبوع بعد (مفصل مرحلة بمرحلة)
            if (allUnrecorded.length > 0) {
                list.push({
                    id: `master_unrecorded_${weekId}_${allUnrecorded.length}`,
                    fingerprint: `master_unrecorded_${weekId}`,
                    category: 'attendance',
                    priority: 'critical',
                    urgent: true,
                    icon: '⏳',
                    title: `فصول لم تسجل الحضور هذا الأسبوع (${allUnrecorded.length} من ${churchSummary.totalClasses} فصول)`,
                    body: `الفصول المنتظر تسجيل حضورها: ${allUnrecorded.map(c => `${c.name} (${c.stageName})`).join('، ')}.`,
                    meta: 'متابعة تسجيل الحضور عبر المراحل',
                    detailsList: stageBreakdowns
                        .filter(s => s.unrecordedClasses.length > 0)
                        .map(s => ({
                            label: `مرحلة ${s.stageName} (${s.unrecordedClasses.length} فصول لم تسجل)`,
                            value: s.unrecordedClasses.map(c => `${c.name} (${c.totalChildren} مخدوم)`).join(' ، '),
                            status: 'warning'
                        })),
                    shouldPushToMobile: false,
                    url: '/#/master-dashboard'
                });
            }

            // 3. تنبيه حالات التدخل الرعوي العاجل والافتقاد لكل الكنيسة
            if (churchSummary.urgentCount > 0) {
                list.push({
                    id: `master_urgent_${weekId}_${churchSummary.urgentCount}`,
                    fingerprint: `master_urgent_${weekId}_${churchSummary.urgentCount}`,
                    category: 'visitation',
                    priority: 'critical',
                    urgent: true,
                    icon: '🚨',
                    title: `حالات التدخل الرعوي العاجل والافتقاد (${churchSummary.urgentCount} مخدومين في الكنيسة)`,
                    body: `يوجد ${churchSummary.urgentCount} مخدومين غائبين 3 أسابيع متتالية دون افتقاد أو يحتاجون رعاية أبوية عاجلة.`,
                    meta: 'تفصيل الحالات الحرجة حسب الفصل والمرحلة',
                    detailsList: stageBreakdowns
                        .filter(s => s.urgentCount > 0)
                        .map(s => ({
                            label: `مرحلة ${s.stageName} (${s.urgentCount} حالة عاجلة)`,
                            value: s.classes
                                .filter(c => c.urgentCasesList.length > 0)
                                .map(c => `${c.name}: ${c.urgentCasesList.map(u => u.name).join('، ')}`)
                                .join(' | '),
                            status: 'danger'
                        })),
                    shouldPushToMobile: true,
                    url: '/#/master-dashboard'
                });
            }

            // 4. كارت تفصيلي لكل مرحلة على حدة
            for (const stg of stageBreakdowns) {
                list.push({
                    id: `master_stage_card_${stg.stageName}_${weekId}_${stg.presentCount}`,
                    fingerprint: `master_stage_${stg.stageName}_${weekId}`,
                    category: 'stage_admin',
                    priority: 'normal',
                    urgent: false,
                    icon: '🏛️',
                    title: `تفصيل مرحلة ${stg.stageName}: سجل ${stg.recordedClassesCount}/${stg.totalClasses} فصول (${stg.presentCount}/${stg.totalChildren} مخدوم)`,
                    body: `نسبة الحضور في المرحلة: ${stg.attendanceRate}% • إجمالي الافتقاد: ${stg.visitedCount} • حالات عاجلة: ${stg.urgentCount}.`,
                    meta: `تشمل الفصول: ${stg.classes.map(c => c.name).join('، ')}`,
                    detailsList: stg.classes.map(c => ({
                        label: `${c.hasRecordedAttendance ? '✅' : '⏳'} ${c.name} (${c.isThursday ? 'خدمة خميس' : 'خدمة جمعة'})`,
                        value: `الحضور: ${c.presentCount}/${c.totalChildren} (${c.attendanceRate}%) • القداس: ${c.liturgyCount} • الافتقاد: ${c.visitedCount}`,
                        status: c.hasRecordedAttendance ? 'success' : 'warning',
                        subItems: c.whoAttendedServiceList.length > 0
                            ? [`👥 الحاضرون (${c.whoAttendedServiceList.length}): ${c.whoAttendedServiceList.map(k => k.name).join('، ')}`]
                            : ['لم يتم تسجيل حضور خدمة لهذا الفصل بعد']
                    })),
                    shouldPushToMobile: false,
                    url: '/#/master-dashboard'
                });
            }

            // 5. آخر التحركات اللحظية للخدام في الفصول (Audit Feed)
            const recentRelevantLogs = recentActivityLogs.slice(0, 6);
            if (recentRelevantLogs.length > 0) {
                const latestLog = recentRelevantLogs[0];
                list.push({
                    id: `master_live_feed_${latestLog.id}`,
                    fingerprint: `master_live_feed_${latestLog.id}`,
                    category: 'stage_admin',
                    priority: 'normal',
                    urgent: false,
                    icon: '⚡',
                    title: `متابعة لحظية لنشاط الخدام (${recentRelevantLogs.length} إجراءات حديثة)`,
                    body: `آخر نشاط: قام ${latestLog.servantName || 'خادم'} بـ "${latestLog.details || latestLog.actionType}"`,
                    meta: `بتوقيت: ${latestLog.dateKey || 'اليوم'}`,
                    detailsList: recentRelevantLogs.map(l => ({
                        label: `👤 ${l.servantName || 'خادم'} (${l.role || 'خادم'})`,
                        value: `${l.details || l.actionType} (${l.dateKey || ''})`,
                        status: 'info'
                    })),
                    shouldPushToMobile: false,
                    url: '/#/master-logs'
                });
            }
        }

        // ─── ج) المستوى الثالث والثاني: أمين مرحلة (DETAILED) وخادم مرحلة ───
        else if (scope.tier === 'stage_leader_detailed' || scope.tier === 'stage_servant') {
            const myStageObj = stageBreakdowns.find(s => s.stageName === scope.stageName) || {
                stageName: scope.stageName,
                totalClasses: 0,
                recordedClassesCount: 0,
                unrecordedClassesCount: 0,
                recordedClasses: [],
                unrecordedClasses: [],
                totalChildren: 0,
                presentCount: 0,
                liturgyCount: 0,
                visitedCount: 0,
                urgentCount: 0,
                attendanceRate: 0,
                classes: []
            };

            const scopedClasses = myStageObj.classes.length > 0
                ? myStageObj.classes
                : scope.allowedSyncKeys
                    .map(sk => classReportsBySyncKey.get(sk))
                    .filter(Boolean);

            const recCount = scopedClasses.filter(c => c.hasRecordedAttendance).length;
            const unrecClasses = scopedClasses.filter(c => !c.hasRecordedAttendance);
            const totKids = scopedClasses.reduce((s, c) => s + c.totalChildren, 0);
            const totPres = scopedClasses.reduce((s, c) => s + c.presentCount, 0);
            const totVis = scopedClasses.reduce((s, c) => s + c.visitedCount, 0);
            const totLit = scopedClasses.reduce((s, c) => s + c.liturgyCount, 0);
            const rate = totKids > 0 ? Math.round((totPres / totKids) * 100) : 0;

            // 1. ملخص المرحلة المفصل فصل بفصل
            list.push({
                id: `stage_summary_${scope.stageName}_${weekId}_${recCount}_${totPres}`,
                fingerprint: `stage_summary_${scope.stageName}_${weekId}_${recCount}`,
                category: 'attendance',
                priority: 'high',
                urgent: false,
                icon: '📊',
                title: `ملخص مرحلة ${scope.stageName}: ${recCount} من ${scopedClasses.length} فصول سجلوا الحضور`,
                body: `إجمالي حضور المرحلة هذا الأسبوع: ${totPres} من ${totKids} مخدوم (${rate}%) • حضور القداس: ${totLit} • الافتقاد: ${totVis} مخدوم.`,
                meta: `دورة الأسبوع: الخميس ${weekRange.startDate} إلى الأربعاء ${weekRange.endDate}`,
                detailsList: scopedClasses.map(c => ({
                    label: `${c.hasRecordedAttendance ? '✅' : '⏳'} ${c.name} (${c.isThursday ? 'خدمة خميس' : 'خدمة جمعة'})`,
                    value: `الحضور: ${c.presentCount}/${c.totalChildren} (${c.attendanceRate}%) • القداس: ${c.liturgyCount} • الافتقاد: ${c.visitedCount}`,
                    status: c.hasRecordedAttendance ? 'success' : 'warning',
                    subItems: c.whoAttendedServiceList.length > 0
                        ? [`👥 الحاضرون (${c.whoAttendedServiceList.length}): ${c.whoAttendedServiceList.map(k => k.name).join('، ')}`]
                        : ['لم يتم تسجيل حضور خدمة لهذا الفصل بعد']
                })),
                shouldPushToMobile: true,
                url: '/#/dashboard'
            });

            // 2. تنبيه الفصول التي لم تسجل الحضور في المرحلة
            if (unrecClasses.length > 0) {
                list.push({
                    id: `stage_unrecorded_${scope.stageName}_${weekId}_${unrecClasses.length}`,
                    fingerprint: `stage_unrecorded_${scope.stageName}_${weekId}`,
                    category: 'attendance',
                    priority: 'critical',
                    urgent: true,
                    icon: '⏳',
                    title: `فصول في مرحلة ${scope.stageName} لم تسجل الحضور بعد (${unrecClasses.length} فصول)`,
                    body: `الفصول التي لم تسجل الحضور هذا الأسبوع: ${unrecClasses.map(c => `${c.name} (${c.totalChildren} مخدوم)`).join('، ')}.`,
                    meta: 'يرجى تذكير خدام هذه الفصول بتسجيل الحضور',
                    detailsList: unrecClasses.map(c => ({
                        label: `⏳ ${c.name}`,
                        value: `إجمالي المخدومين المقيدين: ${c.totalChildren} مخدوم`,
                        status: 'warning'
                    })),
                    shouldPushToMobile: true,
                    url: '/#/dashboard'
                });
            }

            // 3. تفصيل الافتقاد والحالات الحرجة في كل فصل من فصول المرحلة
            const stageUrgentClasses = scopedClasses.filter(c => c.urgentCasesList.length > 0 || c.needsVisitationList.length > 0);
            if (stageUrgentClasses.length > 0) {
                const totalUrgentInScope = scopedClasses.reduce((s, c) => s + c.urgentCasesList.length, 0);
                const totalNeedsVisInScope = scopedClasses.reduce((s, c) => s + c.needsVisitationList.length, 0);
                list.push({
                    id: `stage_visitation_${scope.stageName}_${weekId}_${totalUrgentInScope}_${totalNeedsVisInScope}`,
                    fingerprint: `stage_visitation_${scope.stageName}_${weekId}_${totalUrgentInScope}`,
                    category: 'visitation',
                    priority: totalUrgentInScope > 0 ? 'critical' : 'high',
                    urgent: totalUrgentInScope > 0,
                    icon: '🏡',
                    title: `تقرير الافتقاد والمتابعة العاجلة لمرحلة ${scope.stageName}`,
                    body: `تم افتقاد ${totVis} مخدوم هذا الأسبوع • حالات غياب متكرر عاجلة: ${totalUrgentInScope} • مخدومون يحتاجون افتقاد: ${totalNeedsVisInScope}.`,
                    meta: 'تفصيل الافتقاد والمحتاجين للمتابعة في كل فصل بالمرحلة',
                    detailsList: scopedClasses.map(c => ({
                        label: `🏡 ${c.name} (تم افتقاد ${c.visitedCount} هذا الأسبوع)`,
                        value: `حالات عاجلة: ${c.urgentCasesList.length} • يحتاجون افتقاد: ${c.needsVisitationList.length}`,
                        status: c.urgentCasesList.length > 0 ? 'danger' : 'info',
                        subItems: [
                            ...(c.urgentCasesList.length > 0
                                ? [`🚨 غياب متكرر/تدخل عاجل: ${c.urgentCasesList.map(u => u.name).join('، ')}`]
                                : []),
                            ...(c.needsVisitationList.length > 0
                                ? [`📞 يحتاجون افتقاد (${c.needsVisitationList.length}): ${c.needsVisitationList.slice(0, 8).map(k => k.name).join('، ')}${c.needsVisitationList.length > 8 ? '...' : ''}`]
                                : [])
                        ]
                    })),
                    shouldPushToMobile: totalUrgentInScope > 0,
                    url: '/#/visitation'
                });
            }
        }

        // ─── د) المستوى الأول: خادم الفصل (CLASS SERVANT) ───
        else {
            const myClassReport = classReportsBySyncKey.get(scope.primarySyncKey) || {
                syncKey: scope.primarySyncKey,
                name: scope.primaryClassName,
                stageName: scope.stageName,
                isThursday: isThursdayServiceClass(scope.primarySyncKey, scope.primaryClassName),
                totalChildren: allScopedChildren.length,
                presentCount: 0,
                absentCount: allScopedChildren.length,
                liturgyCount: 0,
                visitedCount: 0,
                hasRecordedAttendance: false,
                attendanceRate: 0,
                whoAttendedServiceList: [],
                whoAbsentServiceList: [],
                needsVisitationList: [],
                urgentCasesList: [],
                birthdaysThisMonthList: []
            };

            // 1. حالة حضور الفصل هذا الأسبوع
            if (myClassReport.hasRecordedAttendance) {
                list.push({
                    id: `class_att_done_${myClassReport.syncKey}_${weekId}_${myClassReport.presentCount}`,
                    fingerprint: `class_att_done_${myClassReport.syncKey}_${weekId}`,
                    category: 'attendance',
                    priority: 'high',
                    urgent: false,
                    icon: '✅',
                    title: `تم تسجيل حضور فصل ${myClassReport.name} (${myClassReport.presentCount} / ${myClassReport.totalChildren})`,
                    body: `حضر الخدمة هذا الأسبوع ${myClassReport.presentCount} من إجمالي ${myClassReport.totalChildren} مخدوم (${myClassReport.attendanceRate}%) • حضور القداس: ${myClassReport.liturgyCount} • الغائبون: ${myClassReport.absentCount}.`,
                    meta: `دورة الأسبوع: الخميس ${weekRange.startDate} إلى الأربعاء ${weekRange.endDate}`,
                    detailsList: [
                        {
                            label: `👥 الحاضرون في الخدمة (${myClassReport.whoAttendedServiceList.length})`,
                            value: myClassReport.whoAttendedServiceList.map(c => c.name).join('، ') || 'لا يوجد',
                            status: 'success'
                        },
                        ...(myClassReport.whoAbsentServiceList.length > 0
                            ? [{
                                label: `😶 الغائبون عن الخدمة هذا الأسبوع (${myClassReport.whoAbsentServiceList.length})`,
                                value: myClassReport.whoAbsentServiceList.slice(0, 12).map(c => c.name).join('، ') + (myClassReport.whoAbsentServiceList.length > 12 ? '...' : ''),
                                status: 'warning'
                            }]
                            : [])
                    ],
                    shouldPushToMobile: false,
                    url: '/#/attendance'
                });
            } else {
                list.push({
                    id: `class_att_reminder_${myClassReport.syncKey}_${weekId}`,
                    fingerprint: `class_att_reminder_${myClassReport.syncKey}_${weekId}`,
                    category: 'attendance',
                    priority: 'critical',
                    urgent: true,
                    icon: '⏳',
                    title: `تذكير: لم يتم تسجيل حضور فصل (${myClassReport.name}) هذا الأسبوع بعد`,
                    body: `فصلك يضم ${myClassReport.totalChildren} مخدومين نشطين. اضغط هنا لتسجيل حضور ${myClassReport.isThursday ? 'خدمة الخميس' : 'خدمة الجمعة'} لأسبوع الخدمة الحالي.`,
                    meta: `أسبوع الخدمة يبدأ الخميس ${weekRange.startDate}`,
                    shouldPushToMobile: true,
                    url: '/#/attendance'
                });
            }

            // 2. مخدومو الفصل المحتاجون للافتقاد أو الغائبون 3 أسابيع
            if (myClassReport.urgentCasesList.length > 0 || myClassReport.needsVisitationList.length > 0) {
                const urgentNames = myClassReport.urgentCasesList.map(u => u.name).join('، ');
                const needsVisNames = myClassReport.needsVisitationList.slice(0, 6).map(k => k.name).join('، ');
                list.push({
                    id: `class_vis_${myClassReport.syncKey}_${weekId}_${myClassReport.urgentCasesList.length}_${myClassReport.needsVisitationList.length}`,
                    fingerprint: `class_vis_${myClassReport.syncKey}_${weekId}`,
                    category: 'visitation',
                    priority: myClassReport.urgentCasesList.length > 0 ? 'critical' : 'high',
                    urgent: myClassReport.urgentCasesList.length > 0,
                    icon: '🏡',
                    title: `متابعة الافتقاد في فصل ${myClassReport.name} (تم افتقاد ${myClassReport.visitedCount} هذا الأسبوع)`,
                    body: myClassReport.urgentCasesList.length > 0
                        ? `🚨 يوجد ${myClassReport.urgentCasesList.length} مخدومين غائبين 3 أسابيع متتالية يحتاجون افتقاد عاجل (${urgentNames}).`
                        : `يوجد ${myClassReport.needsVisitationList.length} مخدومين في فصلك لم يُفتقدوا منذ أكثر من أسبوعين (${needsVisNames}).`,
                    meta: 'اضغط للانتقال لصفحة الافتقاد الذكي',
                    detailsList: [
                        ...(myClassReport.urgentCasesList.length > 0
                            ? [{
                                label: `🚨 حالات غياب 3 أسابيع متتالية (${myClassReport.urgentCasesList.length})`,
                                value: urgentNames,
                                status: 'danger'
                            }]
                            : []),
                        ...(myClassReport.needsVisitationList.length > 0
                            ? [{
                                label: `📞 مخدومون في انتظار الافتقاد (${myClassReport.needsVisitationList.length})`,
                                value: myClassReport.needsVisitationList.slice(0, 10).map(k => k.name).join('، '),
                                status: 'info'
                            }]
                            : [])
                    ],
                    shouldPushToMobile: myClassReport.urgentCasesList.length > 0,
                    url: '/#/visitation'
                });
            }

            // 3. أعياد ميلاد الفصل هذا الشهر
            if (myClassReport.birthdaysThisMonthList.length > 0) {
                list.push({
                    id: `class_bday_${myClassReport.syncKey}_${new Date().getMonth() + 1}`,
                    fingerprint: `class_bday_${myClassReport.syncKey}_${new Date().getMonth() + 1}`,
                    category: 'stage_admin',
                    priority: 'normal',
                    urgent: false,
                    icon: '🎂',
                    title: `أعياد ميلاد هذا الشهر في فصل ${myClassReport.name} (${myClassReport.birthdaysThisMonthList.length} مخدومين)`,
                    body: `كل سنة وهم طيبين: ${myClassReport.birthdaysThisMonthList.map(k => k.name).join('، ')}. لا تنسَ تهنئتهم وافتقادهم!`,
                    meta: `مرحلة ${scope.stageName}`,
                    shouldPushToMobile: false,
                    url: '/#/'
                });
            }

            // 4. إشعار متابعة المرحلة التابع لها الخادم
            const myStageSummary = stageBreakdowns.find(s => s.stageName === scope.stageName);
            if (myStageSummary && myStageSummary.totalClasses > 1) {
                list.push({
                    id: `class_stage_info_${scope.stageName}_${weekId}_${myStageSummary.recordedClassesCount}`,
                    fingerprint: `class_stage_info_${scope.stageName}_${weekId}`,
                    category: 'stage_admin',
                    priority: 'normal',
                    urgent: false,
                    icon: '🏛️',
                    title: `متابعة مرحلة ${scope.stageName}: سجل الحضور ${myStageSummary.recordedClassesCount} من ${myStageSummary.totalClasses} فصول`,
                    body: `إجمالي حضور مرحلة ${scope.stageName} هذا الأسبوع: ${myStageSummary.presentCount} من ${myStageSummary.totalChildren} مخدوم (${myStageSummary.attendanceRate}%).`,
                    meta: `أنت خادم في مرحلة ${scope.stageName}`,
                    shouldPushToMobile: false,
                    url: '/#/'
                });
            }
        }

        return list.map(item => ({
            ...item,
            isRead: readIds.has(item.id)
        }));
    }, [
        broadcastList,
        scope,
        weekRange,
        stageBreakdowns,
        churchSummary,
        recentActivityLogs,
        classReportsBySyncKey,
        allScopedChildren,
        readIds
    ]);

    const unreadCount = useMemo(() => {
        return notifications.filter(n => !n.isRead).length;
    }, [notifications]);

    // 7. تحديث شارة أيقونة البرنامج على الموبايل وإطلاق إشعار الهاتف عند وصول إشعار جديد
    useEffect(() => {
        updateAppIconBadgeCount(unreadCount);

        if (permission !== 'granted') return;
        const pushable = notifications.filter(n => !n.isRead && n.shouldPushToMobile);
        if (pushable.length > 0) {
            const topNotif = pushable[0];
            dispatchNativeAppNotification({
                title: `${topNotif.icon || '🔔'} ${topNotif.title}`,
                body: topNotif.body,
                tag: topNotif.id,
                url: topNotif.url || '/#/',
                urgent: Boolean(topNotif.urgent),
                fingerprint: topNotif.fingerprint || topNotif.id
            });
        }
    }, [notifications, unreadCount, permission]);

    // 8. دوال تحديد الكل كمقروء وتفعيل الإشعارات وإرسال إشعار فوري للخدام
    const markAllAsRead = useCallback(() => {
        const allIds = notifications.map(n => n.id);
        const updatedSet = markNotificationsAsRead(allIds);
        setReadIds(new Set(updatedSet));
        updateAppIconBadgeCount(0);
    }, [notifications]);

    const markSingleAsRead = useCallback((id) => {
        if (!id) return;
        const updatedSet = markNotificationsAsRead([id]);
        setReadIds(new Set(updatedSet));
    }, []);

    const handleEnableNotifications = useCallback(async () => {
        const res = await requestAppNotificationPermission();
        setPermission(res);
        return res;
    }, []);

    const handleTestMobileNotification = useCallback(async () => {
        const topSummary = notifications[0]
            ? `${notifications[0].title} — ${notifications[0].body}`
            : `نطاق الإشعارات: ${scope.tierLabel}`;
        return sendTestMobileNotification(scope, topSummary);
    }, [notifications, scope]);

    const sendInstantBroadcast = useCallback(async ({
        title,
        body,
        targetType = 'all',
        targetValue = 'all',
        urgent = true
    }) => {
        if (!title?.trim() || !body?.trim()) {
            throw new Error('يرجى كتابة عنوان ونص الإشعار.');
        }

        const newBroadcast = {
            id: `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            title: title.trim(),
            body: body.trim(),
            targetType,
            targetValue,
            urgent: Boolean(urgent),
            senderName: scope.servantName || scope.roleTitle || 'قيادة الخدمة',
            senderRole: scope.roleTitle,
            createdAt: Date.now()
        };

        const broadcastDocRef = doc(firestore, 'System', 'broadcastNotifications');
        let existingItems = [];
        try {
            const snap = await getDoc(broadcastDocRef);
            if (snap.exists() && Array.isArray(snap.data()?.items)) {
                existingItems = snap.data().items;
            }
        } catch (_e) {}

        const updatedItems = [newBroadcast, ...existingItems].slice(0, 40);
        await setDoc(broadcastDocRef, {
            items: updatedItems,
            updatedAt: Date.now()
        }, { merge: true });

        logActivity(
            'SEND_BROADCAST_NOTIFICATION',
            `إرسال إشعار فوري: "${newBroadcast.title}" إلى (${targetType === 'all' ? 'كل الكنيسة' : targetValue})`
        );

        // إرسال إشعار فوري على موبايل المرسل أيضاً للتأكيد
        await dispatchNativeAppNotification({
            title: `📣 ${newBroadcast.title}`,
            body: newBroadcast.body,
            tag: newBroadcast.id,
            urgent: true,
            force: true
        });

        return newBroadcast;
    }, [scope]);

    return {
        scope,
        notifications,
        unreadCount,
        stageBreakdowns,
        classReportsBySyncKey,
        churchSummary,
        permission,
        markAllAsRead,
        markSingleAsRead,
        handleEnableNotifications,
        handleTestMobileNotification,
        sendInstantBroadcast
    };
}
