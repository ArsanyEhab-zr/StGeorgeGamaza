export const parseEgyptianDate = (dateStr) => {
    if (!dateStr) return null;
    let str = String(dateStr).trim();

    // 1. Try numeric formats: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const numericMatch = str.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/);
    if (numericMatch) {
        return {
            day: parseInt(numericMatch[1], 10),
            month: parseInt(numericMatch[2], 10),
            year: parseInt(numericMatch[3], 10)
        };
    }

    // 2. Try messy text formats: DD Month YYYY (e.g., "7سبتمبر 2017")
    const arabicMonths = {
        'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'إبريل': 4, 'مايو': 5, 'يونيو': 6, 'يونيه': 6,
        'يوليو': 7, 'يوليه': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10,
        'نوفمبر': 11, 'ديسمبر': 12
    };

    const textMatch = str.match(/(\d{1,2})\s*([أ-يa-zA-Z]+)\s*(\d{4})/);
    if (textMatch) {
        const day = parseInt(textMatch[1], 10);
        const monthName = textMatch[2];
        const year = parseInt(textMatch[3], 10);
        
        let monthNum = 1;
        for (const [key, value] of Object.entries(arabicMonths)) {
            if (monthName.includes(key)) {
                monthNum = value;
                break;
            }
        }
        return { day, month: monthNum, year };
    }

    return null;
};

// Updated Age Calculator using the parsed data
export const calculateExactAge = (dateStr) => {
    const parsed = parseEgyptianDate(dateStr);
    if (!parsed) return "غير محدد";
    
    const today = new Date();
    let age = today.getFullYear() - parsed.year;
    const m = today.getMonth() + 1 - parsed.month;
    if (m < 0 || (m === 0 && today.getDate() < parsed.day)) {
        age--; // Subtract a year if birthday hasn't occurred yet this year
    }
    return age;
};
