import { RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const roomName = req.nextUrl.searchParams.get('roomName');

    if (!roomName) {
      return NextResponse.json({ error: 'Missing required parameter: roomName' }, { status: 400 });
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

    const hostURL = new URL(LIVEKIT_URL!);
    hostURL.protocol = 'https:';

    const roomClient = new RoomServiceClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const participants = await roomClient.listParticipants(roomName);

    const result = participants
      .filter((p) => {
        if (!p.metadata) return true;
        try {
          return JSON.parse(p.metadata).hidden !== true;
        } catch {
          return true;
        }
      })
      .map((p) => {
        let avatarUrl: string | null = null;
        if (p.metadata) {
          try {
            avatarUrl = JSON.parse(p.metadata).profilePictureUrl ?? null;
          } catch {
            // ignore malformed metadata
          }
        }
        return {
          nickname: p.name || p.identity,
          avatarUrl,
        };
      });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
