"use strict";

const { Server } = require("socket.io");
const {
  loginFirstTime,
  loginWithUID,
  logout,
  setSessionRoom,
  isActive,
  isInMatch,
  getSession,
  updateGamerTag,
  handleFirstLoginEmail
} = require("./auth");

const {
  createRoom,
  getRoom,
  updateRoom,
  removeRoom,
  joinRoom,
  leaveRoom,
  setDifficulty,
  startMatch,
  moveActiveBlock,
  addScore,
  getDifficultySettings,
  endMatch
} = require("./rooms");

const TICK_BASE_MS = 1000;
const MIN_CLICK_INTERVAL_MS = 40;

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  // Basic per-uid anti-spam
  const lastClickAt = new Map();

  io.on("connection", (socket) => {
    socket.on("auth:first_login", async (payload, cb) => {
      try {
        const email = String(payload.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) return cb({ ok: false, error: "INVALID_EMAIL" });

        const res = loginFirstTime(email);
        if (!res.ok) return cb(res);

        await handleFirstLoginEmail(email, res.user.uid, res.password);
        return cb({ ok: true, uid: res.user.uid });
      } catch (e) {
        return cb({ ok: false, error: "EMAIL_SEND_FAILED" });
      }
    });

    socket.on("auth:login", (payload, cb) => {
      const uid = String(payload.uid || "").trim().toUpperCase();
      const password = String(payload.password || "");
      if (!uid || !password) return cb({ ok: false, error: "MISSING_FIELDS" });

      if (isActive(uid)) return cb({ ok: false, error: "UID_ALREADY_ACTIVE" });
      if (isInMatch(uid)) return cb({ ok: false, error: "UID_IN_MATCH" });

      const res = loginWithUID(uid, password, socket.id);
      if (!res.ok) return cb(res);

      socket.data.uid = uid;
      return cb({ ok: true, user: { uid: res.user.uid, gamerTag: res.user.gamerTag } });
    });

    socket.on("auth:logout", (payload, cb) => {
      const uid = socket.data.uid;
      if (uid) logout(uid);
      socket.data.uid = null;
      cb({ ok: true });
    });

    socket.on("profile:update", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });
      const gamerTag = String(payload.gamerTag || "").trim();
      if (!gamerTag) return cb({ ok: false, error: "INVALID_GAMERTAG" });
      updateGamerTag(uid, gamerTag);
      cb({ ok: true, gamerTag });
    });

    socket.on("room:create", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });
      if (isInMatch(uid)) return cb({ ok: false, error: "UID_IN_MATCH" });

      const name = String(payload.name || "Arcade Room").trim();
      const room = createRoom({ name, creatorUID: uid });

      setSessionRoom(uid, room.code, false);
      socket.join(room.code);

      cb({ ok: true, room });
      io.to(room.code).emit("room:update", sanitizeRoom(room));
    });

    socket.on("room:join", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });
      if (isInMatch(uid)) return cb({ ok: false, error: "UID_IN_MATCH" });

      const code = String(payload.code || "").trim().toUpperCase();
      const res = joinRoom(code, uid);
      if (!res.ok) return cb(res);

      setSessionRoom(uid, code, false);
      socket.join(code);

      cb({ ok: true, room: res.room });
      io.to(code).emit("room:update", sanitizeRoom(res.room));
    });

    socket.on("room:leave", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });

      const sess = getSession(uid);
      if (!sess || !sess.roomCode) return cb({ ok: false, error: "NOT_IN_ROOM" });

      const code = sess.roomCode;
      const room = getRoom(code);
      if (room && room.status === "IN_MATCH") {
        // Forfeit if leaving mid-match
        const winner = room.players.find(p => p !== uid);
        if (winner) endMatch(room, winner);
        room.players.forEach(p => setSessionRoom(p, room.code, false));
        io.to(code).emit("match:end", buildMatchState(room));
      }

      socket.leave(code);
      setSessionRoom(uid, null, false);

      const updated = leaveRoom(code, uid);
      if (updated) io.to(code).emit("room:update", sanitizeRoom(updated));
      else io.to(code).emit("room:closed");

      cb({ ok: true });
    });

    socket.on("room:set_difficulty", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });

      const sess = getSession(uid);
      if (!sess || !sess.roomCode) return cb({ ok: false, error: "NOT_IN_ROOM" });

      const difficulty = String(payload.difficulty || "").trim().toLowerCase();
      const res = setDifficulty(sess.roomCode, difficulty, uid);
      if (!res.ok) return cb(res);

      cb({ ok: true, room: res.room });
      io.to(sess.roomCode).emit("room:update", sanitizeRoom(res.room));
    });

    socket.on("room:start_match", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });

      const sess = getSession(uid);
      if (!sess || !sess.roomCode) return cb({ ok: false, error: "NOT_IN_ROOM" });

      const res = startMatch(sess.roomCode, uid);
      if (!res.ok) return cb(res);

      const room = res.room;
      room.players.forEach(p => setSessionRoom(p, room.code, true));

      cb({ ok: true, room: sanitizeRoom(room) });
      io.to(room.code).emit("match:start", buildMatchState(room));
      startMatchLoop(io, room.code);
    });

    socket.on("room:sync", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });
      const sess = getSession(uid);
      if (!sess || !sess.roomCode) return cb({ ok: false, error: "NOT_IN_ROOM" });
      const room = getRoom(sess.roomCode);
      if (!room) return cb({ ok: false, error: "ROOM_NOT_FOUND" });
      cb({ ok: true, room: sanitizeRoom(room), match: buildMatchState(room) });
    });

    socket.on("game:click", (payload, cb) => {
      const uid = socket.data.uid;
      if (!uid) return cb({ ok: false, error: "UNAUTHENTICATED" });

      const sess = getSession(uid);
      if (!sess || !sess.roomCode) return cb({ ok: false, error: "NOT_IN_ROOM" });

      const room = getRoom(sess.roomCode);
      if (!room || room.status !== "IN_MATCH") return cb({ ok: false, error: "NO_ACTIVE_MATCH" });
      if (!room.players.includes(uid)) return cb({ ok: false, error: "NOT_IN_MATCH" });

      const now = Date.now();
      const last = lastClickAt.get(uid) || 0;
      if (now - last < MIN_CLICK_INTERVAL_MS) {
        return cb({ ok: false, error: "CLICK_RATE_LIMIT" });
      }
      lastClickAt.set(uid, now);

      const idx = Number(payload.index);
      const maxIdx = room.match.gridSize * room.match.gridSize - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx > maxIdx) {
        return cb({ ok: false, error: "INVALID_INDEX" });
      }

      const activeIndex = room.match.activeBlock[uid];
      if (idx === activeIndex) {
        addScore(room, uid, 5);
        moveActiveBlock(room, uid);
        updateRoom(room);
      }

      const scores = room.match.scores;
      const winnerUID = Object.keys(scores).find(k => scores[k] >= 100) || null;
      if (winnerUID) {
        endMatch(room, winnerUID);
        room.players.forEach(p => setSessionRoom(p, room.code, false));
        io.to(room.code).emit("match:end", buildMatchState(room));
        return cb({ ok: true, scored: idx === activeIndex });
      }

      io.to(room.code).emit("match:update", buildMatchState(room));
      cb({ ok: true, scored: idx === activeIndex });
    });

    socket.on("disconnect", () => {
      const uid = socket.data.uid;
      if (!uid) return;

      const sess = getSession(uid);
      if (sess && sess.roomCode) {
        const room = getRoom(sess.roomCode);
        if (room) {
          if (room.status === "IN_MATCH") {
            const winner = room.players.find(p => p !== uid);
            if (winner) {
              endMatch(room, winner);
              room.players.forEach(p => setSessionRoom(p, room.code, false));
              io.to(room.code).emit("match:end", buildMatchState(room));
            }
          }

          const updated = leaveRoom(sess.roomCode, uid);
          if (updated) io.to(sess.roomCode).emit("room:update", sanitizeRoom(updated));
          else io.to(sess.roomCode).emit("room:closed");
        }
      }
      logout(uid);
    });
  });
}

