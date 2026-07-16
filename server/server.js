const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Add a friendly health check route for the browser view
app.get('/', (req, res) => {
  res.send('P2P Nexus Signaling Server is Online and Operational.');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // React dev server
    methods: ["GET", "POST"]
  }
});

// In-memory store: roomId -> { peers: { socketId: peerId } }
const rooms = new Map();

function generateRoomCode() {
  // REMOVE lowercase letters here
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; 
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create a new room
  socket.on('create-room', () => {
    const roomId = generateRoomCode();
    rooms.set(roomId, { peers: {} });
    socket.join(roomId);
    // Store the socket's own peerId (will be sent later)
    socket.data.roomId = roomId;
    socket.data.peerId = null; // will be set when joining
    socket.emit('room-created', { roomId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // Join an existing room
  socket.on('join-room', ({ roomId, peerId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    // Add peer to room
    room.peers[socket.id] = peerId;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;

    // Notify all other peers in the room about the new peer
    socket.to(roomId).emit('user-joined', { peerId, strokeId: socket.id });

    // Send the list of existing peers to the new joiner
    const existingPeers = Object.entries(room.peers)
      .filter(([sid]) => sid !== socket.id)
      .map(([sid, pid]) => ({ peerId: pid, socketId: sid }));
    socket.emit('existing-peers', { peers: existingPeers });

    console.log(`Peer ${peerId} joined room ${roomId}`);
  });

  // Relay WebRTC signaling messages
  socket.on('signal', ({ toSocketId, signal }) => {
    io.to(toSocketId).emit('signal', {
      fromSocketId: socket.id,
      signal
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        // Remove peer
        delete room.peers[socket.id];
        // Notify others
        socket.to(roomId).emit('user-left', { socketId: socket.id });
        // If room empty, delete it
        if (Object.keys(room.peers).length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        } else {
          console.log(`Peer ${socket.data.peerId} left room ${roomId}`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});