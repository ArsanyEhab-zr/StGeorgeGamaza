import CryptoJS from 'crypto-js';

// 🚨 المفتاح السري ده محدش يعرفه غيرك، وهو اللي بيقفل وبيفتح الداتا.
// تقدر تغيره لأي جملة معقدة براحتك، بس بمجرد ما ترفعه متغروش تاني عشان الداتا متضيعش!
// الكود هيسحب المفتاح من ملف البيئة المخفي
const SECRET_KEY = import.meta.env.VITE_ENCRYPTION_SECRET || "Fallback_Key_If_Env_Fails";

export const encryptData = (data) => {
    try {
        // بنحول الداتا لنص، وبعدين نشفرها
        const jsonStr = JSON.stringify(data);
        return CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
    } catch (error) {
        console.error("Encryption Error:", error);
        return null;
    }
};

export const decryptData = (ciphertext) => {
    try {
        // بنفك الشفرة، ونرجعها داتا أصلية
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedStr);
    } catch (error) {
        console.error("Decryption Error:", error);
        return null; // لو حصل مشكلة يرجع null بدل ما يضرب إيرور
    }
};