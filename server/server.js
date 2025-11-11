/**
 * Main server entrypoint (server/server.js)
 * - Initializes Express, Socket.IO
 * - Connects to MongoDB via config/db.js
 * - Loads HTTP routes and socket handlers
 */
const path = require('path');
// Load environment from repo root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./config/db');
const initSocketHandlers = require('./sockets');

const app = express();
app.use(cors());
app.use(express.json());

// Optional: Mount API routes here (kept minimal for now)
// try {
//   const authRoutes = require('./routes/auth');
//   app.use('/api/auth', authRoutes);
// } catch (e) {
//   // auth routes may not exist in all branches
// }

async function start() {
  // Connect to database (if configured)
  await db.connect();

  const port = process.env.PORT || 4000;
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: true, credentials: true },
  });

  // Initialize socket handlers (this wires up io.on('connection') ).
  // The sockets module will lazy-initialize the world chat service if needed.
  initSocketHandlers(io);

  server.listen(port, () => console.log(`Server running on port ${port}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
