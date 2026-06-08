export const runtime = 'nodejs'; // REQUIRED — prevents Edge runtime; subscriptionMap sharing is handled via global in lib/wsServer.ts

import { WebhookReceiver } from 'livekit-server-sdk';
import { broadcastToRoom, subscriptionMap } from '@/lib/wsServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const authHeader = request.headers.get('Authorization');

  const receiver = new WebhookReceiver(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
  );

  let event;
  try {
    event = await receiver.receive(body, authHeader ?? undefined);
  } catch (err) {
    console.error('[webhook] signature verification failed', err);
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log(`[webhook] received event: ${event.event}`);

  const roomName = event.room?.name;
  if (!roomName) return new NextResponse(null, { status: 200 });

  const participant = event.participant;

  switch (event.event) {
    case 'participant_joined':
      broadcastToRoom(roomName, {
        type: 'participant_joined',
        roomName,
        participant: {
          identity: participant?.identity,
          nickname: participant?.name,
          avatarUrl: safeParseMetadata(participant?.metadata)?.avatarUrl ?? '',
        },
      });
      break;
    case 'participant_left':
      broadcastToRoom(roomName, {
        type: 'participant_left',
        roomName,
        identity: participant?.identity,
      });
      break;
    case 'room_finished':
      broadcastToRoom(roomName, { type: 'room_finished', roomName });
      subscriptionMap.delete(roomName);
      break;
  }

  return new NextResponse(null, { status: 200 });
}

function safeParseMetadata(metadata?: string): Record<string, string> | null {
  try {
    return metadata ? JSON.parse(metadata) : null;
  } catch {
    return null;
  }
}
