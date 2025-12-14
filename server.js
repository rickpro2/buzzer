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

// ================= SOCKETS =================
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
      lastActivity: Date.now()
    };
    socket.join(pin);
    socket.emit("roomCreated", { pin });
  });

  // JOIN ROOM
  socket.on("joinRoom", ({ pin, name, team }) => {
    const room = rooms[pin];
    if (!room) return socket.emit("joinError", "Room not found");

    if (room.teamMode && (!team || !room.teams.includes(team))) {
      return socket.emit("joinError", "Team selection required");
    }

    socket.join(pin);
    touchRoom(pin);

    room.players[socket.id] = {
      name,
      team: room.teamMode ? team : "Solo"
    };

    const scoreKey = room.teamMode ? team : name;
    if (room.scores[scoreKey] === undefined)
      room.scores[scoreKey] = 0;

    io.to(pin).emit("playerList", Object.values(room.players));
    io.to(pin).emit("scoreUpdate", room.scores);
    socket.emit("config", {
      pin,
      teamMode: room.teamMode,
      teams: room.teams
    });
  });

  // TEAM MODE TOGGLE
  socket.on("toggleTeamMode", ({ pin, enabled }) => {
    const room = rooms[pin];
    if (!room) return;

    room.teamMode = enabled;
    room.scores = {};
    touchRoom(pin);

    Object.values(room.players).forEach(p => {
      const key = enabled ? p.team : p.name;
      room.scores[key] = 0;
      p.team = enabled ? p.team : "Solo";
    });

    io.to(pin).emit("config", {
      pin,
      teamMode: room.teamMode,
      teams: room.teams
    });
    io.to(pin).emit("scoreUpdate", room.scores);
    io.to(pin).emit("playerList", Object.values(room.players));
  });

  // SET TEAMS
  socket.on("setTeams", ({ pin, teams }) => {
    const room = rooms[pin];
    if (!room || !room.teamMode) return;
    room.teams = teams;
    touchRoom(pin);
    io.to(pin).emit("config", {
      pin,
      teamMode: room.teamMode,
      teams: room.teams
    });
  });

  // SCORE UPDATE
  socket.on("updateScore", ({ pin, key, delta }) => {
    const room = rooms[pin];
    if (!room || room.scores[key] === undefined) return;
    room.scores[key] += delta;
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

socket.on("checkRoom", (pin) => {
  const room = rooms[pin];
  if (!room) {
    socket.emit("joinError", "Room not found");
    return;
  }
  socket.emit("roomInfo", {
    teamMode: room.teamMode,
    teams: room.teams
  });
});


server.listen(process.env.PORT || 3000, () =>
  console.log("Buzzer server running")
);
