
'use client';

import { decodePassphrase } from '@/lib/client-utils';
import Transcript from '@/lib/Transcript';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';
import {
  LocalUserChoices,
  PreJoin,
  LiveKitRoom,
  TrackToggle,
  DisconnectButton,
  RoomAudioRenderer,
  GridLayout,
  useTracks,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  RoomEvent,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
  Track,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import '../../../styles/CustomControlBar.css';
const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(undefined);
  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: true,
      audioEnabled: true,
    };
  }, []);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(undefined);

  const handlePreJoinSubmit = React.useCallback(async (values: LocalUserChoices) => {
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
  }, [props.roomName, props.region]);

  const handlePreJoinError = React.useCallback((e: any) => console.error(e), []);

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      {connectionDetails === undefined || preJoinChoices === undefined ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
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
  const e2eePassphrase =
    typeof window !== 'undefined' && decodePassphrase(location.hash.substring(1));
  const worker =
    typeof window !== 'undefined' &&
    e2eePassphrase &&
    new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
  const e2eeEnabled = !!(e2eePassphrase && worker);
  const keyProvider = new ExternalE2EEKeyProvider();

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
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
        red: !e2eeEnabled,
        videoCodec,
      },
      audioCaptureDefaults: {
        deviceId: props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: e2eeEnabled
        ? { keyProvider, worker }
        : undefined,
    };
  }, [props.userChoices, props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);

  if (e2eeEnabled) {
    keyProvider.setKey(decodePassphrase(e2eePassphrase));
    room.setE2EEEnabled(true).catch((e) => {
      if (e instanceof DeviceUnsupportedError) {
        alert(
          `You're trying to join an encrypted meeting, but your browser does not support it. Please update it to the latest version and try again.`,
        );
        console.error(e);
      }
    });
  }

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return { autoSubscribe: true };
  }, []);

  const router = useRouter();
  const handleOnLeave = React.useCallback(() => router.push('/'), [router]);

  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { room }
  );

  return (
    <LiveKitRoom
      room={room}
      token={props.connectionDetails.participantToken}
      serverUrl={props.connectionDetails.serverUrl}
      connectOptions={connectOptions}
      video={props.userChoices.videoEnabled}
      audio={props.userChoices.audioEnabled}
      onDisconnected={handleOnLeave}
    >
      {tracks.length > 0 ? (
        <GridLayout tracks={tracks} style={{ height: 'calc(100vh - 60px)' }}>
          {(trackRef: TrackReferenceOrPlaceholder) => (
            <div
              key={trackRef.publication?.trackSid || `${trackRef.participant.identity}-${trackRef.source}`}
              style={{ position: 'relative', width: '100%', height: '100%' }}
            >
              <VideoTrack ref={trackRef} />
            </div>
          )}
        </GridLayout>
      ) : (
        <div style={{ height: 'calc(100vh - 60px)', display: 'grid', placeItems: 'center' }}>
          <p>No participants with video yet</p>
        </div>
      )}
      <RoomAudioRenderer />
      <CustomControlBar room={room} roomName={props.connectionDetails.roomName} />
      <Transcript latestText={''} />
    </LiveKitRoom>
  );
}

function VideoTrack({ ref: trackRef }: { ref: TrackReferenceOrPlaceholder }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    const track = trackRef.publication?.track;

    if (videoEl && track) {
      track.attach(videoEl);
      return () => {
        track.detach(videoEl);
      };
    }
  }, [trackRef.publication?.track]);

  return (
    <video
      ref={videoRef}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}

interface CustomControlBarProps {
  room: Room;
  roomName: string;
}
interface CustomControlBarProps {
  room: Room;
  roomName: string;
}

function CustomControlBar({ room, roomName }: CustomControlBarProps) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (room) {
      const updateRecordingStatus = () => setRecording(room.isRecording);
      room.on(RoomEvent.LocalTrackPublished, updateRecordingStatus);
      room.on(RoomEvent.LocalTrackUnpublished, updateRecordingStatus);
      return () => {
        room.off(RoomEvent.LocalTrackPublished, updateRecordingStatus);
        room.off(RoomEvent.LocalTrackUnpublished, updateRecordingStatus);
      };
    }
  }, [room]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => alert('Link copied to clipboard!'))
      .catch((err) => console.error('Failed to copy link:', err));
  };

  return (
    <div className="custom-control-bar">
      {/* Left: Room Name Box */}
      <div className="room-name-box">
        <span className="room-name">{roomName}</span>
        <button className="copy-link-button" onClick={handleCopyLink}>
          <span className="material-symbols-outlined">content_copy</span>
        </button>
      </div>

      {/* Center: Control Buttons */}
      <div className="control-buttons">
        <TrackToggle source={Track.Source.Microphone} className="control-button mic-button" />
        <TrackToggle source={Track.Source.Camera} className="control-button camera-button" />
        {recording ? (
          <div className="control-button record-sign">
            <span className="material-symbols-outlined">radio_button_checked</span>
          </div>
        ) : (
          <div className="control-button record-sign disabled">
            <span className="material-symbols-outlined">radio_button_checked</span>
          </div>
        )}
        <TrackToggle source={Track.Source.ScreenShare} className="control-button screen-share-button" />
        <DisconnectButton className="control-button end-call-button">
          <span className="material-symbols-outlined">call_end</span>
        </DisconnectButton>
      </div>

      {/* Right: Settings Button */}
      <div className="settings-section">
        {SHOW_SETTINGS_MENU && (
          <button className="settings-button">
            <span className="material-symbols-outlined">settings</span>
          </button>
        )}
      </div>
    </div>
  );
}

