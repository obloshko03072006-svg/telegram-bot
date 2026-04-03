require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const {
  upsertRequest,
  getApprovedUnsent,
  getRejectedUnsent,
  markAccessSent,
  markRejectSent,
} = require("./store");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const userLang = {};
const userState = {};

function getTexts(lang = "ru") {
  return {
    chooseLanguage: "Выберите язык / Choose language",

    welcome:
      lang === "ru"
        ? "Добро пожаловать в Pocket Market Analyst.\n\nЧтобы получить доступ к платформе, подпишитесь на наш официальный канал."
        : "Welcome to Pocket Market Analyst.\n\nTo get access to the platform, please join our official channel.",

    joinChannel: lang === "ru" ? "🔗 Подписаться на канал" : "🔗 Join Channel",
    checkSubscription: lang === "ru" ? "✅ Проверить подписку" : "✅ Check Subscription",
    changeLanguage: lang === "ru" ? "🔄 Сменить язык" : "🔄 Change Language",

    subscriptionFail:
      lang === "ru"
        ? "❗ Чтобы продолжить, подпишитесь на канал."
        : "❗ You need to join the channel before continuing.",

    subscriptionError:
      lang === "ru"
        ? "Ошибка проверки подписки. Проверьте, что бот добавлен в канал как администратор."
        : "Subscription check error. Make sure the bot is added to the channel as an administrator.",

    afterSubscription:
      lang === "ru"
        ? "Подписка подтверждена ✅\n\nЧтобы получить доступ:\n\n1. Зарегистрируйтесь по ссылке\n2. Отправьте ваш ID\n\nЭто нужно для привязки аккаунта к системе."
        : "Subscription confirmed ✅\n\nTo get access:\n\n1. Register using the link\n2. Send your ID\n\nThis is required to connect your account to the system.",

    afterSubscriptionHint:
      lang === "ru"
        ? "Введите ID (только цифры)"
        : "Enter ID (numbers only)",

    register: lang === "ru" ? "🔗 Зарегистрироваться" : "🔗 Register",
    alreadyHaveAccount: lang === "ru" ? "❗ Уже есть аккаунт?" : "❗ Already have an account?",
    manager: lang === "ru" ? "👤 Менеджер" : "👤 Manager",

    invalidId:
      lang === "ru"
        ? "❗ Введите корректный ID (только цифры)"
        : "❗ Enter a valid ID (numbers only)",

    idReceived:
      lang === "ru"
        ? "ID получен ✅\n\nПроверяем..."
        : "ID received ✅\n\nChecking...",

    accessGranted:
      lang === "ru"
        ? "Доступ открыт ✅\n\nВаш аккаунт успешно подтверждён.\n\nТеперь вы можете перейти на платформу и использовать сигналы."
        : "Access granted ✅\n\nYour account has been successfully verified.\n\nYou can now open the platform and use the signals.",

    openPlatform: lang === "ru" ? "🚀 Открыть платформу" : "🚀 Open Platform",
    contactManager: lang === "ru" ? "👤 Менеджер" : "👤 Manager",

    idNotFound:
      lang === "ru"
        ? "ID не найден ❌\n\nПроверьте:\n— регистрировались ли вы по нашей ссылке\n— правильно ли указан ID\n\nВы можете отправить ID ещё раз или обратиться к менеджеру."
        : "ID not found ❌\n\nPlease check:\n— whether you registered using our link\n— whether the ID is correct\n\nYou can send the ID again or contact the manager.",

    step1Caption:
      lang === "ru"
        ? "Шаг 1. Нажмите на иконку профиля"
        : "Step 1. Tap the profile icon",

    step2Caption:
      lang === "ru"
        ? "Шаг 2. Скопируйте ваш ID из профиля"
        : "Step 2. Copy your ID from the profile",
  };
}

function sendLanguageSelector(chatId) {
  const t = getTexts("ru");

  bot.sendMessage(chatId, t.chooseLanguage, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇷🇺 Русский", callback_data: "lang_ru" }],
        [{ text: "🇬🇧 English", callback_data: "lang_en" }],
      ],
    },
  });
}

function sendSubscriptionMessage(chatId) {
  const lang = userLang[chatId] || "ru";
  const t = getTexts(lang);

  bot.sendMessage(chatId, t.welcome, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.joinChannel, url: process.env.CHANNEL_URL }],
        [{ text: t.checkSubscription, callback_data: "check_sub" }],
        [{ text: t.changeLanguage, callback_data: "change_lang" }],
      ],
    },
  });
}

