import { WebSocket } from 'ws';
import { subscriptionMap, handleNewConnection, broadcastToRoom } from './wsServer';

// Mock livekit-server-sdk
jest.mock('livekit-server-sdk', () => {
  return {
    RoomServiceClient: jest.fn().mockImplementation(() => ({
      listParticipants: jest.fn().mockResolvedValue([
        { name: 'Alice', metadata: JSON.stringify({ avatarUrl: 'https://example.com/alice.png' }) },
        { name: 'Bob', metadata: '{}' },
      ]),
    })),
  };
});

// Helper: create a mock WebSocket
function mockWs(readyState: number = WebSocket.OPEN): jest.Mocked<WebSocket> {
  const ws = {
    readyState,
    send: jest.fn(),
    on: jest.fn(),
  } as unknown as jest.Mocked<WebSocket>;
  return ws;
}

// Helper: extract the listener registered via ws.on(event, handler)
function getListener(ws: jest.Mocked<WebSocket>, event: string): ((...args: unknown[]) => void) | undefined {
  const calls = (ws.on as jest.Mock).mock.calls as [string, (...args: unknown[]) => void][];
  const found = calls.find(([ev]) => ev === event);
  return found ? found[1] : undefined;
}

beforeEach(() => {
  subscriptionMap.clear();
  jest.clearAllMocks();
  // Reset env
  process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
});

describe('handleNewConnection - subscribe', () => {
  it('adds ws to subscriptionMap and sends current_participants', async () => {
    const ws = mockWs();
    handleNewConnection(ws);

    const messageListener = getListener(ws, 'message');
    expect(messageListener).toBeDefined();

    await messageListener!(Buffer.from(JSON.stringify({ action: 'subscribe', roomName: 'room1' })));

    // Wait for async listParticipants
    await new Promise((r) => setTimeout(r, 20));

    expect(subscriptionMap.has('room1')).toBe(true);
    expect(subscriptionMap.get('room1')!.has(ws)).toBe(true);
    expect(ws.send).toHaveBeenCalledTimes(1);

    const sent = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(sent.type).toBe('current_participants');
    expect(sent.roomName).toBe('room1');
    expect(sent.participants).toHaveLength(2);
    expect(sent.participants[0]).toEqual({ nickname: 'Alice', avatarUrl: 'https://example.com/alice.png' });
    expect(sent.participants[1]).toEqual({ nickname: 'Bob', avatarUrl: '' });
  });

});

describe('handleNewConnection - unsubscribe', () => {
  it('removes ws from subscriptionMap', async () => {
    const ws = mockWs();
    handleNewConnection(ws);
    const messageListener = getListener(ws, 'message');

    // Subscribe first
    await messageListener!(Buffer.from(JSON.stringify({ action: 'subscribe', roomName: 'room2' })));
    await new Promise((r) => setTimeout(r, 20));
    expect(subscriptionMap.get('room2')!.has(ws)).toBe(true);

    // Unsubscribe
    await messageListener!(Buffer.from(JSON.stringify({ action: 'unsubscribe', roomName: 'room2' })));
    expect(subscriptionMap.has('room2')).toBe(false);
  });
});

describe('handleNewConnection - socket close', () => {
  it('removes ws from all sets on close', async () => {
    const ws = mockWs();
    handleNewConnection(ws);
    const messageListener = getListener(ws, 'message');
    const closeListener = getListener(ws, 'close');

    // Subscribe to two rooms
    subscriptionMap.set('roomA', new Set([ws]));
    subscriptionMap.set('roomB', new Set([ws]));

    closeListener!();

    expect(subscriptionMap.has('roomA')).toBe(false);
    expect(subscriptionMap.has('roomB')).toBe(false);
  });
});

describe('subscriptionMap singleton', () => {
  it('resolves to the same global reference on re-import', async () => {
    const { subscriptionMap: reimported } = await import('./wsServer');
    expect(reimported).toBe(subscriptionMap);
    // Also verify the global anchor is set
    expect(global.__wsSubscriptionMap).toBe(subscriptionMap);
  });
});

describe('broadcastToRoom', () => {
  it('sends to all OPEN sockets', () => {
    const ws1 = mockWs(WebSocket.OPEN);
    const ws2 = mockWs(WebSocket.OPEN);
    subscriptionMap.set('room3', new Set([ws1, ws2]));

    broadcastToRoom('room3', { type: 'test' });

    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
  });

  it('prunes CLOSED sockets from the set', () => {
    const openWs = mockWs(WebSocket.OPEN);
    const closedWs = mockWs(WebSocket.CLOSED);
    subscriptionMap.set('room4', new Set([openWs, closedWs]));

    broadcastToRoom('room4', { type: 'test' });

    expect(openWs.send).toHaveBeenCalled();
    expect(closedWs.send).not.toHaveBeenCalled();
    expect(subscriptionMap.get('room4')!.has(closedWs)).toBe(false);
    expect(subscriptionMap.get('room4')!.has(openWs)).toBe(true);
  });

  it('does not crash when send() throws', () => {
    const ws = mockWs(WebSocket.OPEN);
    (ws.send as jest.Mock).mockImplementation(() => { throw new Error('send failed'); });
    subscriptionMap.set('room5', new Set([ws]));

    expect(() => broadcastToRoom('room5', { type: 'test' })).not.toThrow();
  });

  it('does nothing if room has no subscribers', () => {
    expect(() => broadcastToRoom('nonexistent', { type: 'test' })).not.toThrow();
  });
});
