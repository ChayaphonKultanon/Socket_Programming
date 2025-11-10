const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// Create HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const { registerSocketHandlers } = require("./controllers/socketHandlers");

// Wire controller
registerSocketHandlers(io);

const PORT = 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
