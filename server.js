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
let players = {};      // { socketId: { name, team } }
let teams = ["Red", "Blue", "Green", "Yellow"]; // default teams
let armed = false;
let winner = null;

// ======================
// SOCKET LOGIC
// ======================
io.on("connection", (socket) => {

  // Send current team list to newly connected clients
  socket.emit("teamList", teams);

  // Host updates the teams
  socket.on("setTeams", (newTeams) => {
    teams = newTeams;
    io.emit("teamList", teams);
  });

  // Player joins with name + team
  socket.on("join", ({ name, team }) => {
    players[socket.id] = { name, team };
    io.emit("playerList", Object.values(players));
  });

  // Player buzzes in
  socket.on("buzz", () => {
    if (!armed || winner) return;

    winner = players[socket.id];
    armed = false;

    io.emit("winner", winner);
  });

  // Host arms buzzers
  socket.on("arm", () => {
    armed = true;
    winner = null;
    io.emit("armed");
  });

  // Host resets
  socket.on("reset", () => {
    armed = false;
    winner = null;
    io.emit("reset");
  });

  // Player disconnects
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerList", Object.values(players));
  });

});

// ======================
// SERVER START
// ======================
server.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port " + (process.env.PORT || 3000));
});
