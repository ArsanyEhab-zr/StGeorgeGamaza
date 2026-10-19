export const compressImageToBase64 = (file, maxWidth = 600, maxHeight = 600, quality = 0.75) => {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("لم يتم تحديد ملف صورة"));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("فشل قراءة ملف الصورة"));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error("فشل معالجة الصورة"));
            img.onload = () => {
                let { width, height } = img;
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
};

export const uploadImageToCloudinary = async (file, resourceType = 'auto') => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary credentials are not configured in .env");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Upload failed");
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
};

/**
 * ⚡ Resilient Image Uploader:
 * 1. Checks online status; if offline, directly returns compressed Base64.
 * 2. If online, attempts CDN upload.
 * 3. If CDN upload fails, safely falls back to compressed Base64.
 */
export const uploadImageWithFallback = async (file, resourceType = 'auto') => {
    if (!navigator.onLine) {
        return await compressImageToBase64(file);
    }
    try {
        const secureUrl = await uploadImageToCloudinary(file, resourceType);
        if (secureUrl) return secureUrl;
    } catch (cdnError) {
        console.warn("CDN upload failed, seamlessly falling back to compressed Base64:", cdnError);
    }
    return await compressImageToBase64(file);
};

