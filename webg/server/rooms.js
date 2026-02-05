"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOMS_FILE = path.join(__dirname, "rooms.json");

const difficulties = {
  beginner: { label: "Beginner", ticksPerSecond: 1, randomized: false },
  intermediate: { label: "Intermediate", ticksPerSecond: 2, randomized: false },
  veteran: { label: "Veteran", ticksPerSecond: 3, randomized: false },
  expert: { label: "Expert", ticksPerSecond: 4, randomized: false },
  god: { label: "God Mode", ticksPerSecond: 0, randomized: true }
};

function readRooms() {
  if (!fs.existsSync(ROOMS_FILE)) {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms: [] }, null, 2));
  }
  const raw = fs.readFileSync(ROOMS_FILE, "utf8");
  return JSON.parse(raw);
}

function writeRooms(data) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
}

function generateRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function createRoom({ name, creatorUID }) {
  const db = readRooms();
  let code;
  do {
    code = generateRoomCode();
  } while (db.rooms.some(r => r.code === code));

  const room = {
    code,
    name: name.slice(0, 32),
    status: "WAITING",
    creatorUID,
    players: [creatorUID],
    createdAt: new Date().toISOString(),
    difficulty: "beginner",
    match: null
  };

  db.rooms.push(room);
  writeRooms(db);

  return room;
}

function getRoom(code) {
  const db = readRooms();
  return db.rooms.find(r => r.code === code) || null;
}

function updateRoom(updated) {
  const db = readRooms();
  const idx = db.rooms.findIndex(r => r.code === updated.code);
  if (idx === -1) return false;
  db.rooms[idx] = updated;
  writeRooms(db);
  return true;
}

function removeRoom(code) {
  const db = readRooms();
  db.rooms = db.rooms.filter(r => r.code !== code);
  writeRooms(db);
}

function joinRoom(code, uid) {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.players.includes(uid)) return { ok: false, error: "ALREADY_IN_ROOM" };
  if (room.players.length >= 2) return { ok: false, error: "ROOM_FULL" };
  if (room.status !== "WAITING") return { ok: false, error: "ROOM_NOT_WAITING" };
  room.players.push(uid);
  updateRoom(room);
  return { ok: true, room };
}

function leaveRoom(code, uid) {
  const room = getRoom(code);
  if (!room) return null;
  room.players = room.players.filter(p => p !== uid);

  // If creator left or empty room, close it
  if (room.players.length === 0 || room.creatorUID === uid) {
    removeRoom(code);
    return null;
  }

  updateRoom(room);
  return room;
}

function setDifficulty(code, difficultyKey, uid) {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.creatorUID !== uid) return { ok: false, error: "NOT_CREATOR" };
  if (room.status !== "WAITING") return { ok: false, error: "MATCH_ALREADY_STARTED" };
  if (!difficulties[difficultyKey]) return { ok: false, error: "INVALID_DIFFICULTY" };
  room.difficulty = difficultyKey;
  updateRoom(room);
  return { ok: true, room };
}

function startMatch(code, uid) {
  const room = getRoom(code);
  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (room.creatorUID !== uid) return { ok: false, error: "NOT_CREATOR" };
  if (room.players.length !== 2) return { ok: false, error: "NEED_TWO_PLAYERS" };
  if (room.status !== "WAITING") return { ok: false, error: "MATCH_ALREADY_STARTED" };

  const gridSize = 5;
  const p1 = room.players[0];
  const p2 = room.players[1];

  room.status = "IN_MATCH";
  room.match = {
    gridSize,
    scores: { [p1]: 0, [p2]: 0 },
    activeBlock: {
      [p1]: randomIndex(gridSize),
      [p2]: randomIndex(gridSize)
    },
    startedAt: Date.now(),
    endedAt: null,
    winnerUID: null
  };

  updateRoom(room);
  return { ok: true, room };
}

function randomIndex(gridSize) {
  return Math.floor(Math.random() * gridSize * gridSize);
}

function moveActiveBlock(room, uid) {
  room.match.activeBlock[uid] = randomIndex(room.match.gridSize);
}

function addScore(room, uid, points) {
  room.match.scores[uid] += points;
}

function getDifficultySettings(room) {
  return difficulties[room.difficulty];
}

function endMatch(room, winnerUID) {
  room.status = "ENDED";
  room.match.endedAt = Date.now();
  room.match.winnerUID = winnerUID;
  updateRoom(room);
}

module.exports = {
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
};
