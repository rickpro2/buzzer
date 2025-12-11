const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};       // { socketId: { name } }
let armed = false;
let winner = null;

io.on("connection", (socket) => {

  // Player joins
  socket.on("join", (name) => {
    players[socket.id] = { name };
    io.emit("playerList", Object.values(players));
  });

  // Player buzz
  socket.on("buzz", () => {
    if (!armed || winner) return;

    winner = players[socket.id];
    armed = false;

    io.emit("winner", winner);
  });

  // Host arms the buzzer
  socket.on("arm", () => {
    armed = true;
    winner = null;
    io.emit("armed");
  });

  // Host resets everything
  socket.on("reset", () => {
    armed = false;
    winner = null;
    io.emit("reset");
  });

  // Player leaves
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerList", Object.values(players));
  });

});

server.listen(3000, () => {
  console.log("Buzzer server running on port 3000");
});
