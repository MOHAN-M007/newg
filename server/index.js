"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { initSocket } = require("./socket");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Dev-only static hosting of frontend
app.use("/frontend", express.static(path.join(__dirname, "..", "frontend")));

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
