import { io, Socket } from 'socket.io-client';

export function startSocketBridge({
  sourceUrl = 'http://localhost:3000',
  targetUrl = 'http://localhost:3003',
}: {
  sourceUrl?: string;
  targetUrl?: string;
} = {}) {
  const sourceSocket: Socket = io(sourceUrl);
  const targetSocket: Socket = io(targetUrl);

  sourceSocket.onAny((event, ...args) => {
    console.log(`[BRIDGE] Received event '${event}' with args:`, args);
    targetSocket.emit(event, ...args);
    console.log(`[BRIDGE] Re-emitted event '${event}' to ${targetUrl}`);
  });

  sourceSocket.on('connect', () => {
    console.log(`[BRIDGE] Connected to source socket at ${sourceUrl}`);
  });

  targetSocket.on('connect', () => {
    console.log(`[BRIDGE] Connected to target socket at ${targetUrl}`);
  });

  sourceSocket.on('disconnect', () => {
    console.log(`[BRIDGE] Disconnected from source socket at ${sourceUrl}`);
  });

  targetSocket.on('disconnect', () => {
    console.log(`[BRIDGE] Disconnected from target socket at ${targetUrl}`);
  });

  return { sourceSocket, targetSocket };
} 