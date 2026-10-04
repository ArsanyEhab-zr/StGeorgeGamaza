import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Calendar, UserCheck, UserX, Clock } from 'lucide-react';

export default function TrackingDashboards() {
    const [activeTab, setActiveTab] = useState('visitation');
    
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

    const children = useLiveQuery(async () => {
        let kids = isMaster ? await db.children.toArray() : await db.children.where('syncKey').equals(currentSyncKey || '').toArray();
        kids = kids.filter(c => !c.isDeleted);
        
        if (isMaster) {
            const saved = localStorage.getItem('appSettings');
            const settings = saved ? JSON.parse(saved) : {};
            const allValidSyncKeys = (settings.services || []).flatMap(s => s.osras || []).map(o => o.syncKey);
            kids = kids.filter(c => allValidSyncKeys.includes(c.syncKey));
        }
        return kids;
    }, [currentSyncKey, isMaster]) || [];
    
    const appSettingsStr = localStorage.getItem('appSettings');
    const appSettings = appSettingsStr ? JSON.parse(appSettingsStr) : {};
    let servants = appSettings.servants || [];
    if (!isMaster) {
        servants = servants.filter(s => s.syncKey === currentSyncKey || s.osraName === currentSyncKey);
    }
    
    const allPeople = [...children, ...servants];

    const renderVisitation = () => {
        const recentlyVisited = allPeople.filter(p => p.visitationParticipation);
        const forgotten = allPeople.filter(p => !p.visitationParticipation);

        return (
            <div className="space-y-6">
                <div className="flex gap-4 mb-4 no-print">
                    <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-slate-900">
                        🖨️ طباعة التقرير
                    </button>
                </div>
                <div>
                    <h4 className="font-black text-green-700 bg-green-50 p-2 rounded-lg mb-2 flex items-center gap-2"><UserCheck size={18} /> تم الافتقاد حديثاً ({recentlyVisited.length})</h4>
                    <table className="w-full text-right text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-2 border-b">الاسم</th>
                                <th className="p-2 border-b">النوع</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentlyVisited.map(p => (
                                <tr key={p.id} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-bold">{p.name}</td>
                                    <td className="p-2">{p.gender}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h4 className="font-black text-red-700 bg-red-50 p-2 rounded-lg mb-2 flex items-center gap-2"><UserX size={18} /> منسي / يحتاج افتقاد ({forgotten.length})</h4>
                    <table className="w-full text-right text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-2 border-b">الاسم</th>
                                <th className="p-2 border-b">النوع</th>
                                <th className="p-2 border-b">رقم الهاتف</th>
                            </tr>
                        </thead>
                        <tbody>
                            {forgotten.map(p => (
                                <tr key={p.id} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-bold">{p.name}</td>
                                    <td className="p-2">{p.gender}</td>
                                    <td className="p-2" dir="ltr">{p.phone || 'غير مسجل'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderConfession = () => {
        const today = new Date();
        const overdue = allPeople.filter(p => {
            if (!p.lastConfessionDate) return true; // never confessed
            const cDate = new Date(p.lastConfessionDate);
            const diffDays = Math.ceil((today - cDate) / (1000 * 60 * 60 * 24));
            return diffDays > 45;
        });
        const active = allPeople.filter(p => !overdue.includes(p));

        return (
            <div className="space-y-6">
                <div className="flex gap-4 mb-4 no-print">
                    <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-slate-900">
                        🖨️ طباعة التقرير
                    </button>
                </div>
                <div>
                    <h4 className="font-black text-red-700 bg-red-50 p-2 rounded-lg mb-2 flex items-center gap-2"><Clock size={18} /> متأخر عن الاعتراف ({overdue.length})</h4>
                    <table className="w-full text-right text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-2 border-b">الاسم</th>
                                <th className="p-2 border-b">آخر اعتراف</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overdue.map(p => (
                                <tr key={p.id} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-bold">{p.name}</td>
                                    <td className="p-2 text-red-600 font-bold">{p.lastConfessionDate || 'لم يعترف من قبل'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div>
                    <h4 className="font-black text-green-700 bg-green-50 p-2 rounded-lg mb-2 flex items-center gap-2"><UserCheck size={18} /> مواظب ({active.length})</h4>
                    <table className="w-full text-right text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-2 border-b">الاسم</th>
                                <th className="p-2 border-b">آخر اعتراف</th>
                            </tr>
                        </thead>
                        <tbody>
                            {active.map(p => (
                                <tr key={p.id} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-bold">{p.name}</td>
                                    <td className="p-2 text-green-600 font-bold">{p.lastConfessionDate}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 font-sans" dir="rtl">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2 no-print">
                <Calendar className="text-indigo-600" /> لوحة المتابعة والتقارير
            </h2>
            
            <div className="flex gap-2 border-b border-slate-100 pb-4 mb-6 no-print">
                <button 
                    onClick={() => setActiveTab('visitation')}
                    className={`px-4 py-2 rounded-full font-black text-sm transition-all ${activeTab === 'visitation' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    تقرير الافتقاد
                </button>
                <button 
                    onClick={() => setActiveTab('confession')}
                    className={`px-4 py-2 rounded-full font-black text-sm transition-all ${activeTab === 'confession' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    تقرير الاعتراف
                </button>
            </div>

            <div className="print-only-container">
                {activeTab === 'visitation' ? renderVisitation() : renderConfession()}
            </div>
        </div>
    );
}
