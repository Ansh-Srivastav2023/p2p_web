import { io } from 'socket.io-client';
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://p2p-nexus-backend.onrender.com' // You will replace this later
  : 'http://localhost:5000';

export const socket = io(SOCKET_URL);   