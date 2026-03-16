const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * دالة رفع الملفات الديناميكية
 * @param {Buffer} fileBuffer - محتوى الصورة المعالج بـ sharp
 * @param {string} fileName - اسم الملف الفريد
 * @param {string} folderName - اسم الفولدر داخل الباكت (مثل candidates أو voters)
 */
exports.uploadToSupabase = async (fileBuffer, fileName, folderName = 'candidates') => {
    // اسم الباكت الرئيسي اللي إنت كريته في سوبابيس
    const bucketName = 'voters_cards'; 

    // 1. عملية الرفع
    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(`${folderName}/${fileName}`, fileBuffer, { 
            contentType: 'image/jpeg',
            upsert: true 
        });

    if (error) {
        console.error('Supabase Upload Error:', error.message);
        throw new Error('فشل رفع الملف إلى Supabase');
    }

    // 2. الحصول على الرابط العام
    const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(`${folderName}/${fileName}`);

    return publicUrlData.publicUrl;
};