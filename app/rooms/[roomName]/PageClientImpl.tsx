'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { decodePassphrase } from '@/lib/client-utils';
import { ConnectionDetails } from '@/lib/types';
import {
  LocalUserChoices,
  PreJoin,
  LiveKitRoom,
  RoomAudioRenderer,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  isE2EESupported,
  RoomConnectOptions,
  RoomEvent,
  TranscriptionSegment,
  Participant,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import '../../../styles/PageClientImpl.css';
import { CustomVideoLayoutContextProvider } from '@/app/custom/layout/LayoutContextProvider';
import CustomVideoLayout from '@/app/custom/layout/CustomVideoLayout';
import Transcript from '@/lib/Transcript';
import {
  E2EE_FAILED_MESSAGE,
  E2EE_UNSUPPORTED_MESSAGE,
  EncryptionNotice,
  encryptionErrorMessage,
} from '@/lib/EncryptionNotice';
import {
  TRANSCRIPTION_TOPIC,
  captionLine,
  captionPacketAllowed,
  captionSpeaker,
  captionStreamAllowed,
} from '@/lib/captions';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT || '/api/connection-details';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}) {
  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | undefined>(undefined);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | undefined>(
    undefined,
  );

  const preJoinDefaults = useMemo(() => {
    return {
      username: '',
      videoEnabled: true,
      audioEnabled: true,
    };
  }, []);

  const handlePreJoinSubmit = async (values: LocalUserChoices) => {
    setPreJoinChoices(values);
    const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
    url.searchParams.append('roomName', props.roomName);
    url.searchParams.append('participantName', values.username);
    if (props.region) {
      url.searchParams.append('region', props.region);
    }
    const connectionDetailsResp = await fetch(url.toString());
    const connectionDetailsData = await connectionDetailsResp.json();
    setConnectionDetails(connectionDetailsData);
  };

  const handlePreJoinError = (e: any) => console.error(e);

  return (
    <main data-lk-theme="default" className="main-container">
      {connectionDetails === undefined || preJoinChoices === undefined ? (
        <div className="pre-join-container">
          <PreJoin
            defaults={preJoinDefaults}
            onSubmit={handlePreJoinSubmit}
            onError={handlePreJoinError}
          />
        </div>
      ) : (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{ codec: props.codec, hq: props.hq }}
        />
      )}
    </main>
  );
}

