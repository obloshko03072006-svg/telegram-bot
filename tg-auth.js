require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

async function main() {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH;

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Phone number: "),
    password: async () => await input.text("2FA password (if none, press Enter): "),
    phoneCode: async () => await input.text("Code from Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("\nTG_SESSION=");
  console.log(client.session.save());
  process.exit(0);
}

main();