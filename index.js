require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const userLang = {};

function sendLanguageSelector(chatId) {
  bot.sendMessage(chatId, "Выберите язык / Choose language", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇷🇺 Русский", callback_data: "lang_ru" }],
        [{ text: "🇬🇧 English", callback_data: "lang_en" }]
      ]
    }
  });
}

function sendSubscriptionMessage(chatId) {
  const lang = userLang[chatId];

  if (lang === "ru") {
    bot.sendMessage(
      chatId,
      "Добро пожаловать в Pocket Market Analyst.\n\nЧтобы получить доступ к платформе, подпишитесь на наш официальный канал.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Подписаться на канал", url: process.env.CHANNEL_URL }],
            [{ text: "✅ Проверить подписку", callback_data: "check_sub" }],
            [{ text: "🔄 Сменить язык", callback_data: "change_lang" }]
          ]
        }
      }
    );
  } else {
    bot.sendMessage(
      chatId,
      "Welcome to Pocket Market Analyst.\n\nTo access the platform, please join our official channel.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔗 Join Channel", url: process.env.CHANNEL_URL }],
            [{ text: "✅ Check Subscription", callback_data: "check_sub" }],
            [{ text: "🔄 Change Language", callback_data: "change_lang" }]
          ]
        }
      }
    );
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  if (!userLang[chatId]) {
    sendLanguageSelector(chatId);
  } else {
    sendSubscriptionMessage(chatId);
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

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
    sendLanguageSelector(chatId);
  }

  if (data === "check_sub") {
    try {
      const member = await bot.getChatMember(
        process.env.CHANNEL_USERNAME,
        chatId
      );

      if (["member", "administrator", "creator"].includes(member.status)) {
        const lang = userLang[chatId] || "en";
        const buttonText =
          lang === "ru" ? "🚀 Открыть платформу" : "🚀 Open Platform";
        const successText =
          lang === "ru"
            ? "Доступ открыт ✅\n\nТеперь вы можете перейти на платформу."
            : "Access granted ✅\n\nYou can now open the platform.";

        bot.sendMessage(chatId, successText, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: buttonText,
                  url: `${process.env.WEBSITE_URL}/signal?access=demo_access_token&lang=${lang}`
                }
              ]
            ]
          }
        });
      } else {
        const lang = userLang[chatId] || "en";
        const failText =
          lang === "ru"
            ? "❗ Чтобы продолжить, необходимо подписаться на канал."
            : "❗ You need to join the channel before continuing.";

        sendSubscriptionMessage(chatId);
        bot.sendMessage(chatId, failText);
      }
    } catch (error) {
      const lang = userLang[chatId] || "en";
      const errorText =
        lang === "ru"
          ? "Ошибка проверки подписки. Проверьте, что бот добавлен в канал как администратор."
          : "Subscription check error. Make sure the bot is added to the channel as an administrator.";

      bot.sendMessage(chatId, errorText);
    }
  }

  bot.answerCallbackQuery(query.id);
});

console.log("Bot is running...");