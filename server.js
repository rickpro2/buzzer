const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};      // { socketId: { name, team } }
let teams = ["Red", "Blue", "Green", "Yellow"];  // Default teams
let armed = false;
let winner = null;

// HOST sets teams
io.on("connection", (socket) => {

  socket.emit("teamList", teams);

  socket.on("setTeams", (newTeams) => {
    teams = newTeams;
    io.emit("teamList", teams);
  });

  // Player joins with name + team
  socket.on("join", ({ name, team }) => {
    players[socket.id] = { name, team };
    io.emit("playerList", Object.values(players));
  });

  socket.on("buzz", () => {
    if (!armed || winner) return;

    winner = players[socket.id];
    armed = false;

    io.emit("winner", winner);
  });

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
  console.log("Server running on port " + (process.env.PORT || 3000));
});