const matchLoops = new Map();

function startMatchLoop(io, code) {
  if (matchLoops.has(code)) return;

  const room = getRoom(code);
  if (!room) return;
  const diff = getDifficultySettings(room);
  const interval = diff.randomized ? 350 : Math.max(200, Math.floor(TICK_BASE_MS / diff.ticksPerSecond));

  const tick = () => {
    const current = getRoom(code);
    if (!current || current.status !== "IN_MATCH") {
      clearInterval(matchLoops.get(code));
      matchLoops.delete(code);
      return;
    }
    const d = getDifficultySettings(current);
    if (d.randomized) {
      if (Math.random() < 0.6) {
        current.players.forEach(uid => moveActiveBlock(current, uid));
        updateRoom(current);
        io.to(code).emit("match:update", buildMatchState(current));
      }
      return;
    }

    current.players.forEach(uid => moveActiveBlock(current, uid));
    updateRoom(current);
    io.to(code).emit("match:update", buildMatchState(current));
  };

  const timer = setInterval(tick, interval);
  matchLoops.set(code, timer);
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    name: room.name,
    status: room.status,
    creatorUID: room.creatorUID,
    players: room.players,
    difficulty: room.difficulty
  };
}

function buildMatchState(room) {
  return {
    code: room.code,
    status: room.status,
    difficulty: room.difficulty,
    gridSize: room.match?.gridSize || 5,
    scores: room.match?.scores || {},
    activeBlock: room.match?.activeBlock || {},
    winnerUID: room.match?.winnerUID || null,
    players: room.players
  };
}

module.exports = { initSocket };
