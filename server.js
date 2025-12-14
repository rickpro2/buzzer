const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ================= CONFIG =================
const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 60 * 1000;          // 1 min

// ================= ROOMS ==================
const rooms = {};

const generatePin = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

const touchRoom = (pin) => {
  if (rooms[pin]) rooms[pin].lastActivity = Date.now();
};

// ===== Inactivity Cleanup =====
setInterval(() => {
  const now = Date.now();
  for (const pin in rooms) {
    if (now - rooms[pin].lastActivity > INACTIVITY_LIMIT_MS) {
      io.to(pin).emit("roomExpired");
      delete rooms[pin];
      console.log(`Room ${pin} expired`);
    }
  }
}, CLEANUP_INTERVAL_MS);

io.on("connection", (socket) => {
  // HOST creates room
  socket.on("createRoom", () => {
    const pin = generatePin();
    rooms[pin] = {
      teamMode: true,
      teams: ["Red", "Blue", "Green", "Yellow"],
      players: {},
      scores: {},
      armed: false,
      winner: null,
      lastActivity: Date.now(),
    };
    socket.join(pin);
    socket.emit("roomCreated", { pin });
  });

  // PLAYER checks room (loads teams BEFORE join)
  socket.on("checkRoom", (pin) => {
    const room = rooms[pin];
    if (!room) return socket.emit("joinError", "Room not found");

    socket.emit("roomInfo", {
      teamMode: room.teamMode,
      teams: room.teams,
    });
  });

  // HOST sets teams (creates/renames teams)
  socket.on("setTeams", ({ pin, teams }) => {
    const room = rooms[pin];
    if (!room) return;

    // Clean & dedupe
    const cleaned = (teams || [])
      .map((t) => String(t).trim())
      .filter(Boolean);

    room.teams = [...new Set(cleaned)];
    touchRoom(pin);

    // Optional: initialize scoreboard buckets for teams (so they appear immediately)
    if (room.teamMode) {
      room.teams.forEach((t) => {
        if (room.scores[t] === undefined) room.scores[t] = 0;
      });
    }

    io.to(pin).emit("roomInfo", { teamMode: room.teamMode, teams: room.teams });
    io.to(pin).emit("scoreUpdate", room.scores);
  });

  // PLAYER joins room
  socket.on("joinRoom", ({ pin, name, team }) => {
    const room = rooms[pin];
    if (!room) return socket.emit("joinError", "Room not found");

    const safeName = String(name || "").trim();
    const safeTeam = String(team || "").trim();

    if (!safeName) return socket.emit("joinError", "Name is required");

    // No solo players when Team Mode is ON
    if (room.teamMode && (!safeTeam || !room.teams.includes(safeTeam))) {
      return socket.emit("joinError", "Team selection required");
    }

    socket.join(pin);
    touchRoom(pin);

    room.players[socket.id] = {
      name: safeName,
      team: room.teamMode ? safeTeam : "Solo",
    };

    const scoreKey = room.teamMode ? safeTeam : safeName;
    if (room.scores[scoreKey] === undefined) room.scores[scoreKey] = 0;

    io.to(pin).emit("playerList", Object.values(room.players));
    io.to(pin).emit("scoreUpdate", room.scores);

    socket.emit("config", {
      pin,
      teamMode: room.teamMode,
      teams: room.teams,
    });
  });

  // HOST scoring
  socket.on("updateScore", ({ pin, key, delta }) => {
    const room = rooms[pin];
    if (!room) return;
    if (room.scores[key] === undefined) return;

    room.scores[key] += Number(delta) || 0;
    touchRoom(pin);
    io.to(pin).emit("scoreUpdate", room.scores);
  });

  // GAME FLOW
  socket.on("arm", (pin) => {
    const room = rooms[pin];
    if (!room) return;
    room.armed = true;
    room.winner = null;
    touchRoom(pin);
    io.to(pin).emit("armed");
  });

  socket.on("buzz", (pin) => {
    const room = rooms[pin];
    if (!room || !room.armed || room.winner) return;

    room.winner = room.players[socket.id];
    room.armed = false;
    touchRoom(pin);
    io.to(pin).emit("winner", room.winner);
  });

  socket.on("reset", (pin) => {
    const room = rooms[pin];
    if (!room) return;
    room.armed = false;
    room.winner = null;
    touchRoom(pin);
    io.to(pin).emit("reset");
  });

  socket.on("disconnect", () => {
    for (const pin in rooms) {
      const room = rooms[pin];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        touchRoom(pin);
        io.to(pin).emit("playerList", Object.values(room.players));
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Buzzer server running");
});
