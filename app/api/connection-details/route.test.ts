import { GET } from './route';
import { NextRequest } from 'next/server';

const mockToJwt = jest.fn();
const mockAddGrant = jest.fn();

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: mockAddGrant,
    toJwt: mockToJwt,
    set ttl(_: string) {},
  })),
}));

// Capture the grant passed to addGrant
function capturedGrant(): Record<string, unknown> {
  return mockAddGrant.mock.calls[0][0];
}

beforeAll(() => {
  process.env.LIVEKIT_URL = 'wss://test.livekit.io';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret';
});

beforeEach(() => {
  mockAddGrant.mockReset();
  mockToJwt.mockReset();
  mockToJwt.mockResolvedValue('mock-token');
});

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/connection-details');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe('GET /api/connection-details', () => {
  it('returns 400 when roomName is missing', async () => {
    const req = makeRequest({ participantName: 'alice' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when participantName is missing', async () => {
    const req = makeRequest({ roomName: 'room-1' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with connection details', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.serverUrl).toBe('wss://test.livekit.io');
    expect(data.roomName).toBe('room-1');
    expect(data.participantName).toBe('alice');
    expect(data.participantToken).toBe('mock-token');
  });

  it('isHost omitted → roomAdmin is falsy', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice' });
    await GET(req);
    expect(capturedGrant().roomAdmin).toBeFalsy();
  });

  it('isHost=true → roomAdmin is true', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice', isHost: 'true' });
    await GET(req);
    expect(capturedGrant().roomAdmin).toBe(true);
  });

  it('isHost=false → roomAdmin is falsy', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice', isHost: 'false' });
    await GET(req);
    expect(capturedGrant().roomAdmin).toBeFalsy();
  });

  it('isHost=1 → roomAdmin is falsy', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice', isHost: '1' });
    await GET(req);
    expect(capturedGrant().roomAdmin).toBeFalsy();
  });

  it('isHost=yes → roomAdmin is falsy', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice', isHost: 'yes' });
    await GET(req);
    expect(capturedGrant().roomAdmin).toBeFalsy();
  });
});
