const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ======================
// CONFIG
// ======================
const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLEANUP_INTERVAL_MS = 60 * 1000;         // check every 1 minute

// ======================
// ROOM STORAGE
// ======================
const rooms = {};

/*
rooms = {
  "1234": {
    teamMode: true,
    teams: [],
    players: {},
    armed: false,
    winner: null,
    lastActivity: Date.now()
  }
}
*/

const generatePin = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

const touchRoom = (pin) => {
  if (rooms[pin]) {
    rooms[pin].lastActivity = Date.now();
  }
};

// ======================
// CLEANUP TIMER
// ======================
setInterval(() => {
  const now = Date.now();

  for (const pin in rooms) {
    if (now - rooms[pin].lastActivity > INACTIVITY_LIMIT_MS) {
      io.to(pin).emit("roomExpired");
      delete rooms[pin];
      console.log(`Room ${pin} expired due to inactivity`);
    }
  }
}, CLEANUP_INTERVAL_MS);

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
      winner: null,
      lastActivity: Date.now()
    };

    socket.join(pin);
    socket.emit("roomCreated", {
      pin,
      config: {
        teamMode: true,
        teams: rooms[pin].teams,
        pin
      }
    });
  });

  // JOIN ROOM
  socket.on("joinRoom", ({ pin, name, team }) => {
    const room = rooms[pin];
    if (!room) {
      socket.emit("joinError", "This room no longer exists.");
      return;
    }

    socket.join(pin);
    touchRoom(pin);

    if (room.teamMode && (!team || !room.teams.includes(team))) {
      socket.emit("joinError", "Valid team selection required.");
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

  // TEAM MODE TOGGLE
  socket.on("toggleTeamMode", ({ pin, enabled }) => {
    const room = rooms[pin];
    if (!room) return;

    room.teamMode = enabled;
    touchRoom(pin);

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

  // SET TEAMS
  socket.on("setTeams", ({ pin, teams }) => {
    const room = rooms[pin];
    if (!room || !room.teamMode) return;

    room.teams = teams;
    touchRoom(pin);

    io.to(pin).emit("config", {
      teamMode: room.teamMode,
      teams: room.teams,
      pin
    });
  });

  // ARM
  socket.on("arm", (pin) => {
    const room = rooms[pin];
    if (!room) return;

    room.armed = true;
    room.winner = null;
    touchRoom(pin);

    io.to(pin).emit("armed");
  });

  // BUZZ
  socket.on("buzz", (pin) => {
    const room = rooms[pin];
    if (!room || !room.armed || room.winner) return;

    room.winner = room.players[socket.id];
    room.armed = false;
    touchRoom(pin);

    io.to(pin).emit("winner", room.winner);
  });

  // RESET
  socket.on("reset", (pin) => {
    const room = rooms[pin];
    if (!room) return;

    room.armed = false;
    room.winner = null;
    touchRoom(pin);

    io.to(pin).emit("reset");
  });

  // DISCONNECT
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
  console.log("Buzzer server running with inactivity expiration");
});
