import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const roomName = req.nextUrl.searchParams.get('roomName');
    const now = req.nextUrl.searchParams.get('now');

    // new Date(Date.now()).toISOString();
    /**
     * CAUTION:
     * for simplicity this implementation does not authenticate users and therefore allows anyone with knowledge of a roomName
     * to start/stop recordings for that room.
     * DO NOT USE THIS FOR PRODUCTION PURPOSES AS IS
     */

    if (roomName === null) {
      return new NextResponse('Missing roomName parameter', { status: 403 });
    }
    if (now === null) {
      return new NextResponse('Missing now parameter', { status: 403 });
    }

    const {
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      LIVEKIT_URL,
      S3_KEY_ID,
      S3_KEY_SECRET,
      S3_BUCKET,
      S3_ENDPOINT,
      S3_REGION,
      RUNNER_URL,
      RUNNER_SECRET,
    } = process.env;

    const hostURL = new URL(LIVEKIT_URL!);
    hostURL.protocol = 'https:';

    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    const existingEgresses = await egressClient.listEgress({ roomName });
    if (existingEgresses.length > 0 && existingEgresses.some((e) => e.status < 2)) {
      return new NextResponse('Meeting is already being recorded', { status: 409 });
    }

    const filepath = `${now}-${roomName}.mp4`;
    const fileOutput = new EncodedFileOutput({
      filepath: filepath,
      output: {
        case: 's3',
        value: new S3Upload({
          // endpoint: S3_ENDPOINT,
          accessKey: S3_KEY_ID,
          secret: S3_KEY_SECRET,
          region: S3_REGION,
          bucket: S3_BUCKET,
        }),
      },
    });

    await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: fileOutput,
      },
      {
        layout: 'speaker',
      },
    );

    if (RUNNER_URL && RUNNER_SECRET) {
      post_runner(RUNNER_URL, RUNNER_SECRET, filepath);
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

async function post_runner(url: string, token: string, filepath: string) {
  const humanReadableDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  try {
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        filepath,
        show_title: 'Meeting',
        episode_title: `Live call ${humanReadableDate}`,
      }),
      headers: { 'x-admin-token': token },
    });
  } catch (e) {
    console.error(e);
  }
}
