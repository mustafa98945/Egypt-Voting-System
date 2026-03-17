const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * دالة رفع الملفات الديناميكية لـ Supabase Storage
 * @param {Buffer} fileBuffer - محتوى الصورة المعالج (Buffer)
 * @param {string} fileName - اسم الملف الفريد (يفضل شامل الـ Timestamp)
 * @param {string} folderName - الفولدر المستهدف (candidates أو voters)
 */
exports.uploadToSupabase = async (fileBuffer, fileName, folderName = 'candidates') => {
    // اسم الباكت الرئيسي (تأكد إنه Public في إعدادات Supabase)
    const bucketName = 'voters_cards'; 

    try {
        // 1. عملية الرفع إلى الـ Storage
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(`${folderName}/${fileName}`, fileBuffer, { 
                contentType: 'image/jpeg',
                upsert: true // تحديث الملف لو الاسم اتكرر بدل ما يرمي Error
            });

        if (error) {
            console.error('Supabase Upload Error:', error.message);
            throw new Error(`Supabase Error: ${error.message}`);
        }

        // 2. الحصول على الرابط العام (Public URL)
        const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(`${folderName}/${fileName}`);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('فشل في استخراج الرابط العام من Supabase');
        }

        return publicUrlData.publicUrl;

    } catch (err) {
        console.error('Helper Upload Error:', err.message);
        throw err;
    }
};