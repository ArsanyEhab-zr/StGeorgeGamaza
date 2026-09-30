import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
    const { pathname } = useLocation();

    useEffect(() => {
        // الكود ده بيخلي الشاشة تطلع لفوق خالص أول ما المسار يتغير
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'instant' // خليناها instant عشان تطلع فوراً من غير بطء
        });
    }, [pathname]);

    // الكومبوننت ده مش بيعرض أي حاجة في الشاشة، هو شغال في الخلفية بس
    return null;
}