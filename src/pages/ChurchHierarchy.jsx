/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Church, UserCheck, Users, Shield, Cloud, ChevronDown, ChevronUp, ArrowRight, User } from 'lucide-react';
import { TENANT_CONFIG } from '../config/tenantConfig';

export default function ChurchHierarchy() {
    const [isOsrasOpen, setIsOsrasOpen] = useState(false);

    // 🌟 جلب إعدادات اللوجوهات من النظام (لو موجودة)
    const [appSettings, setAppSettings] = useState({ osraLogo: "", khedmaLogo: "" });
    useEffect(() => {
        const saved = localStorage.getItem('appSettings');
        if (saved) setAppSettings(JSON.parse(saved));
    }, []);

    // 🗂️ داتا الهيكل الإداري (تقدر تعدل الأسماء براحتك)
    const hierarchyData = {
        mainService: {
            name: "خدمة المرحلة الابتدائية",
            priest: "أبونا / (اكتب اسم الكاهن)",
            aminKhedma: "أستاذ / (اكتب اسم أمين الخدمة)",
            logo: appSettings.khedmaLogo || TENANT_CONFIG.DEFAULT_KHEDMA_LOGO
        },
        osras: [
            {
                id: 1,
                name: "أسرة القديسة دميانة",
                syncKey: "Cloud-Demiana-26",
                color: "pink",
                servants: [
                    { name: "تاسوني مريم", role: "أمينة الأسرة" },
                    { name: "تاسوني سارة", role: "خادمة" },
                    { name: "تاسوني حنة", role: "خادمة" }
                ]
            },
            {
                id: 2,
                name: "أسرة الأنبا موسى الأسود",
                syncKey: "Cloud-Mousa-26",
                color: "indigo",
                servants: [
                    { name: "أستاذ مينا", role: "أمين الأسرة" },
                    { name: "أستاذ جرجس", role: "خادم" },
                    { name: "خادم زيكا", role: "خادم تقني" }
                ]
            }
        ]
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-20" dir="rtl">
            {/* ─── الهيدر ─── */}
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-lg rounded-b-[2.5rem]">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button onClick={() => window.history.back()} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-all shrink-0">
                        <ArrowRight size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-black flex items-center gap-2 text-indigo-300">
                            <Church size={20} /> هيكل الخدمة والكنيسة
                        </h1>
                        <p className="text-xs font-bold text-slate-400">إدارة الأسر، الخدام، والمزامنة</p>
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-2xl mx-auto mt-6 animate-in slide-in-from-bottom-8 duration-500">

                {/* ─── كارت الخدمة الأم (الرئيسي) ─── */}
                <div
                    onClick={() => setIsOsrasOpen(!isOsrasOpen)}
                    className="bg-white rounded-[2.5rem] p-6 shadow-xl border-2 border-indigo-100 cursor-pointer hover:border-indigo-300 hover:shadow-indigo-500/20 transition-all duration-300 relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 w-full h-2 bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

                    <div className="flex flex-col items-center text-center mt-2">
                        {hierarchyData.mainService.logo ? (
                            <img
                                src={hierarchyData.mainService.logo}
                                alt="Service Logo"
                                className="w-24 h-24 rounded-full border-4 border-slate-50 shadow-md mb-4 object-cover group-hover:scale-105 transition-transform"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full border-4 border-slate-50 shadow-md mb-4 bg-indigo-100 flex items-center justify-center text-4xl font-black text-indigo-500 group-hover:scale-105 transition-transform">
                                {hierarchyData.mainService.name ? hierarchyData.mainService.name.charAt(0) : "خ"}
                            </div>
                        )}
                        <h2 className="text-2xl font-black text-slate-800 mb-4">{hierarchyData.mainService.name}</h2>

                        <div className="flex w-full gap-2">
                            <div className="flex-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                <Shield className="text-amber-500 mx-auto mb-1" size={20} />
                                <span className="block text-[10px] font-bold text-slate-400">أب الاعتراف / المسئول</span>
                                <span className="block text-sm font-black text-slate-700">{hierarchyData.mainService.priest}</span>
                            </div>
                            <div className="flex-1 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                <UserCheck className="text-blue-500 mx-auto mb-1" size={20} />
                                <span className="block text-[10px] font-bold text-slate-400">أمين الخدمة</span>
                                <span className="block text-sm font-black text-slate-700">{hierarchyData.mainService.aminKhedma}</span>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center gap-2 text-indigo-600 font-black bg-indigo-50 px-6 py-2 rounded-full">
                            {isOsrasOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            {isOsrasOpen ? 'إخفاء الأسر' : 'عرض الأسر التابعة للخدمة'}
                        </div>
                    </div>
                </div>

                {/* ─── الأسر التابعة (تظهر عند الضغط) ─── */}
                {isOsrasOpen && (
                    <div className="mt-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                        {hierarchyData.osras.map(osra => (
                            <div key={osra.id} className={`bg-white rounded-4xl p-5 border-2 shadow-lg border-${osra.color}-100 relative`}>
                                {/* بادچ الكلاود والمزامنة */}
                                <div className={`absolute -top-3 left-6 bg-${osra.color}-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-sm flex items-center gap-1`}>
                                    <Cloud size={12} /> كود الكلاود: {osra.syncKey}
                                </div>

                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4 mt-2">
                                    <div className={`w-12 h-12 rounded-2xl bg-${osra.color}-100 text-${osra.color}-600 flex items-center justify-center`}>
                                        <Users size={24} />
                                    </div>
                                    <div>
                                        <h3 className={`text-lg font-black text-${osra.color}-900`}>{osra.name}</h3>
                                        <p className="text-[10px] font-bold text-slate-500">قاعدة بيانات مفصولة تماماً بمفتاح المزامنة</p>
                                    </div>
                                </div>

                                {/* خدام الأسرة */}
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 mb-3 flex items-center gap-1">
                                        <User size={14} /> خدام الأسرة
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {osra.servants.map((servant, i) => (
                                            <div key={i} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col">
                                                <span className="text-[10px] font-bold text-indigo-400 mb-0.5">{servant.role}</span>
                                                <span className="text-xs font-black text-slate-700">{servant.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}