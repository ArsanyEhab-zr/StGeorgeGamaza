import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCheck, MapPin, Award, Info, Home } from 'lucide-react';
import useSyncStatus from '../hooks/useSyncStatus';

export default function BottomNav() {
    const location = useLocation();
    const currentPath = location.pathname;
    const { status, dirtyCount, label } = useSyncStatus();

    const isFriday = new Date().getDay() === 5;

    // 🌟 تحديد إذا كان اللي فاتح هو أبونا / أدمن
    const currentSyncKey = localStorage.getItem('currentSyncKey');
    const isMaster = currentSyncKey === 'MASTER_ACCESS' || currentSyncKey === 'ADMIN_MODE';

    // 1. إخفاء الناف بار في الصفحة الرئيسية، الداشبورد، ولوحة الكاهن الشاملة
    if (currentPath === '/' || currentPath === '/dashboard' || currentPath === '/master-dashboard' || currentPath === '/parent-login' || currentPath === '/parent-dashboard') {
        return null;
    }

    // 2. إعدادات التابات مع الألوان المخصصة (Premium Coptic Orthodox Theme)
    const allNavItems = [
        { path: "/attendance", label: "الغياب", Icon: CheckCheck, colorClass: "bg-indigo-900", activeBg: "bg-indigo-900", shadow: "shadow-indigo-900/40" },
        { path: "/visitation", label: "الافتقاد", Icon: MapPin, colorClass: "bg-indigo-900", activeBg: "bg-indigo-900", shadow: "shadow-indigo-900/40" },
        { path: "/exams", label: "الامتحانات", Icon: Award, colorClass: "bg-indigo-900", activeBg: "bg-indigo-900", shadow: "shadow-indigo-900/40" },
        { path: "/info-directory", label: "الدليل", Icon: Info, colorClass: "bg-indigo-900", activeBg: "bg-indigo-900", shadow: "shadow-indigo-900/40" },
    ];

    // 3. تصفية التابات بذكاء حسب الصلاحيات واليوم
    let navItems = allNavItems;

    if (isMaster) {
        // 👑 لو أبونا: نخفي الغياب والافتقاد والجوائز، ونسيب "الدليل" بس
        navItems = allNavItems.filter(item => item.path === '/info-directory');
    } else {
        // 👨‍🏫 لو خادم عادي: لو مش يوم جمعة، نشيل تابة الغياب بس
        if (!isFriday) {
            navItems = navItems.filter(item => item.path !== '/attendance');
        }
    }

    // 🚦 3-state sync indicator config
    const indicatorConfig = {
        synced: {
            dotColor: 'bg-green-500',
            pingColor: 'bg-green-400',
            textColor: 'text-green-600',
            showPing: true,
            animateClass: 'animate-ping',
        },
        syncing: {
            dotColor: 'bg-amber-500',
            pingColor: 'bg-amber-400',
            textColor: 'text-amber-600',
            showPing: true,
            animateClass: 'animate-pulse',
        },
        offline: {
            dotColor: 'bg-red-500',
            pingColor: '',
            textColor: 'text-red-500',
            showPing: false,
            animateClass: '',
        },
    };

    const indicator = indicatorConfig[status];

    return (
        <div className="fixed bottom-[env(safe-area-inset-bottom,1rem)] left-0 right-0 z-[100] px-2 sm:px-4 flex justify-center pointer-events-none pb-2 sm:pb-4">
            {/* Premium Coptic Theme Glassmorphism Nav */}
            <nav className="bg-white/90 backdrop-blur-xl rounded-[2rem] border border-slate-200 shadow-2xl p-1.5 sm:p-2 pointer-events-auto flex items-center gap-1 sm:gap-2 flex-nowrap shrink-0 max-w-full overflow-x-auto no-scrollbar">

                {/* زرار الرجوع للرئيسية الثابت */}
                <Link
                    to="/"
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-indigo-900 flex items-center justify-center transition-colors shrink-0"
                    title="الرئيسية"
                    aria-label="العودة للرئيسية"
                >
                    <Home size={18} className="sm:hidden" />
                    <Home size={20} className="hidden sm:block" />
                </Link>

                {/* خط فاصل */}
                <div className="w-px h-6 sm:h-8 bg-slate-200 shrink-0"></div>

                {/* التابات المتمددة السحرية */}
                <div className="flex items-center gap-1 sm:gap-2 flex-nowrap">
                    {navItems.map((tab) => {
                        const isActive = currentPath === tab.path;

                        return (
                            <Link
                                key={tab.path}
                                to={tab.path}
                                aria-label={tab.label}
                                className={`
                                    group flex items-center justify-center h-10 sm:h-12 rounded-full overflow-hidden transition-all duration-500 ease-out shrink-0
                                    ${isActive ? `${tab.activeBg} shadow-xl ${tab.shadow}` : `bg-transparent hover:bg-slate-100 w-10 sm:w-12`}
                                `}
                            >
                                <div className={`flex items-center justify-center gap-1.5 whitespace-nowrap flex-nowrap ${isActive ? 'px-3 sm:px-4' : 'px-0'}`}>
                                    <tab.Icon size={18} className={`${isActive ? 'text-amber-500 w-4.5 h-4.5 sm:w-5 sm:h-5' : 'text-slate-400 group-hover:text-indigo-900 w-4.5 h-4.5 sm:w-5 sm:h-5'} transition-colors duration-300 shrink-0`} />

                                    {/* النص اللي بيظهر لما يتمدد */}
                                    <span className={`
                                        font-black text-[10px] sm:text-xs transition-all duration-500 overflow-hidden
                                        ${isActive ? 'text-white opacity-100 max-w-[100px] ml-1' : 'text-indigo-900 opacity-0 max-w-0'}
                                    `}>
                                        {tab.label}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {/* خط فاصل */}
                <div className="w-px h-6 sm:h-8 bg-slate-200 shrink-0"></div>

                {/* 🚦 مؤشر حالة المزامنة الذكي — 3 حالات (أخضر / أصفر / أحمر) */}
                <div 
                    className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-full select-none shrink-0" 
                    title={
                        status === 'synced' ? 'متصل ومتزامن بالكامل' : 
                        status === 'syncing' ? `جاري رفع ${dirtyCount} تعديل...` : 
                        'غير متصل بالإنترنت'
                    }
                >
                    <span className={`relative flex h-2 w-2 sm:h-2.5 sm:w-2.5`}>
                        {indicator.showPing && <span className={`${indicator.animateClass} absolute inline-flex h-full w-full rounded-full ${indicator.pingColor} opacity-75`}></span>}
                        <span className={`relative inline-flex rounded-full h-full w-full ${indicator.dotColor}`}></span>
                    </span>
                    <span className={`text-[9px] sm:text-[10px] font-black hidden xs:block ${indicator.textColor}`}>
                        {label}
                    </span>
                </div>
            </nav>
        </div>
    );
}