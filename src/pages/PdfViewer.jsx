import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';

export default function PdfViewer() {
    const location = useLocation();
    const navigate = useNavigate();

    // بنستقبل اللينك اللي جي من الهوم
    const { pdfUrl } = location.state || {};

    // لو مفيش لينك، نرجعه الهوم
    if (!pdfUrl) {
        navigate('/');
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col font-sans" dir="rtl">
            {/* شريط التحكم العلوي */}
            <header className="bg-slate-800 text-white p-4 sticky top-0 z-50 shadow-lg flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center hover:bg-slate-600 transition-all">
                        <ArrowRight size={20} />
                    </button>
                    <h1 className="text-sm md:text-lg font-black text-emerald-400">قارئ المناهج الذكي</h1>
                </div>
            </header>

            {/* مساحة عرض الـ PDF */}
            <main className="flex-1 flex flex-col items-center p-4 md:p-8 overflow-y-auto">
                <div className="bg-slate-800 rounded-xl shadow-2xl overflow-hidden w-full max-w-4xl p-2 md:p-4">
                    <iframe 
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`} 
                        className="w-full h-[80vh] border-none rounded-lg shadow-md bg-white" 
                        allowFullScreen
                        title="PDF Viewer"
                    ></iframe>
                </div>

                {/* رابط مباشر للتحميل لو الإطار معلق */}
                <div className="mt-6 flex justify-center">
                    <a 
                        href={pdfUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black transition-colors shadow-lg"
                    >
                        <Download size={18} />
                        اضغط هنا لتحميل الملف مباشرة
                    </a>
                </div>
            </main>
        </div>
    );
}