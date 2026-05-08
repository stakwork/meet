import { GET } from './route';
import { NextRequest } from 'next/server';

const mockListParticipants = jest.fn();

jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    listParticipants: mockListParticipants,
  })),
}));

beforeAll(() => {
  process.env.LIVEKIT_URL = 'wss://test.livekit.io';
  process.env.LIVEKIT_API_KEY = 'test-key';
  process.env.LIVEKIT_API_SECRET = 'test-secret';
});

beforeEach(() => mockListParticipants.mockReset());

function makeRequest(roomName?: string) {
  const url = roomName
    ? `http://localhost/api/participants?roomName=${roomName}`
    : 'http://localhost/api/participants';
  return new NextRequest(url);
}

describe('GET /api/participants', () => {
  it('returns [] for empty room', async () => {
    mockListParticipants.mockResolvedValue([]);
    const res = await GET(makeRequest('my-room'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('excludes participants with metadata.hidden = true', async () => {
    mockListParticipants.mockResolvedValue([
      { identity: 'alice', name: 'Alice', metadata: JSON.stringify({ hidden: true }) },
      { identity: 'bob', name: 'Bob', metadata: JSON.stringify({ hidden: false }) },
    ]);
    const res = await GET(makeRequest('my-room'));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].nickname).toBe('Bob');
  });

  it('populates avatarUrl from metadata.profilePictureUrl', async () => {
    mockListParticipants.mockResolvedValue([
      {
        identity: 'alice',
        name: 'Alice',
        metadata: JSON.stringify({ profilePictureUrl: 'https://example.com/pic.jpg' }),
      },
    ]);
    const res = await GET(makeRequest('my-room'));
    const data = await res.json();
    expect(data[0].avatarUrl).toBe('https://example.com/pic.jpg');
  });

  it('returns avatarUrl: null and nickname from identity when no metadata', async () => {
    mockListParticipants.mockResolvedValue([
      { identity: 'charlie', name: '', metadata: '' },
    ]);
    const res = await GET(makeRequest('my-room'));
    const data = await res.json();
    expect(data[0].avatarUrl).toBeNull();
    expect(data[0].nickname).toBe('charlie');
  });

  it('handles malformed metadata gracefully — included with avatarUrl: null', async () => {
    mockListParticipants.mockResolvedValue([
      { identity: 'dan', name: 'Dan', metadata: 'not-json' },
    ]);
    const res = await GET(makeRequest('my-room'));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].avatarUrl).toBeNull();
    expect(data[0].nickname).toBe('Dan');
  });

  it('returns 400 when roomName param is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/roomName/);
  });

  it('returns 500 when LiveKit SDK throws an error', async () => {
    mockListParticipants.mockRejectedValue(new Error('SDK failure'));
    const res = await GET(makeRequest('my-room'));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('SDK failure');
  });
});
