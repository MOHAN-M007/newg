"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const USERS_FILE = path.join(__dirname, "users.json");

// In-memory session tracking (authoritative)
const activeSessions = new Map(); // uid -> { socketId, roomCode|null, inMatch:bool }

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
  const raw = fs.readFileSync(USERS_FILE, "utf8");
  return JSON.parse(raw);
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function generateUID() {
  // UID: 12 chars, uppercase letters + digits
  return crypto.randomBytes(9).toString("base64").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
}

function generatePassword() {
  return crypto.randomBytes(24).toString("base64").slice(0, 18);
}

function hashPassword(password, salt) {
  const h = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256");
  return h.toString("hex");
}

function findUserByUID(uid) {
  const db = readUsers();
  return db.users.find(u => u.uid === uid) || null;
}

function verifyPassword(user, password) {
  const hash = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passHash, "hex"));
}

function loginWithUID(uid, password, socketId) {
  const user = findUserByUID(uid);
  if (!user) return { ok: false, error: "UID_NOT_FOUND" };
  if (!verifyPassword(user, password)) return { ok: false, error: "INVALID_PASSWORD" };

  // Enforce single device login
  if (activeSessions.has(uid)) return { ok: false, error: "UID_ALREADY_ACTIVE" };

  activeSessions.set(uid, { socketId, roomCode: null, inMatch: false });
  return { ok: true, user };
}

function logout(uid) {
  activeSessions.delete(uid);
}

function setSessionRoom(uid, roomCode, inMatch) {
  const sess = activeSessions.get(uid);
  if (!sess) return;
  sess.roomCode = roomCode;
  sess.inMatch = !!inMatch;
}

function isActive(uid) {
  return activeSessions.has(uid);
}

function isInMatch(uid) {
  const sess = activeSessions.get(uid);
  return !!(sess && sess.inMatch);
}

function getSession(uid) {
  return activeSessions.get(uid) || null;
}

function updateGamerTag(uid, gamerTag) {
  const db = readUsers();
  const user = db.users.find(u => u.uid === uid);
  if (!user) return false;
  user.gamerTag = gamerTag.slice(0, 24);
  writeUsers(db);
  return true;
}

function isValidPassword(password) {
  return /^[A-Za-z]{2}\d{4}[!@#$%^&*]{2}$/.test(password);
}

function isValidUID(uid) {
  return /^[A-Z0-9]{6,12}$/.test(uid);
}

function updateUID(oldUID, newUID) {
  const db = readUsers();
  if (!isValidUID(newUID)) return { ok: false, error: "INVALID_UID" };
  if (db.users.some(u => u.uid === newUID)) return { ok: false, error: "UID_TAKEN" };
  const user = db.users.find(u => u.uid === oldUID);
  if (!user) return { ok: false, error: "UID_NOT_FOUND" };

  user.uid = newUID;
  writeUsers(db);

  const sess = activeSessions.get(oldUID);
  if (sess) {
    activeSessions.delete(oldUID);
    activeSessions.set(newUID, sess);
  }
  return { ok: true, uid: newUID };
}

function adminChangePassword(uid, newPassword) {
  if (!isValidPassword(newPassword)) return { ok: false, error: "INVALID_PASSWORD_FORMAT" };
  const db = readUsers();
  const user = db.users.find(u => u.uid === uid);
  if (!user) return { ok: false, error: "UID_NOT_FOUND" };
  const salt = crypto.randomBytes(16).toString("hex");
  const passHash = hashPassword(newPassword, salt);
  user.salt = salt;
  user.passHash = passHash;
  writeUsers(db);
  return { ok: true };
}

module.exports = {
  loginWithUID,
  logout,
  setSessionRoom,
  isActive,
  isInMatch,
  getSession,
  updateGamerTag,
  updateUID,
  adminChangePassword,
  isValidPassword,
  isValidUID
};
