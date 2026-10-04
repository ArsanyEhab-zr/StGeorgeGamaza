import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { AlertCircle, Stethoscope, Gift, UserMinus } from 'lucide-react';

export default function SmartAlerts() {
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

    const children = useLiveQuery(() => isMaster ? db.children.toArray() : db.children.where('syncKey').equals(currentSyncKey || '').toArray(), [currentSyncKey, isMaster]) || [];
    const attendance = useLiveQuery(() => isMaster ? db.attendance.toArray() : db.attendance.where('syncKey').equals(currentSyncKey || '').toArray(), [currentSyncKey, isMaster]) || [];

    const alerts = useMemo(() => {
        const appSettingsStr = localStorage.getItem('appSettings');
        const appSettings = appSettingsStr ? JSON.parse(appSettingsStr) : {};
        let activeServants = appSettings.servants || [];
        if (!isMaster) {
            activeServants = activeServants.filter(s => s.syncKey === currentSyncKey || s.osraName === currentSyncKey);
        }

        let generatedAlerts = [];
        const allPeople = [...children, ...activeServants];

        // 1. Birthdays (next 14 days)
        const today = new Date();
        const nextTwoWeeks = new Date();
        nextTwoWeeks.setDate(today.getDate() + 14);

        allPeople.forEach(person => {
            if (person.medicalStatus?.isSick) {
                generatedAlerts.push({
                    type: 'medical',
                    message: `${person.name} يحتاج افتقاد مرضي - ${person.medicalStatus.notes || ''}`,
                    priority: 'high',
                    icon: <Stethoscope size={18} />
                });
            }

            // Simple absence calculation (last 3 records)
            const personAttendance = attendance.filter(a => a.childId === person.id).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (personAttendance.length >= 3) {
                const last3 = personAttendance.slice(0, 3);
                if (last3.every(a => a.status === 'absent')) {
                    generatedAlerts.push({
                        type: 'absence',
                        message: `${person.name} تغيب لثلاث مرات متتالية!`,
                        priority: 'medium',
                        icon: <UserMinus size={18} />
                    });
                }
            }

            // Birthdays (simplified check, assumes proper Date format or simple extraction)
            // Warning: Arabic date parsing requires specific implementation. Assuming standard format for now.
            if (person.birthDate && typeof person.birthDate === 'string' && person.birthDate.includes('-')) {
                const [y, m, d] = person.birthDate.split('-').map(Number);
                if (m && d) {
                    const bDayThisYear = new Date(today.getFullYear(), m - 1, d);
                    const diffTime = bDayThisYear - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 14) {
                        generatedAlerts.push({
                            type: 'birthday',
                            message: `عيد ميلاد ${person.name} اقترب (بعد ${diffDays} يوم)!`,
                            priority: 'low',
                            icon: <Gift size={18} />
                        });
                    }
                }
            }
        });

        return generatedAlerts.sort((a, b) => {
            const pMap = { high: 1, medium: 2, low: 3 };
            return pMap[a.priority] - pMap[b.priority];
        });
    }, [children, servants, attendance]);

    if (alerts.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 no-print font-sans" dir="rtl">
            <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2">
                <AlertCircle className="text-red-500" /> تنبيهات ذكية ({alerts.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {alerts.map((alert, idx) => (
                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border ${
                        alert.priority === 'high' ? 'bg-red-50 border-red-100 text-red-800' :
                        alert.priority === 'medium' ? 'bg-yellow-50 border-yellow-100 text-yellow-800' :
                        'bg-blue-50 border-blue-100 text-blue-800'
                    }`}>
                        <div className={`p-2 rounded-full ${
                            alert.priority === 'high' ? 'bg-red-100' :
                            alert.priority === 'medium' ? 'bg-yellow-100' :
                            'bg-blue-100'
                        }`}>
                            {alert.icon}
                        </div>
                        <span className="font-bold text-sm">{alert.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
