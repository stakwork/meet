import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, participantIdentity } = body;

    if (!roomName || !participantIdentity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const verifier = new TokenVerifier(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);
    const claims = await verifier.verify(token);

    if (!claims.video?.roomAdmin || claims.video.room !== roomName) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const hostURL = new URL(LIVEKIT_URL!);
    hostURL.protocol = 'https:';

    const roomClient = new RoomServiceClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await roomClient.removeParticipant(roomName, participantIdentity);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('not found') || msg.includes('404')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