function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: { hq: boolean; codec: VideoCodec };
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getE2EEConfig = () => {
    if (typeof window === 'undefined')
      return {
        enabled: false,
        unsupported: false,
        passphrase: undefined,
        worker: undefined,
      };

    // The call's key, as a Stadeum box's group call link carries it
    // (/rooms/<room>#<key>). Its UTF-8 bytes are the shared key, with
    // LiveKit's default salt, as Peel and the box key it: never hash or
    // decode it any other way.
    const e2eePassphrase = decodePassphrase(location.hash.substring(1));
    // Checked before the Room exists: `new Room()` with encryption throws on a
    // browser that can't encrypt, which would leave a blank page.
    const unsupported = !!e2eePassphrase && !isE2EESupported();
    const worker =
      e2eePassphrase && !unsupported
        ? new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))
        : undefined;
    const e2eeEnabled = !!(e2eePassphrase && worker);

    return {
      enabled: e2eeEnabled,
      unsupported,
      passphrase: e2eePassphrase,
      worker,
    };
  };

  const e2eeConfig = useMemo(() => getE2EEConfig(), []);
  const keyProvider = useMemo(() => new ExternalE2EEKeyProvider(), []);

  const roomOptions = useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeConfig.enabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    return {
      videoCaptureDefaults: {
        deviceId: props.userChoices.videoDeviceId ?? undefined,
        resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
      },
      publishDefaults: {
        dtx: false,
        videoSimulcastLayers: props.options.hq
          ? [VideoPresets.h1080, VideoPresets.h720]
          : [VideoPresets.h540, VideoPresets.h216],
        red: !e2eeConfig.enabled,
        videoCodec,
      },
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      // `encryption`, not the deprecated `e2ee`: it encrypts the data channel
      // too (chat, text streams, RPC, user data packets), not only the media.
      ...(e2eeConfig.enabled && e2eeConfig.worker
        ? { encryption: { keyProvider, worker: e2eeConfig.worker } }
        : null),
    };
  }, [props.userChoices, props.options.hq, props.options.codec, e2eeConfig]);

  const room = useMemo(() => new Room(roomOptions), [roomOptions]);

  // An encrypted call connects only once encryption is on; one that cannot
  // turn it on never connects, and says why.
  const [e2eeReady, setE2eeReady] = useState(!e2eeConfig.enabled && !e2eeConfig.unsupported);
  const [e2eeFatal, setE2eeFatal] = useState<string[]>(
    e2eeConfig.unsupported ? [E2EE_UNSUPPORTED_MESSAGE] : [],
  );
  const [e2eeNotices, setE2eeNotices] = useState<string[]>([]);
  const fatalRef = useRef(false);

  const failEncryption = (message: string) => {
    fatalRef.current = true;
    setE2eeFatal((prev) => (prev.includes(message) ? prev : [...prev, message]));
    room.disconnect().catch(() => undefined);
  };

  useEffect(() => {
    if (!e2eeConfig.enabled || !e2eeConfig.passphrase) return;
    keyProvider.setKey(decodePassphrase(e2eeConfig.passphrase));
    room
      .setE2EEEnabled(true)
      .then(() => setE2eeReady(true))
      .catch((e) => {
        console.error(e);
        failEncryption(
          e instanceof DeviceUnsupportedError ? E2EE_UNSUPPORTED_MESSAGE : E2EE_FAILED_MESSAGE,
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, e2eeConfig, keyProvider]);

  useEffect(() => {
    if (!e2eeConfig.enabled) return;
    let wasEncrypted = false;
    const onStatus = (encrypted: boolean, participant?: Participant) => {
      if (participant && !participant.isLocal) return;
      if (encrypted) wasEncrypted = true;
      else if (wasEncrypted) failEncryption('Encryption was turned off during the call.');
    };
    const onError = (error: Error, participant?: Participant) => {
      console.error('encryption error', error, participant?.identity);
      const who =
        participant && !participant.isLocal ? participant.name || participant.identity : '';
      const message = encryptionErrorMessage(who);
      setE2eeNotices((prev) => (prev.includes(message) ? prev : [...prev, message]));
    };
    room.on(RoomEvent.ParticipantEncryptionStatusChanged, onStatus);
    room.on(RoomEvent.EncryptionError, onError);
    return () => {
      room.off(RoomEvent.ParticipantEncryptionStatusChanged, onStatus);
      room.off(RoomEvent.EncryptionError, onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, e2eeConfig]);

  const connectOptions = useMemo((): RoomConnectOptions => {
    return { autoSubscribe: true };
  }, []);

  const router = useRouter();
  const handleOnLeave = () => {
    // Stay on the page that says why the encrypted call ended.
    if (fatalRef.current) return;
    router.push('/');
  };

  const [latestText, setLatestText] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!room) return;

    const showCaption = (text: string) => {
      setLatestText(text);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setLatestText(''), 4400);
    };

    // Hive's calls: LiveKit's old transcription packet. It is never
    // encrypted, so a call with a key ignores it (anyone without the key could
    // send one) and shows only the encrypted text streams below.
    const updateTranscriptions = (segments: TranscriptionSegment[], participant?: Participant) => {
      if (!captionPacketAllowed(e2eeConfig.enabled)) return;
      if (segments.length > 0) {
        const name = participant?.name || participant?.identity || '';
        const prefix = name ? `${name}: ` : '';
        showCaption(`${prefix}${segments[0].text}`);
      }
    };

    // A box's calls (and agents-js): `lk.transcription` text streams,
    // encrypted with the room. The speaker is the owner of the transcribed
    // track, never the sender (the box sends everyone's words as Jamie).
    const onTranscriptionStream: Parameters<Room['registerTextStreamHandler']>[1] = (
      reader,
      { identity },
    ) => {
      // In a call with a key, a caption that arrived in the clear could be
      // anyone's: someone without the key could put words on screen.
      if (!captionStreamAllowed(e2eeConfig.enabled, reader.info.encryptionType)) {
        console.warn('dropped an unencrypted caption stream from', identity);
        return;
      }
      void (async () => {
        try {
          let text = '';
          for await (const chunk of reader) {
            text += chunk;
            const speaker = captionSpeaker(room, reader.info.attributes, identity);
            if (text.trim()) showCaption(captionLine(speaker, text));
          }
        } catch (e) {
          console.error('caption stream failed', e);
        }
      })();
    };

    room.on(RoomEvent.TranscriptionReceived, updateTranscriptions);
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, onTranscriptionStream);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateTranscriptions);
      room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [room, e2eeConfig]);

  if (!isClient) return null;

  if (e2eeFatal.length > 0) return <EncryptionNotice messages={e2eeFatal} fatal />;

  return (
    <LiveKitRoom
      room={room}
      token={props.connectionDetails.participantToken}
      serverUrl={props.connectionDetails.serverUrl}
      connect={e2eeReady}
      connectOptions={connectOptions}
      video={props.userChoices.videoEnabled}
      audio={props.userChoices.audioEnabled}
      onDisconnected={handleOnLeave}
    >
      <CustomVideoLayoutContextProvider>
        <CustomVideoLayout />
        <RoomAudioRenderer />
      </CustomVideoLayoutContextProvider>
      <Transcript latestText={latestText} />
      <EncryptionNotice
        messages={e2eeNotices}
        onDismiss={(m) => setE2eeNotices((prev) => prev.filter((x) => x !== m))}
      />
    </LiveKitRoom>
  );
}
