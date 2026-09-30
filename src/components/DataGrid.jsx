import React, { useState } from 'react';
import { db } from '../db/database';
import useAutoSync from '../hooks/useAutoSync';
import { Save } from 'lucide-react';

export default function DataGrid({ data, collectionName = 'children' }) {
    const { triggerAutoSync } = useAutoSync();
    const [saving, setSaving] = useState(false);
    const [localData, setLocalData] = useState(data || []);

    const handleCellChange = (id, field, value) => {
        setLocalData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const now = new Date().toISOString();
            for (const item of localData) {
                // Find what changed
                const original = data.find(d => d.id === item.id);
                if (JSON.stringify(original) !== JSON.stringify(item)) {
                    await db[collectionName].update(item.id, {
                        ...item,
                        isDirty: true,
                        updatedAt: now
                    });
                }
            }
            triggerAutoSync();
            alert("تم الحفظ بنجاح!");
        } catch (e) {
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e, rowIndex, colIndex) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRow = document.querySelector(`input[data-row="${rowIndex + 1}"][data-col="${colIndex}"]`);
            if (nextRow) nextRow.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevRow = document.querySelector(`input[data-row="${rowIndex - 1}"][data-col="${colIndex}"]`);
            if (prevRow) prevRow.focus();
        }
    };

    if (localData.length === 0) return <div className="p-4 text-center text-slate-500 font-bold">لا يوجد بيانات للعرض</div>;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden font-sans" dir="rtl">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-black text-slate-800">إدخال البيانات السريع</h3>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
                >
                    <Save size={16} /> {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-100 text-slate-700 font-black">
                        <tr>
                            <th className="p-3 border-b border-slate-200">الاسم</th>
                            <th className="p-3 border-b border-slate-200">النوع</th>
                            <th className="p-3 border-b border-slate-200">حضور القداس</th>
                            <th className="p-3 border-b border-slate-200">التحضير</th>
                            <th className="p-3 border-b border-slate-200">حضور اجتماع الخدمة</th>
                            <th className="p-3 border-b border-slate-200">مشارك بالافتقاد</th>
                            <th className="p-3 border-b border-slate-200">تاريخ الاعتراف</th>
                            <th className="p-3 border-b border-slate-200">حالة مرضية</th>
                        </tr>
                    </thead>
                    <tbody>
                        {localData.map((row, rowIndex) => (
                            <tr key={row.id} className="border-b border-slate-50 hover:bg-blue-50/50 transition-colors">
                                <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{row.name}</td>
                                <td className="p-2 whitespace-nowrap">{row.gender}</td>
                                <td className="p-2">
                                    <input 
                                        type="checkbox" 
                                        checked={!!row.massAttendance}
                                        onChange={(e) => handleCellChange(row.id, 'massAttendance', e.target.checked)}
                                        className="w-4 h-4 accent-blue-600"
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="checkbox" 
                                        checked={!!row.preparation}
                                        onChange={(e) => handleCellChange(row.id, 'preparation', e.target.checked)}
                                        className="w-4 h-4 accent-blue-600"
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="checkbox" 
                                        checked={!!row.serviceMeetingAttendance}
                                        onChange={(e) => handleCellChange(row.id, 'serviceMeetingAttendance', e.target.checked)}
                                        className="w-4 h-4 accent-blue-600"
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="checkbox" 
                                        checked={!!row.visitationParticipation}
                                        onChange={(e) => handleCellChange(row.id, 'visitationParticipation', e.target.checked)}
                                        className="w-4 h-4 accent-blue-600"
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="date"
                                        data-row={rowIndex}
                                        data-col={6}
                                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 6)}
                                        value={row.lastConfessionDate || ''}
                                        onChange={(e) => handleCellChange(row.id, 'lastConfessionDate', e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 w-full"
                                    />
                                </td>
                                <td className="p-2">
                                    <input 
                                        type="text"
                                        placeholder="ملاحظات طبية..."
                                        data-row={rowIndex}
                                        data-col={7}
                                        onKeyDown={(e) => handleKeyDown(e, rowIndex, 7)}
                                        value={row.medicalStatus?.notes || ''}
                                        onChange={(e) => handleCellChange(row.id, 'medicalStatus', { isSick: !!e.target.value, notes: e.target.value })}
                                        className="bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-500 w-full"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
