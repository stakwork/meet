import { POST } from './route';
import { NextRequest } from 'next/server';

const mockRemoveParticipant = jest.fn();
const mockVerify = jest.fn();

jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    removeParticipant: mockRemoveParticipant,
  })),
  TokenVerifier: jest.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

beforeAll(() => {
  process.env.LIVEKIT_URL = 'wss://test.livekit.io';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret';
});

beforeEach(() => {
  mockRemoveParticipant.mockReset();
  mockVerify.mockReset();
});

function makeRequest(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/remove-participant', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

const validClaims = { video: { roomAdmin: true, room: 'room-1' } };

describe('POST /api/remove-participant', () => {
  it('returns 200 { success: true } on success', async () => {
    mockVerify.mockResolvedValueOnce(validClaims);
    mockRemoveParticipant.mockResolvedValueOnce(undefined);
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockRemoveParticipant).toHaveBeenCalledWith('room-1', 'user-1');
  });

  it('returns 400 when roomName is missing', async () => {
    const req = makeRequest({ participantIdentity: 'user-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when participantIdentity is missing', async () => {
    const req = makeRequest({ roomName: 'room-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('returns 403 when token does not have roomAdmin', async () => {
    mockVerify.mockResolvedValueOnce({ video: { roomAdmin: false, room: 'room-1' } });
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'weak-token');
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('returns 403 when token is for a different room', async () => {
    mockVerify.mockResolvedValueOnce({ video: { roomAdmin: true, room: 'other-room' } });
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'wrong-room-token');
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockRemoveParticipant).not.toHaveBeenCalled();
  });

  it('returns 404 when SDK throws a "not found" error', async () => {
    mockVerify.mockResolvedValueOnce(validClaims);
    mockRemoveParticipant.mockRejectedValueOnce(new Error('Participant not found'));
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Participant not found' });
  });

  it('returns 404 when SDK throws a "404" error', async () => {
    mockVerify.mockResolvedValueOnce(validClaims);
    mockRemoveParticipant.mockRejectedValueOnce(new Error('404: room not found'));
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 500 on generic SDK error', async () => {
    mockVerify.mockResolvedValueOnce(validClaims);
    mockRemoveParticipant.mockRejectedValueOnce(new Error('Internal server error'));
    const req = makeRequest({ roomName: 'room-1', participantIdentity: 'user-1' }, 'valid-token');
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
