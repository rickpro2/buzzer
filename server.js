const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/*
ROOM STRUCTURE
rooms = {
  "1234": {
    teamMode: true,
    teams: ["Red","Blue"],
    players: { socketId: { name, team } },
    armed: false,
    winner: null
  }
}
*/
const rooms = {};

// Utility
const generatePin = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

// ======================
// SOCKET LOGIC
// ======================
io.on("connection", (socket) => {

  // HOST creates room
  socket.on("createRoom", () => {
    const pin = generatePin();
    rooms[pin] = {
      teamMode: true,
      teams: ["Red", "Blue", "Green", "Yellow"],
      players: {},
      armed: false,
      winner: null
    };

    socket.join(pin);
    socket.emit("roomCreated", { pin, config: rooms[pin] });
  });

  // PLAYER or HOST joins room
  socket.on("joinRoom", ({ pin, name, team }) => {
    const room = rooms[pin];
    if (!room) {
      socket.emit("joinError", "Invalid room PIN");
      return;
    }

    socket.join(pin);

    // Enforce team rules
    if (room.teamMode && (!team || !room.teams.includes(team))) {
      socket.emit("joinError", "Team selection required");
      return;
    }

    room.players[socket.id] = {
      name,
      team: room.teamMode ? team : "Solo"
    };

    io.to(pin).emit("playerList", Object.values(room.players));
    socket.emit("config", {
      teamMode: room.teamMode,
      teams: room.teams,
      pin
    });
  });

  // HOST toggles team mode
  socket.on("toggleTeamMode", ({ pin, enabled }) => {
    const room = rooms[pin];
    if (!room) return;

    room.teamMode = enabled;

    if (!enabled) {
      Object.values(room.players).forEach(p => p.team = "Solo");
    }

    io.to(pin).emit("config", {
      teamMode: room.teamMode,
      teams: room.teams,
      pin
    });
    io.to(pin).emit("playerList", Object.values(room.players));
  });

  // HOST sets teams
  socket.on("setTeams", ({ pin, teams }) => {
    const room = rooms[pin];
    if (!room || !room.teamMode) return;

    room.teams = teams;
    io.to(pin).emit("config", {
      teamMode: room.teamMode,
      teams: room.teams,
      pin
    });
  });

  // HOST arms buzzers
  socket.on("arm", (pin) => {
    const room = rooms[pin];
    if (!room) return;

    room.armed = true;
    room.winner = null;
    io.to(pin).emit("armed");
  });

  // PLAYER buzz
  socket.on("buzz", (pin) => {
    const room = rooms[pin];
    if (!room || !room.armed || room.winner) return;

    room.winner = room.players[socket.id];
    room.armed = false;
    io.to(pin).emit("winner", room.winner);
  });

  // HOST reset
  socket.on("reset", (pin) => {
    const room = rooms[pin];
    if (!room) return;

    room.armed = false;
    room.winner = null;
    io.to(pin).emit("reset");
  });

  socket.on("disconnect", () => {
    for (const pin in rooms) {
      const room = rooms[pin];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(pin).emit("playerList", Object.values(room.players));
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Buzzer server running");
});
