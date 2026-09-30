import React from 'react';
import { Heart, Sparkles, Star } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="relative pb-28 pt-16 text-center flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-1000" dir="rtl">
            
            {/* 🌟 1. إضاءات الخلفية (Glowing Background Orbs) 🌟 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute top-0 right-10 w-32 h-32 bg-purple-500/20 rounded-full blur-[60px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-pink-500/10 rounded-full blur-[60px] pointer-events-none animate-bounce" style={{ animationDuration: '4s' }}></div>

            <div className="relative z-10 max-w-md mx-auto px-6 flex flex-col items-center gap-8 w-full">
                
                {/* 🌟 2. كارت الآية المشجعة (The Glowing Card) 🌟 */}
                <div className="group relative w-full cursor-default">
                    <div className="absolute -inset-0.5 bg-linear-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-3xl opacity-30 blur-md group-hover:opacity-75 transition-all duration-700 group-hover:duration-300"></div>
                    
                    <div className="relative bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center text-center transform transition-transform duration-500 group-hover:scale-[1.02]">
                        
                        <Sparkles className="absolute top-4 right-4 text-amber-300 w-5 h-5 animate-pulse" />
                        <Star className="absolute bottom-4 left-4 text-indigo-400 w-4 h-4 animate-bounce" style={{ animationDuration: '3s' }} />

                        <div className="bg-indigo-500/20 p-3 rounded-full mb-3 border border-indigo-500/30">
                            <span className="text-2xl drop-shadow-lg">🕊️</span>
                        </div>

                        <p className="font-black text-sm md:text-base text-transparent bg-clip-text bg-linear-to-br from-indigo-100 via-white to-purple-200 leading-loose mt-1">
                            "فَلاَ نَفْشَلْ فِي عَمَلِ الْخَيْرِ لأَنَّنَا سَنَحْصُدُ فِي وَقْتِهِ إِنْ كُنَّا لاَ نَكِلُّ."
                        </p>
                        
                        <div className="mt-5 px-4 py-1.5 bg-white/5 rounded-full border border-white/10 shadow-inner">
                            <p className="text-[10px] font-bold text-indigo-300 tracking-widest">(غلاطية 6: 9)</p>
                        </div>
                    </div>
                </div>

                {/* 🌟 3. حقوق الملكية (Neon Credits Pill) 🌟 */}
                <div className="relative group w-fit max-w-[95vw] mx-auto">
                    <div className="absolute -inset-1 bg-linear-to-r from-rose-500 via-fuchsia-500 to-indigo-500 rounded-full blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
                    
                    {/* هنا ظبطت الـ Flex عشان الجملة تترص صح 100% جنب بعضها */}
                    <div className="relative flex flex-wrap items-center justify-center gap-1.5 text-[12px] md:text-[13px] font-bold text-slate-200 bg-slate-900/90 backdrop-blur-md px-5 py-3.5 rounded-full border border-white/10 shadow-xl transition-all duration-300 group-hover:scale-105">
                        
                        <span>تم التطوير بكل حب</span>
                        
                        <Heart size={16} className="text-rose-500 fill-rose-500 animate-pulse drop-shadow-[0_0_8px_rgba(244,63,94,0.8)] mt-0.5" />
                        
                        <span>بواسطة</span>
                        
                        {/* 🌟 اسمك ستايل توقيع 🌟 */}
                        <span 
                            className="text-transparent bg-clip-text bg-linear-to-r from-amber-300 via-orange-400 to-rose-400 font-black italic tracking-wide px-1 drop-shadow-md text-[13px] md:text-[14.5px]" 
                            style={{ fontFamily: 'Tahoma, Arial, sans-serif' }}
                        >
                            أ. أرساني (Zika)
                        </span>
                        
                        <span className="text-slate-500 opacity-80" dir="ltr">© 2026</span>
                    </div>
                </div>

            </div>
        </footer>
    );
}