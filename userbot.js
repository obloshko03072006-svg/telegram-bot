require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const {
  getPendingRequests,
  updateRequestStatus,
  updateRequest,
} = require("./store");

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
const session = new StringSession(process.env.TG_SESSION || "");
const affiliateBot = process.env.AFFILIATE_BOT_USERNAME || "PocketOptionOfficialBot";

const CHECK_INTERVAL_MS = 15000;
const WAIT_REPLY_MS = 4500;
const BETWEEN_REQUESTS_MS = 4000;
const POLL_STEP_MS = 900;

let client;

function parseResponse(text) {
  const raw = text || "";

  if (/user not found/i.test(raw) || /пользователь не найден/i.test(raw)) {
    return {
      type: "not_found",
      uid: null,
      linkType: "",
      raw,
    };
  }

  const uidMatch =
    raw.match(/UID:\s*(\d+)/i) ||
    raw.match(/Уникальный идентификатор\s*\(UID\):\s*(\d+)/i);

  const linkTypeMatch =
    raw.match(/Link type:\s*(.+)/i) ||
    raw.match(/Тип ссылки:\s*(.+)/i);

  if (uidMatch) {
    return {
      type: "user",
      uid: uidMatch[1].trim(),
      linkType: linkTypeMatch ? linkTypeMatch[1].trim() : "",
      raw,
    };
  }

  return {
    type: "unknown",
    uid: null,
    linkType: "",
    raw,
  };
}

async function findFreshReply(afterMessageId, expectedUid) {
  const maxChecks = Math.ceil(WAIT_REPLY_MS / POLL_STEP_MS);

  for (let i = 0; i < maxChecks; i++) {
    const messages = await client.getMessages(affiliateBot, { limit: 10 });

    const freshMessages = messages.filter((m) => m.id > afterMessageId);

    for (const msg of freshMessages) {
      const text = msg.message || "";
      const parsed = parseResponse(text);

      if (parsed.type === "not_found") {
        return parsed;
      }

      if (parsed.type === "user" && parsed.uid === expectedUid) {
        return parsed;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
  }

  return { type: "no_reply", raw: "" };
}

async function checkRequest(req) {
  try {
    updateRequest(req.telegram_id, {
      status: "checking",
      last_check_at: new Date().toISOString(),
    });

    console.log(`[CHECK] ID ${req.uid}`);

    const sentMessage = await client.sendMessage(affiliateBot, {
      message: `/user ${req.uid}`,
    });

    const parsed = await findFreshReply(sentMessage.id, req.uid);

    if (parsed.type === "not_found") {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: parsed.raw,
      });
      console.log(`[REJECT] ID ${req.uid}: user not found`);
      return;
    }

    if (parsed.type === "user") {
      const linkType = (parsed.linkType || "").toLowerCase();

      if (linkType.includes("registration") || linkType.includes("регистрац")) {
        updateRequestStatus(req.telegram_id, "approved", {
          affiliate_raw: parsed.raw,
          verified_uid: parsed.uid,
        });
        console.log(`[APPROVED] ID ${req.uid}`);
      } else {
        updateRequestStatus(req.telegram_id, "rejected", {
          affiliate_raw: parsed.raw,
          verified_uid: parsed.uid,
        });
        console.log(`[REJECT] ID ${req.uid}: wrong link type "${parsed.linkType}"`);
      }
      return;
    }

    updateRequestStatus(req.telegram_id, "rejected", {
      affiliate_raw: "No fresh valid reply from affiliate bot",
    });
    console.log(`[REJECT] ID ${req.uid}: no fresh valid reply`);
  } catch (error) {
    console.log(`[ERROR] ID ${req.uid}: ${error.message}`);
    updateRequestStatus(req.telegram_id, "rejected", {
      affiliate_raw: error.message,
    });
  }
}

async function loop() {
  const pending = getPendingRequests();

  if (!pending.length) {
    console.log("[LOOP] No pending requests");
    return;
  }

  console.log(`[LOOP] Pending requests: ${pending.length}`);

  for (const req of pending) {
    await checkRequest(req);
    await new Promise((resolve) => setTimeout(resolve, BETWEEN_REQUESTS_MS));
  }
}

async function main() {
  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start();
  console.log("Userbot is running...");

  await loop();
  setInterval(loop, CHECK_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Userbot fatal error:", err);
});