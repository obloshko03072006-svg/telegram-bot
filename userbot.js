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
const WAIT_REPLY_MS = 3500;
const BETWEEN_REQUESTS_MS = 4000;

let client;

function parseResponse(text) {
  const raw = text || "";

  if (/user not found/i.test(raw) || /пользователь не найден/i.test(raw)) {
    return {
      ok: false,
      notFound: true,
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

  return {
    ok: Boolean(uidMatch),
    notFound: false,
    uid: uidMatch ? uidMatch[1].trim() : null,
    linkType: linkTypeMatch ? linkTypeMatch[1].trim() : "",
    raw,
  };
}

async function findLatestRelevantReply() {
  const messages = await client.getMessages(affiliateBot, { limit: 10 });

  return messages.find((m) => {
    const text = (m.message || "").toLowerCase();
    return (
      text.includes("uid:") ||
      text.includes("уникальный идентификатор") ||
      text.includes("user not found") ||
      text.includes("пользователь не найден")
    );
  });
}

async function checkRequest(req) {
  try {
    updateRequest(req.telegram_id, {
      status: "checking",
      last_check_at: new Date().toISOString(),
    });

    console.log(`[CHECK] UID ${req.uid}`);

    await client.sendMessage(affiliateBot, {
      message: `/user ${req.uid}`,
    });

    await new Promise((resolve) => setTimeout(resolve, WAIT_REPLY_MS));

    const reply = await findLatestRelevantReply();

    if (!reply || !reply.message) {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: "No valid reply from affiliate bot",
      });
      console.log(`[REJECT] UID ${req.uid}: no reply`);
      return;
    }

    console.log(`[RAW REPLY] ${reply.message}`);

    const parsed = parseResponse(reply.message);

    if (parsed.notFound) {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: parsed.raw,
      });
      console.log(`[REJECT] UID ${req.uid}: user not found`);
      return;
    }

    if (!parsed.ok || parsed.uid !== req.uid) {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: parsed.raw,
      });
      console.log(`[REJECT] UID ${req.uid}: parse failed`);
      return;
    }

    const linkType = (parsed.linkType || "").toLowerCase();

    if (linkType.includes("registration") || linkType.includes("регистрац")) {
      updateRequestStatus(req.telegram_id, "approved", {
        affiliate_raw: parsed.raw,
        verified_uid: parsed.uid,
      });
      console.log(`[APPROVED] UID ${req.uid}`);
    } else {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: parsed.raw,
        verified_uid: parsed.uid,
      });
      console.log(`[REJECT] UID ${req.uid}: wrong link type "${parsed.linkType}"`);
    }
  } catch (error) {
    console.log(`[ERROR] UID ${req.uid}: ${error.message}`);
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