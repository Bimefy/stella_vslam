import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocketClient(): Socket {
  if (!socket) {
    socket = io('http://localhost:3000');
  }
  return socket;
} 