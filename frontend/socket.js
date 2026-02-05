// Shared socket
const socket = io("https://retro-new.onrender.com");

function setConnStatus(state, text) {
  const el = document.getElementById("connStatus");
  if (!el) return;
  el.classList.remove("ok", "bad");
  if (state) el.classList.add(state);
  el.textContent = text;
}

setConnStatus(null, "Connecting...");

socket.on("connect", () => {
  setConnStatus("ok", "Connected");
});

socket.on("disconnect", () => {
  setConnStatus("bad", "Disconnected");
});

socket.on("connect_error", () => {
  setConnStatus("bad", "Connection Error");
});
