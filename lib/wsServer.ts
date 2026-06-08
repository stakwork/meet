import { WebSocket } from 'ws';
import { RoomServiceClient } from 'livekit-server-sdk';

declare global {
  var __wsSubscriptionMap: Map<string, Set<WebSocket>> | undefined;
}

export const subscriptionMap: Map<string, Set<WebSocket>> =
  global.__wsSubscriptionMap ??
  (global.__wsSubscriptionMap = new Map<string, Set<WebSocket>>());

function getRoomClient(): RoomServiceClient {
  const url = new URL(process.env.LIVEKIT_URL!);
  url.protocol = 'https:';
  return new RoomServiceClient(url.origin, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

export function handleNewConnection(ws: WebSocket): void {
  ws.on('message', async (data) => {
    let msg: { action?: string; roomName?: string };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { action, roomName } = msg;
    if (!action || !roomName) return;

    if (action === 'subscribe') {
      if (!subscriptionMap.has(roomName)) {
        subscriptionMap.set(roomName, new Set());
      }
      subscriptionMap.get(roomName)!.add(ws);
      const count = subscriptionMap.get(roomName)!.size;
      console.log(`[wsServer] subscribe roomName=${roomName} subscribers=${count}`);

      try {
        const roomClient = getRoomClient();
        const participants = await roomClient.listParticipants(roomName);
        const payload = {
          type: 'current_participants',
          roomName,
          participants: participants.map((p) => ({
            nickname: p.name,
            avatarUrl: safeParseMetadata(p.metadata)?.avatarUrl ?? '',
          })),
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
        }
      } catch (err) {
        console.error(`[wsServer] failed to list participants for roomName=${roomName}`, err);
      }
    } else if (action === 'unsubscribe') {
      const set = subscriptionMap.get(roomName);
      if (set) {
        set.delete(ws);
        console.log(`[wsServer] unsubscribe roomName=${roomName} subscribers=${set.size}`);
        if (set.size === 0) {
          subscriptionMap.delete(roomName);
        }
      }
    }
  });

  ws.on('close', () => {
    let cleaned = 0;
    for (const [roomName, set] of subscriptionMap.entries()) {
      if (set.has(ws)) {
        set.delete(ws);
        cleaned++;
        console.log(`[wsServer] cleanup on close roomName=${roomName} subscribers=${set.size}`);
        if (set.size === 0) {
          subscriptionMap.delete(roomName);
        }
      }
    }
    if (cleaned > 0) {
      console.log(`[wsServer] socket closed, removed from ${cleaned} room(s)`);
    }
  });
}

export function broadcastToRoom(roomName: string, payload: object): void {
  const set = subscriptionMap.get(roomName);
  if (!set || set.size === 0) return;

  const message = JSON.stringify(payload);
  const toRemove: WebSocket[] = [];

  for (const ws of set) {
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(`[wsServer] pruning closed socket for roomName=${roomName}`);
      toRemove.push(ws);
      continue;
    }
    try {
      ws.send(message);
    } catch (err) {
      console.error(`[wsServer] broadcast error for roomName=${roomName}`, err);
    }
  }

  for (const ws of toRemove) {
    set.delete(ws);
  }
  if (set.size === 0) {
    subscriptionMap.delete(roomName);
  }
}

function safeParseMetadata(metadata?: string): Record<string, string> | null {
  try {
    return metadata ? JSON.parse(metadata) : null;
  } catch {
    return null;
  }
}
