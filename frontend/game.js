const uid = localStorage.getItem("uid");
const roomCode = localStorage.getItem("roomCode");

const roomInfo = document.getElementById("roomInfo");
const statusInfo = document.getElementById("statusInfo");
const scoreboard = document.getElementById("scoreboard");
const msg = document.getElementById("msg");

const gridP1 = document.getElementById("gridP1");
const gridP2 = document.getElementById("gridP2");

let roomState = null;
let matchState = null;

if (!uid || !roomCode) window.location.href = "lobby.html";

document.getElementById("setDifficulty").onclick = () => {
  const difficulty = document.getElementById("difficulty").value;
  socket.emit("room:set_difficulty", { difficulty }, (res) => {
    msg.textContent = res.ok ? `Difficulty set: ${difficulty}` : `Error: ${res.error}`;
  });
};

document.getElementById("startMatch").onclick = () => {
  socket.emit("room:start_match", {}, (res) => {
    if (!res.ok) msg.textContent = `Error: ${res.error}`;
  });
};

document.getElementById("leaveRoom").onclick = () => {
  socket.emit("room:leave", {}, () => {
    localStorage.removeItem("roomCode");
    window.location.href = "lobby.html";
  });
};

socket.emit("room:sync", {}, (res) => {
  if (!res.ok) return;
  roomState = res.room;
  roomInfo.textContent = `Room ${roomState.code} | ${roomState.name} | ${roomState.status}`;
  if (roomState.status === "IN_MATCH" || roomState.status === "ENDED") {
    matchState = res.match;
    buildGrid(matchState.gridSize);
    render(matchState);
  }
});

socket.on("room:update", (room) => {
  roomState = room;
  roomInfo.textContent = `Room ${room.code} | ${room.name} | ${room.status}`;
});

socket.on("room:closed", () => {
  msg.textContent = "Room closed.";
  localStorage.removeItem("roomCode");
  setTimeout(() => window.location.href = "lobby.html", 1000);
});

socket.on("match:start", (state) => {
  matchState = state;
  statusInfo.textContent = "MATCH STARTED";
  buildGrid(state.gridSize);
  render(state);
});

socket.on("match:update", (state) => {
  matchState = state;
  render(state);
});

socket.on("match:end", (state) => {
  matchState = state;
  render(state);
  const winner = state.winnerUID;
  msg.textContent = `Winner: ${winner}`;
});

function buildGrid(size) {
  document.documentElement.style.setProperty("--grid-size", size);
  gridP1.innerHTML = "";
  gridP2.innerHTML = "";
  for (let i = 0; i < size * size; i++) {
    const c1 = document.createElement("div");
    c1.className = "cell";
    c1.dataset.idx = i;
    c1.onclick = () => clickCell(i);
    gridP1.appendChild(c1);

    const c2 = document.createElement("div");
    c2.className = "cell";
    c2.dataset.idx = i;
    c2.onclick = () => clickCell(i);
    gridP2.appendChild(c2);
  }
}

function clickCell(index) {
  socket.emit("game:click", { index }, () => {});
}

function render(state) {
  const { scores, activeBlock, players } = state;
  scoreboard.textContent = `Scores: ${JSON.stringify(scores)}`;

  const p1 = players[0];
  const p2 = players[1];

  [...gridP1.children].forEach((c, i) => {
    c.classList.toggle("active", i === (activeBlock[p1] ?? -1));
  });

  [...gridP2.children].forEach((c, i) => {
    c.classList.toggle("active", i === (activeBlock[p2] ?? -1));
  });
}
