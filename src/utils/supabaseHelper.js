const { createClient } = require('@supabase/supabase-js');

// إعداد عميل Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * دالة رفع الملفات الديناميكية
 * @param {Buffer} fileBuffer - محتوى الصورة
 * @param {string} fileName - اسم الملف
 * @param {string} folderName - اسم الفولدر (الافتراضي candidates)
 */
exports.uploadToSupabase = async (fileBuffer, fileName, folderName = 'candidates') => {
    // 1. عملية الرفع مع تحديد المسار (Folder/File)
    const { data, error } = await supabase.storage
        .from('voters_cards') 
        .upload(`${folderName}/${fileName}`, fileBuffer, { 
            contentType: 'image/jpeg',
            upsert: true 
        });

    if (error) {
        console.error('Supabase Upload Error:', error.message);
        throw new Error('خطأ أثناء الرفع لـ Supabase: ' + error.message);
    }

    // 2. الحصول على الرابط العام بنفس المسار الديناميكي
    const { data: publicUrlData } = supabase.storage
        .from('voters_cards')
        .getPublicUrl(`${folderName}/${fileName}`);

    return publicUrlData.publicUrl;
};