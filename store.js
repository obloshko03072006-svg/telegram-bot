const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "requests.json");

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ requests: [] }, null, 2),
      "utf8"
    );
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function upsertRequest(record) {
  const db = readDb();
  const idx = db.requests.findIndex(
    (r) => r.telegram_id === record.telegram_id
  );

  if (idx >= 0) {
    db.requests[idx] = {
      ...db.requests[idx],
      ...record,
      updated_at: new Date().toISOString(),
    };
  } else {
    db.requests.push({
      ...record,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  writeDb(db);
}

function getPendingRequests() {
  const db = readDb();
  return db.requests.filter((r) => r.status === "pending");
}

function updateRequestStatus(telegramId, status, extra = {}) {
  const db = readDb();
  const idx = db.requests.findIndex((r) => r.telegram_id === telegramId);

  if (idx === -1) return false;

  db.requests[idx] = {
    ...db.requests[idx],
    ...extra,
    status,
    updated_at: new Date().toISOString(),
  };

  writeDb(db);
  return true;
}

function updateRequest(telegramId, extra = {}) {
  const db = readDb();
  const idx = db.requests.findIndex((r) => r.telegram_id === telegramId);

  if (idx === -1) return false;

  db.requests[idx] = {
    ...db.requests[idx],
    ...extra,
    updated_at: new Date().toISOString(),
  };

  writeDb(db);
  return true;
}

function getApprovedUnsent() {
  const db = readDb();
  return db.requests.filter(
    (r) => r.status === "approved" && !r.access_sent
  );
}

function getRejectedUnsent() {
  const db = readDb();
  return db.requests.filter(
    (r) => r.status === "rejected" && !r.reject_sent
  );
}

function markAccessSent(telegramId) {
  const db = readDb();
  const idx = db.requests.findIndex((r) => r.telegram_id === telegramId);

  if (idx === -1) return false;

  db.requests[idx].access_sent = true;
  db.requests[idx].updated_at = new Date().toISOString();
  writeDb(db);
  return true;
}

function markRejectSent(telegramId) {
  const db = readDb();
  const idx = db.requests.findIndex((r) => r.telegram_id === telegramId);

  if (idx === -1) return false;

  db.requests[idx].reject_sent = true;
  db.requests[idx].updated_at = new Date().toISOString();
  writeDb(db);
  return true;
}

module.exports = {
  upsertRequest,
  getPendingRequests,
  updateRequestStatus,
  updateRequest,
  getApprovedUnsent,
  getRejectedUnsent,
  markAccessSent,
  markRejectSent,
};