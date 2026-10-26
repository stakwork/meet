import { randomString } from '@/lib/client-utils';
import { ConnectionDetails } from '@/lib/types';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AccessToken, AccessTokenOptions, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const roomName = request.nextUrl.searchParams.get('roomName');
    const participantName = request.nextUrl.searchParams.get('participantName');
    const metadata = request.nextUrl.searchParams.get('metadata') ?? '';
    const region = request.nextUrl.searchParams.get('region');
    const livekitServerUrl = region ? getLiveKitURL(region) : LIVEKIT_URL;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    if (typeof roomName !== 'string') {
      return new NextResponse('Missing required query parameter: roomName', { status: 400 });
    }
    if (participantName === null) {
      return new NextResponse('Missing required query parameter: participantName', { status: 400 });
    }

    const isHost = request.nextUrl.searchParams.get('isHost') === 'true';

    // No credential ever goes into participant metadata: every participant in
    // the room can read it. Hive hands Jamie its credential through the
    // agent's dispatch metadata instead (sphinx-voice callCredentials.ts).

    // Generate participant token
    const participantToken = await createParticipantToken(
      {
        identity: `${participantName}__${randomString(4)}`,
        name: participantName,
        metadata,
      },
      roomName,
      isHost,
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: livekitServerUrl,
      roomName: roomName,
      participantToken: participantToken,
      participantName: participantName,
    };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  isHost: boolean = false,
) {
  const at = new AccessToken(API_KEY, API_SECRET, userInfo);
  at.ttl = '5m';
  // Jamie (sphinx-voice) only joins rooms it is dispatched to. A room this
  // token creates gets it transcribe-only; LiveKit applies a token's room
  // config only when the room is created, so a room Hive already created
  // and dispatched Jamie into (with its credential) is left as it is.
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: process.env.LIVEKIT_AGENT_NAME || 'jamie' })],
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    roomAdmin: isHost,
  };
  at.addGrant(grant);
  return at.toJwt();
}

/**
 * Get the LiveKit server URL for the given region.
 */
function getLiveKitURL(region: string | null): string {
  let targetKey = 'LIVEKIT_URL';
  if (region) {
    targetKey = `LIVEKIT_URL_${region}`.toUpperCase();
  }
  const url = process.env[targetKey];
  if (!url) {
    throw new Error(`${targetKey} is not defined`);
  }
  return url;
}