function sendRegistrationStep(chatId) {
  const lang = userLang[chatId] || "ru";
  const t = getTexts(lang);

  userState[chatId] = "waiting_id";

  bot.sendMessage(chatId, t.afterSubscription, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.register, url: process.env.REFERRAL_URL }],
        [{ text: t.alreadyHaveAccount, url: process.env.ACCOUNT_HELP_POST_URL }],
        [{ text: t.manager, url: process.env.MANAGER_URL }],
      ],
    },
  });

  const step1Path = path.join(__dirname, "step1.png");
  const step2Path = path.join(__dirname, "step2.jpg");
  const media = [];

  if (fs.existsSync(step1Path)) {
    media.push({
      type: "photo",
      media: fs.createReadStream(step1Path),
      caption: t.step1Caption,
    });
  }

  if (fs.existsSync(step2Path)) {
    media.push({
      type: "photo",
      media: fs.createReadStream(step2Path),
      caption: t.step2Caption,
    });
  }

  if (media.length > 0) {
    bot.sendMediaGroup(chatId, media)
      .then(() => bot.sendMessage(chatId, t.afterSubscriptionHint))
      .catch((err) => {
        console.error("sendMediaGroup error:", err.message);
        bot.sendMessage(chatId, t.afterSubscriptionHint);
      });
  } else {
    bot.sendMessage(chatId, t.afterSubscriptionHint);
  }
}

function sendAccess(chatId) {
  const lang = userLang[chatId] || "ru";
  const t = getTexts(lang);

  bot.sendMessage(chatId, t.accessGranted, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.openPlatform, url: process.env.WEBSITE_URL }],
        [{ text: t.contactManager, url: process.env.MANAGER_URL }],
      ],
    },
  });
}

function sendReject(chatId) {
  const lang = userLang[chatId] || "ru";
  const t = getTexts(lang);

  bot.sendMessage(chatId, t.idNotFound, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.contactManager, url: process.env.MANAGER_URL }],
      ],
    },
  });
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = undefined;
  sendLanguageSelector(chatId);
});

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  try {
    if (data === "lang_ru") {
      userLang[chatId] = "ru";
      sendSubscriptionMessage(chatId);
    }

    if (data === "lang_en") {
      userLang[chatId] = "en";
      sendSubscriptionMessage(chatId);
    }

    if (data === "change_lang") {
      delete userLang[chatId];
      userState[chatId] = undefined;
      sendLanguageSelector(chatId);
    }

    if (data === "check_sub") {
      const member = await bot.getChatMember(process.env.CHANNEL_USERNAME, chatId);

      if (["member", "administrator", "creator"].includes(member.status)) {
        sendRegistrationStep(chatId);
      } else {
        const lang = userLang[chatId] || "ru";
        const t = getTexts(lang);
        bot.sendMessage(chatId, t.subscriptionFail);
      }
    }

    await bot.answerCallbackQuery(q.id);
  } catch (error) {
    console.error("callback_query error:", error.message);
    try {
      await bot.answerCallbackQuery(q.id);
    } catch {}
  }
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!text || text.startsWith("/")) return;

  const lang = userLang[chatId] || "ru";
  const t = getTexts(lang);

  if (userState[chatId] === "waiting_id") {
    if (!/^\d+$/.test(text)) {
      return bot.sendMessage(chatId, t.invalidId);
    }

    userState[chatId] = "checking";

    upsertRequest({
      telegram_id: chatId,
      uid: text,
      status: "pending",
      access_sent: false,
      reject_sent: false,
      attempts: 0,
    });

    bot.sendMessage(chatId, t.idReceived);
  }
});

setInterval(() => {
  const approved = getApprovedUnsent();

  approved.forEach((item) => {
    sendAccess(item.telegram_id);
    markAccessSent(item.telegram_id);
    userState[item.telegram_id] = "approved";
  });

  const rejected = getRejectedUnsent();

  rejected.forEach((item) => {
    sendReject(item.telegram_id);
    markRejectSent(item.telegram_id);
    userState[item.telegram_id] = "waiting_id";
  });
}, 5000);

console.log("Bot started 🚀");