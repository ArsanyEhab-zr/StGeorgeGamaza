import React, { useState } from 'react';
import { db } from '../db/database';
import { MapPin, UserPlus } from 'lucide-react';

import useAutoSync from '../hooks/useAutoSync';

const AddChild = () => {
    const [formData, setFormData] = useState({ name: '', phone: '', childPhone: '', lat: null, lng: null });
    const { triggerAutoSync } = useAutoSync();

    const captureLocation = () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            setFormData({ ...formData, lat: pos.coords.latitude, lng: pos.coords.longitude });
            alert("📍 تم تحديد موقع البيت بنجاح!");
        });
    };

    const saveChild = async () => {
        const syncKey = localStorage.getItem('currentSyncKey');
        const now = new Date().toISOString();
        await db.children.add({
            ...formData,
            streak: 0,
            syncKey,
            isDirty: true,
            updatedAt: now,
            isDeleted: false
        });
        triggerAutoSync();
        alert("تمت الإضافة بنجاح يا زيكا!");
    };

    return (
        <div className="p-6 bg-white rounded-3xl shadow-xl space-y-4">
            <input className="w-full p-4 bg-slate-50 rounded-2xl outline-none border focus:border-blue-500" placeholder="اسم المخدوم" onChange={e => setFormData({ ...formData, name: e.target.value })} />
            <input type="tel" className="w-full p-4 bg-slate-50 rounded-2xl outline-none border focus:border-blue-500" placeholder="تليفون المخدوم (اختياري)" onChange={e => setFormData({ ...formData, childPhone: e.target.value })} />
            <button onClick={captureLocation} className="w-full flex items-center justify-center gap-2 bg-green-50 text-green-700 p-4 rounded-2xl border-2 border-dashed border-green-200">
                <MapPin /> حفظ موقع البيت (GPS)
            </button>
            <button onClick={saveChild} className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                <UserPlus size={20} /> إضافة للخدمة
            </button>
        </div>
    );
};
export default AddChild;