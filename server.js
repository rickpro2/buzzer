const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ======================
// GAME STATE
// ======================
let players = {};                 // { socketId: { name, team } }
let teams = ["Red", "Blue", "Green", "Yellow"];
let teamMode = true;              // ⭐ TOGGLE
let armed = false;
let winner = null;

// ======================
// SOCKET LOGIC
// ======================
io.on("connection", (socket) => {

  // Send config
  socket.emit("config", { teamMode, teams });

  // HOST: toggle team mode
  socket.on("toggleTeamMode", (enabled) => {
    teamMode = enabled;

    if (!teamMode) {
      // Force everyone to Solo
      Object.values(players).forEach(p => p.team = "Solo");
    }

    io.emit("config", { teamMode, teams });
    io.emit("playerList", Object.values(players));
  });

  // HOST: set teams
  socket.on("setTeams", (newTeams) => {
    if (!teamMode) return;

    teams = newTeams.filter(t => t && t.trim());
    io.emit("config", { teamMode, teams });
  });

  // PLAYER joins
  socket.on("join", ({ name, team }) => {

    // ❌ Reject solo players in team mode
    if (teamMode) {
      if (!team || !teams.includes(team)) {
        socket.emit("joinError", "Team selection is required.");
        return;
      }
    }

    players[socket.id] = {
      name,
      team: teamMode ? team : "Solo"
    };

    io.emit("playerList", Object.values(players));
  });

  // PLAYER buzz
  socket.on("buzz", () => {
    if (!armed || winner) return;

    winner = players[socket.id];
    armed = false;
    io.emit("winner", winner);
  });

  // HOST controls
  socket.on("arm", () => {
    armed = true;
    winner = null;
    io.emit("armed");
  });

  socket.on("reset", () => {
    armed = false;
    winner = null;
    io.emit("reset");
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerList", Object.values(players));
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Buzzer server running");
});
