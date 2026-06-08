import { NextRequest } from 'next/server';

// Mock wsServer before importing route
const mockBroadcastToRoom = jest.fn();
const mockSubscriptionMap = new Map<string, Set<unknown>>();

jest.mock('@/lib/wsServer', () => ({
  broadcastToRoom: mockBroadcastToRoom,
  subscriptionMap: mockSubscriptionMap,
}));

// Mock WebhookReceiver
const mockReceive = jest.fn();
jest.mock('livekit-server-sdk', () => ({
  WebhookReceiver: jest.fn().mockImplementation(() => ({
    receive: mockReceive,
  })),
}));

// Import after mocks are set up
import { POST } from './route';

function makeRequest(body: string, auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscriptionMap.clear();
  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
});

describe('POST /api/webhook', () => {
  it('returns 401 on invalid signature', async () => {
    mockReceive.mockRejectedValue(new Error('invalid signature'));

    const req = makeRequest('{}', 'bad-token');
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockBroadcastToRoom).not.toHaveBeenCalled();
  });

  it('returns 200 and does not broadcast when no room name', async () => {
    mockReceive.mockResolvedValue({ event: 'participant_joined', room: null, participant: null });

    const req = makeRequest('{}', 'valid-token');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockBroadcastToRoom).not.toHaveBeenCalled();
  });

  it('broadcasts participant_joined with correct payload', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_joined',
      room: { name: 'testRoom' },
      participant: {
        identity: 'user-123',
        name: 'Alice',
        metadata: JSON.stringify({ avatarUrl: 'https://example.com/alice.png' }),
      },
    });

    const req = makeRequest('{}', 'valid-token');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockBroadcastToRoom).toHaveBeenCalledWith('testRoom', {
      type: 'participant_joined',
      roomName: 'testRoom',
      participant: {
        identity: 'user-123',
        nickname: 'Alice',
        avatarUrl: 'https://example.com/alice.png',
      },
    });
  });

  it('broadcasts participant_left with identity', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_left',
      room: { name: 'testRoom' },
      participant: { identity: 'user-123', name: 'Alice', metadata: null },
    });

    const req = makeRequest('{}', 'valid-token');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockBroadcastToRoom).toHaveBeenCalledWith('testRoom', {
      type: 'participant_left',
      roomName: 'testRoom',
      identity: 'user-123',
    });
  });

  it('broadcasts room_finished and deletes subscriptionMap entry', async () => {
    mockSubscriptionMap.set('testRoom', new Set());
    mockReceive.mockResolvedValue({
      event: 'room_finished',
      room: { name: 'testRoom' },
      participant: null,
    });

    const req = makeRequest('{}', 'valid-token');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockBroadcastToRoom).toHaveBeenCalledWith('testRoom', {
      type: 'room_finished',
      roomName: 'testRoom',
    });
    expect(mockSubscriptionMap.has('testRoom')).toBe(false);
  });

  it('avatarUrl defaults to empty string when metadata is invalid', async () => {
    mockReceive.mockResolvedValue({
      event: 'participant_joined',
      room: { name: 'testRoom' },
      participant: {
        identity: 'user-456',
        name: 'Bob',
        metadata: 'not-valid-json',
      },
    });

    const req = makeRequest('{}', 'valid-token');
    await POST(req);

    expect(mockBroadcastToRoom).toHaveBeenCalledWith('testRoom', expect.objectContaining({
      participant: expect.objectContaining({ avatarUrl: '' }),
    }));
  });
});

describe('runtime export', () => {
  it('exports runtime as nodejs', async () => {
    const mod = await import('./route');
    expect((mod as { runtime?: string }).runtime).toBe('nodejs');
  });
});
