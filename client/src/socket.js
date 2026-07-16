import { io } from 'socket.io-client';

// Automatically uses the deployed server URL, or falls back to local for development
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-backend-url.onrender.com' // You will replace this later
  : 'http://localhost:5001';

export const socket = io(SOCKET_URL);