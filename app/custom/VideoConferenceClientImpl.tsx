'use client';

import { formatChatMessageLinks, LiveKitRoom, VideoConference } from '@livekit/components-react';
import {
  DeviceUnsupportedError,
  ExternalE2EEKeyProvider,
  isE2EESupported,
  LogLevel,
  Room,
  RoomConnectOptions,
  RoomOptions,
  RoomEvent,
  VideoPresets,
  type TranscriptionSegment,
  type VideoCodec,
} from 'livekit-client';
import { DebugMode } from '@/lib/Debug';
import { useMemo, useEffect, useState } from 'react';
import { decodePassphrase } from '@/lib/client-utils';
import {
  E2EE_FAILED_MESSAGE,
  E2EE_UNSUPPORTED_MESSAGE,
  EncryptionNotice,
} from '@/lib/EncryptionNotice';

export function VideoConferenceClientImpl(props: {
  liveKitUrl: string;
  token: string;
  codec: VideoCodec | undefined;
}) {
  const e2eePassphrase =
    typeof window !== 'undefined' ? decodePassphrase(window.location.hash.substring(1)) : undefined;
  // Checked before the Room exists: `new Room()` with encryption throws on a
  // browser that can't encrypt, which would leave a blank page.
  const e2eeUnsupported = !!e2eePassphrase && !isE2EESupported();
  const worker =
    typeof window !== 'undefined' &&
    !e2eeUnsupported &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const keyProvider = new ExternalE2EEKeyProvider();

  const e2eeEnabled = !!(e2eePassphrase && worker);
  const roomOptions = useMemo((): RoomOptions => {
    return {
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeEnabled,
        ...(e2eeEnabled ? { dtx: false } : {}),
        videoCodec: props.codec,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      // `encryption`, not the deprecated `e2ee`: it encrypts the data channel too.
      encryption: e2eeEnabled
        ? {
            keyProvider,
            worker,
          }
        : undefined,
    };
  }, []);

  const room = useMemo(() => new Room(roomOptions), []);
  // An encrypted room connects only once encryption is on, never in the clear.
  const [e2eeReady, setE2eeReady] = useState(!e2eeEnabled && !e2eeUnsupported);
  const [e2eeError, setE2eeError] = useState<string | null>(null);
  // Set after the first render, which must match the server's.
  useEffect(() => {
    if (e2eeUnsupported) setE2eeError(E2EE_UNSUPPORTED_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!e2eeEnabled) return;
    keyProvider.setKey(e2eePassphrase);
    room
      .setE2EEEnabled(true)
      .then(() => setE2eeReady(true))
      .catch((e) => {
        console.error(e);
        setE2eeError(
          e instanceof DeviceUnsupportedError ? E2EE_UNSUPPORTED_MESSAGE : E2EE_FAILED_MESSAGE,
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  const connectOptions = useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  const [transcriptions, setTranscriptions] = useState<{ [id: string]: TranscriptionSegment }>({});
  useEffect(() => {
    if (!room) {
      return;
    }
    console.log('ROOM!!!');
    const updateTranscriptions = (segments: TranscriptionSegment[]) => {
      console.log('received transcriptions', segments);
      setTranscriptions((prev) => {
        const newTranscriptions = { ...prev };
        for (const segment of segments) {
          newTranscriptions[segment.id] = segment;
        }
        console.log('===>', newTranscriptions);
        return newTranscriptions;
      });
    };
    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions);
    };
  }, [room]);

  if (e2eeError) return <EncryptionNotice messages={[e2eeError]} fatal />;

  return (
    <LiveKitRoom
      room={room}
      token={props.token}
      connect={e2eeReady}
      connectOptions={connectOptions}
      serverUrl={props.liveKitUrl}
      audio={true}
      video={true}
    >
      <VideoConference chatMessageFormatter={formatChatMessageLinks} />
      <DebugMode logLevel={LogLevel.debug} />
    </LiveKitRoom>
  );
}
