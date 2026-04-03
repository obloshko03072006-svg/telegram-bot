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
const affiliateBot = process.env.AFFILIATE_BOT_USERNAME || "AffiliatePocketBot";

const MAX_ATTEMPTS = 4;
const CHECK_INTERVAL_MS = 15000;
const WAIT_REPLY_MS = 3500;
const BETWEEN_REQUESTS_MS = 4000;

let client;

function parseResponse(text) {
  if (!text) {
    return {
      ok: false,
      uid: null,
      linkType: "",
      raw: text || "",
    };
  }

  const uidMatch =
    text.match(/UID:\s*(\d+)/i) ||
    text.match(/Уникальный идентификатор\s*\(UID\):\s*(\d+)/i);

  const linkTypeMatch =
    text.match(/Link type:\s*(.+)/i) ||
    text.match(/Тип ссылки:\s*(.+)/i);

  return {
    ok: Boolean(uidMatch),
    uid: uidMatch ? uidMatch[1].trim() : null,
    linkType: linkTypeMatch ? linkTypeMatch[1].trim() : "",
    raw: text,
  };
}

async function findReplyByUid(uid) {
  const messages = await client.getMessages(affiliateBot, { limit: 10 });

  return messages.find((m) => {
    const text = m.message || "";
    return (
      text.includes(`UID: ${uid}`) ||
      text.includes(`UID:${uid}`) ||
      text.includes(`Уникальный идентификатор (UID): ${uid}`)
    );
  });
}

async function checkRequest(req) {
  try {
    const attempts = (req.attempts || 0) + 1;

    updateRequest(req.telegram_id, {
      status: "checking",
      attempts,
      last_check_at: new Date().toISOString(),
    });

    console.log(`Checking UID ${req.uid}, attempt ${attempts}/${MAX_ATTEMPTS}`);

    await client.sendMessage(affiliateBot, {
      message: `/user ${req.uid}`,
    });

    await new Promise((resolve) => setTimeout(resolve, WAIT_REPLY_MS));

    const reply = await findReplyByUid(req.uid);

    if (!reply || !reply.message) {
      if (attempts >= MAX_ATTEMPTS) {
        updateRequestStatus(req.telegram_id, "rejected", {
          affiliate_raw: "No valid reply found after several attempts",
        });
        console.log(`Rejected UID ${req.uid}: no reply`);
      } else {
        updateRequest(req.telegram_id, { status: "pending" });
        console.log(`No reply yet for UID ${req.uid}, back to pending`);
      }
      return;
    }

    const parsed = parseResponse(reply.message);

    if (!parsed.ok || parsed.uid !== req.uid) {
      if (attempts >= MAX_ATTEMPTS) {
        updateRequestStatus(req.telegram_id, "rejected", {
          affiliate_raw: reply.message,
        });
        console.log(`Rejected UID ${req.uid}: reply parse failed`);
      } else {
        updateRequest(req.telegram_id, { status: "pending" });
        console.log(`Reply parse failed for UID ${req.uid}, back to pending`);
      }
      return;
    }

    const linkType = parsed.linkType.toLowerCase();

    if (linkType.includes("registration") || linkType.includes("регистрац")) {
      updateRequestStatus(req.telegram_id, "approved", {
        affiliate_raw: parsed.raw,
        verified_uid: parsed.uid,
      });
      console.log(`Approved UID ${req.uid}`);
    } else {
      updateRequestStatus(req.telegram_id, "rejected", {
        affiliate_raw: parsed.raw,
        verified_uid: parsed.uid,
      });
      console.log(`Rejected UID ${req.uid}: wrong link type "${parsed.linkType}"`);
    }
  } catch (error) {
    console.log(`check error for UID ${req.uid}:`, error.message);
    updateRequest(req.telegram_id, { status: "pending" });
  }
}

async function loop() {
  const pending = getPendingRequests();

  if (!pending.length) return;

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

main().catch(console.error);