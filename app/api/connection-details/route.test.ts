import { GET } from './route';
import { NextRequest } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

const mockToJwt = jest.fn();
const mockAddGrant = jest.fn();
/** Every token the route built, to read what it set on them (roomConfig). */
const mockTokens: Array<{
  toJwt: jest.Mock;
  roomConfig?: { agents: Array<{ agentName: string; metadata: string }> };
}> = [];

jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn().mockImplementation(() => {
    const token = {
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
      set ttl(_: string) {},
    };
    mockTokens.push(token);
    return token;
  }),
}));

// Capture the grant passed to addGrant
function capturedGrant(): Record<string, unknown> {
  return mockAddGrant.mock.calls[0][0];
}

// Capture the AccessTokenOptions (userInfo) passed to the AccessToken constructor
function capturedTokenOptions(): { metadata?: string } {
  return (AccessToken as unknown as jest.Mock).mock.calls[0][2];
}

function capturedMetadata(): Record<string, unknown> {
  const meta = capturedTokenOptions().metadata;
  return meta ? JSON.parse(meta) : {};
}

beforeAll(() => {
  process.env.LIVEKIT_URL = 'wss://test.livekit.io';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret';
});

beforeEach(() => {
  mockTokens.length = 0;
  delete process.env.LIVEKIT_AGENT_NAME;
  mockAddGrant.mockReset();
  mockToJwt.mockReset();
  mockToJwt.mockResolvedValue('mock-token');
  (AccessToken as unknown as jest.Mock).mockClear();
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

  it('never puts a callKey or hiveToken in participant metadata', async () => {
    // Every participant can read participant metadata.
    const req = makeRequest({
      roomName: 'room-1',
      participantName: 'alice',
      callKey: 'key-abc',
      hiveToken: 'tok-xyz',
    });
    await GET(req);
    expect(capturedMetadata().callKey).toBeUndefined();
    expect(capturedMetadata().hiveToken).toBeUndefined();
  });

  it('passes caller metadata through unchanged', async () => {
    const metadata = JSON.stringify({ profilePictureUrl: 'http://example.com/a.png' });
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice', metadata });
    await GET(req);
    expect(capturedTokenOptions().metadata).toBe(metadata);
  });

  it('dispatches Jamie, without metadata, into a room the token creates', async () => {
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice' });
    await GET(req);
    const agents = mockTokens[0]?.roomConfig?.agents ?? [];
    expect(agents).toHaveLength(1);
    expect(agents[0].agentName).toBe('jamie');
    expect(agents[0].metadata).toBe('');
  });

  it('dispatches the agent named by LIVEKIT_AGENT_NAME', async () => {
    process.env.LIVEKIT_AGENT_NAME = 'jamie-dev';
    const req = makeRequest({ roomName: 'room-1', participantName: 'alice' });
    await GET(req);
    expect(mockTokens[0]?.roomConfig?.agents[0].agentName).toBe('jamie-dev');
  });
});
