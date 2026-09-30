import React, { useEffect, useRef } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { db } from '../db/database';

// 🌟 مدير الإشعارات الذكية
export default function NotificationManager() {
    const isInitialized = useRef(false);

    useEffect(() => {
        // حماية لمنع التنفيذ المزدوج بسبب React.StrictMode
        if (isInitialized.current) return;
        isInitialized.current = true;

        const initializeSmartNotifications = async () => {
            // 1. طلب الصلاحيات أولاً (إجباري للموبايل اندرويد 13+)
            if (Capacitor.isNativePlatform()) {
                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                   await LocalNotifications.requestPermissions();
                }
            }

            // --- 🤖 التراجع عن الإشعارات المعلقة القديمة لمنع التكرار (اختياري) ---
            // await LocalNotifications.cancel({ notifications: [...] })

            // --- التريجر 1: الاتصال بالإنترنت (Network Listener) ---
            Network.addListener('networkStatusChange', async (status) => {
                if (status.connected && Capacitor.isNativePlatform()) {
                    await LocalNotifications.schedule({
                        notifications: [{
                            title: '🌐 تم الاتصال بالإنترنت',
                            body: 'البرنامج متصل دلوقتي بفايربيز، جاري مزامنة بياناتك عشان متضيعش!',
                            id: 1001, // ID فريد لحدث النت
                            schedule: { at: new Date(Date.now() + 1000) },
                            smallIcon: 'ic_launcher'
                        }]
                    });
                }
            });

            // --- التريجر 2: تجهيز بيانات أعياد الميلاد والغياب (من Dexie) ---
            try {
                const today = new Date();
                const currentMonth = today.getMonth() + 1;
                const currentDay = today.getDate();
                
                // إضافة يوم عشان نحسب (بكرة)
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                const nextMonth = tomorrow.getMonth() + 1;
                const nextDay = tomorrow.getDate();

                const children = await db.children.toArray();
                let notificationsToSchedule = [];
                let idCounter = 2000; // مساحة لـ IDs الأبطال

                // جلب المخدوم المخصص للـ Sync Key الحالي (لو مقسومين أسر)
                // لكن هنا هنفحص الأطفال كلهم أو على حسب القواعد المتاحة
                const syncKey = localStorage.getItem('currentSyncKey');

                children.forEach(child => {
                    // عشان نطلع إشعارات لخدامه فقط (في حالة الأمناء) أو لو هو Super Admin يجيله كله
                    if (syncKey && syncKey !== 'MASTER_ACCESS' && syncKey !== 'ADMIN_MODE' && child.syncKey !== syncKey) {
                        return; // مش تبعه
                    }

                    // أعياد الميلاد 🎉
                    if (child.birthDate) {
                        const [, bMonth, bDay] = child.birthDate.split('-').map(Number);
                        
                        if (bMonth === currentMonth && bDay === currentDay) {
                            notificationsToSchedule.push({
                                title: '🎉 عيد ميلاد النهاردة!',
                                body: `النهاردة عيد ميلاد البطل [${child.name}]، ادخل هنيه!`,
                                id: idCounter++,
                                schedule: { at: new Date(Date.now() + 5000) },
                                smallIcon: 'ic_launcher'
                            });
                        } else if (bMonth === nextMonth && bDay === nextDay) {
                            notificationsToSchedule.push({
                                title: '🎉 عيد ميلاد بكرة!',
                                body: `بكرة عيد ميلاد البطل [${child.name}]، جهز له الهدية!`,
                                id: idCounter++,
                                schedule: { at: new Date(Date.now() + 7000) },
                                smallIcon: 'ic_launcher'
                            });
                        }
                    }

                    // الغياب الخطر (3 أسابيع = 21 يوم) ⚠️
                    // بنحسب من last_service كأقوى دليل
                    if (child.last_service) {
                        const lastServiceDate = new Date(child.last_service);
                        const daysAbsent = Math.floor((today - lastServiceDate) / (1000 * 60 * 60 * 24));
                        
                        if (daysAbsent >= 21) {
                            // هنتأكد بس إنه متسجلش ليه إشعار حديثاً عشان منصدعش الخادم
                            const absenceNotifKey = `absent_notified_${child.id}`;
                            const lastNotified = localStorage.getItem(absenceNotifKey);
                            const daysSinceLastNotified = lastNotified ? Math.floor((today - new Date(lastNotified)) / (1000 * 60 * 60 * 24)) : 100;

                            // بنفكر الخادم كل 7 أيام لو لسه غايب الخطر
                            if (daysSinceLastNotified >= 7) {
                                notificationsToSchedule.push({
                                    title: '⚠️ غياب خطر (افتقاد ضروري)',
                                    body: `المخدوم [${child.name}] غايب بقاله أكتر من 3 أسابيع! محتاج افتقاد ضروري.`,
                                    id: idCounter++,
                                    schedule: { at: new Date(Date.now() + 10000) },
                                    smallIcon: 'ic_launcher'
                                });
                                localStorage.setItem(absenceNotifKey, today.toISOString());
                            }
                        }
                    }
                });

                // --- التريجر 4: التحقق من وجود منهج متاح (Saturday Lesson) ---
                const appSettingsStr = localStorage.getItem('appSettings');
                if (appSettingsStr) {
                    const appSettings = JSON.parse(appSettingsStr);
                    // لو الأدمن حط تاريخ في الإعدادات أو غيره للمنهج الجديد
                    const lessonAvailableDate = appSettings?.lessonAvailableDate || ""; 
                    const lastSeenLesson = localStorage.getItem('lastSeenLessonDate');

                    if (lessonAvailableDate && lessonAvailableDate !== lastSeenLesson) {
                        notificationsToSchedule.push({
                            title: '📚 منهج الأسبوع نزل!',
                            body: 'تم رفع حبر وتأملات منهج السبت الجديد، ادخل جهز درسك يا خادم!',
                            id: 5001,
                            schedule: { at: new Date(Date.now() + 15000) },
                            smallIcon: 'ic_launcher'
                        });
                        // منع التكرار
                        localStorage.setItem('lastSeenLessonDate', lessonAvailableDate);
                    }
                }

                // تنفيذ جدولة الإشعارات إذا كنا على الموبايل وفي إشعارات مستحقة
                if (Capacitor.isNativePlatform() && notificationsToSchedule.length > 0) {
                    // بحد أقصى 10 إشعارات عشان نظام التشغيل ميعملش بلوك للأبلكيشن (SPAM)
                    await LocalNotifications.schedule({
                        notifications: notificationsToSchedule.slice(0, 10).map((n, i) => ({
                            ...n,
                            schedule: { at: new Date(Date.now() + (i * 2000) + 2000) } // فواصل زمنية ثانية بين الإشعار واللي بعده
                        }))
                    });
                }

            } catch (err) {
                console.error("Smart Notifications Error:", err);
            }
        };

        initializeSmartNotifications();

        // تنظيف الليسنر عند فك المكون
        return () => {
            Network.removeAllListeners();
        };
    }, []);

    // هذا المكون مخفي ولا يطبع أي شيء على الشاشة
    return null;
}
