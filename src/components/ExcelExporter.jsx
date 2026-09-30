import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../db/database';
import { Download, Loader2 } from 'lucide-react';

export default function ExcelExporter() {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            // 1. 🔐 جلب أطفال الأسرة الحالية بس من قاعدة البيانات
            const currentSyncKey = String(localStorage.getItem('currentSyncKey') || '');
            const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';
            const children = isMaster
                ? await db.children.toArray()
                : (!currentSyncKey ? [] : await db.children.where('syncKey').equals(currentSyncKey).toArray());

            if (children.length === 0) {
                alert("لا يوجد بيانات لتصديرها!");
                setIsExporting(false);
                return;
            }

            // 2. جلب إعدادات الأسر والخدمات من الـ LocalStorage عشان نترجم الـ syncKey لأسماء حقيقية
            const appSettings = JSON.parse(localStorage.getItem('appSettings')) || {};
            const services = appSettings.services || [];

            // 3. تجهيز الداتا للإكسيل بطريقة شيك ومفهومة
            const excelData = children.map(child => {

                // 🔍 البحث عن اسم الأسرة والخدمة بناءً على مفتاح الطفل
                let osraName = "غير محدد";
                let khedmaName = "غير محدد";

                services.forEach(service => {
                    const foundOsra = (service.osras || []).find(o => String(o.syncKey).trim() === String(child.syncKey).trim());
                    if (foundOsra) {
                        osraName = foundOsra.name;
                        khedmaName = service.name;
                    }
                });

                return {
                    "الاسم": child.name || "",
                    "النوع": child.gender || "",
                    "الخدمة التابع لها": khedmaName,
                    "الأسرة التابع لها": osraName,
                    "تليفون الأم": child.motherPhone || "",
                    "تليفون الأب": child.fatherPhone || "",
                    "تليفون المخدوم": child.childPhone || "",
                    "تليفون آخر": child.phone || "",
                    "تاريخ الميلاد": child.birthDate || "",
                    "المنطقة": child.address || "",
                    "العنوان بالتفصيل": child.detailedAddress || "",
                    "المواظبة (مرات الحضور)": child.streak || 0,
                    "وظيفة الأب": child.fatherJob || "",
                    "ملاحظات هامة": child.specialNotes || "",
                    "أب الاعتراف": child.fatherConfessor || "",
                    "مرسوم شماس": ((child.gender === 'boy' || child.gender === 'ولد') && child.isOrdained) ? "نعم" : "لا",
                    "الرتبة الشماسية": ((child.gender === 'boy' || child.gender === 'ولد') && child.isOrdained) ? (child.ordinationRank || "") : ""
                };
            });

            // 4. إنشاء ملف الإكسيل وتحميله
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "بيانات المخدومين");

            // تظبيط عرض العواميد عشان الكلام يبان
            const wscols = [
                { wch: 30 }, // الاسم
                { wch: 10 }, // النوع
                { wch: 25 }, // الخدمة التابع لها
                { wch: 25 }, // الأسرة التابع لها
                { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, // التليفونات (الأم، الأب، المخدوم، آخر)
                { wch: 15 }, // تاريخ الميلاد
                { wch: 20 }, // المنطقة
                { wch: 40 }, // العنوان بالتفصيل
                { wch: 25 }, // المواظبة (مرات الحضور)
                { wch: 20 }, // وظيفة الأب
                { wch: 40 }, // ملاحظات هامة
                { wch: 25 }, // أب الاعتراف
                { wch: 15 }, // مرسوم شماس
                { wch: 25 }  // الرتبة الشماسية
            ];
            worksheet['!cols'] = wscols;

            XLSX.writeFile(workbook, "كشف_بيانات_الكنيسة_الشامل.xlsx");

        } catch (err) {
            console.error("خطأ في تصدير الإكسيل:", err);
            alert("حدث خطأ أثناء استخراج البيانات!");
        }
        setIsExporting(false);
    };

    return (
        <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-black hover:bg-emerald-100 transition-all shadow-sm active:scale-95"
        >
            {isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            {isExporting ? 'جاري تجهيز الشيت...' : 'تحميل داتا الكنيسة (Excel)'}
        </button>
    );
}