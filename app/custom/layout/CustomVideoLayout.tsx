import React, { useEffect } from 'react';
import {
  GridLayout,
  useTracks,
  Chat,
  CarouselLayout,
  usePinnedTracks,
  useLayoutContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { CustomControlBar } from '@/app/custom/CustomControlBar';
import ParticipantList from '@/app/custom/ParticipantList';
import { ParticipantTile } from '@/lib/ParticipantTile';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { useCustomLayoutContext } from '@/app/contexts/layout-context';
import { isHiddenParticipant } from '@/lib/client-utils';
import '@/styles/Chat.css';
import { FocusLayout, FocusLayoutContainer } from './FocusLayout';
import { chatMessageFormatter } from '@/lib/chatMessageFormatter';
import { CustomChatEntry } from '@/lib/CustomChatEntry';

export const CustomVideoLayout: React.FC = () => {
  const { isChatOpen, isParticipantsListOpen } = useCustomLayoutContext();
  const layoutContext = useLayoutContext();

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Filter out participants marked as hidden (e.g. transcribe-only agents)
  const tracks = allTracks.filter((t) => !isHiddenParticipant(t.participant.metadata));

  const focusTrack = usePinnedTracks()[0];

  return (
    <div
      className={`video-layout${isChatOpen.state ? ' chat-open' : ''}${isParticipantsListOpen.state ? ' participants-open' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100dvh',
        width: '100vw',
        position: 'relative',
        backgroundColor: '#070707',
      }}
    >
      <div
        className="video-area"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          {!focusTrack ? (
            <GridLayout
              tracks={tracks}
              style={{
                width: '100%',
                padding: '1rem 1rem 0.5rem 1rem',
              }}
            >
              <ParticipantTile />
            </GridLayout>
          ) : (
            <FocusLayoutContainer
              style={{
                width: '100%',
                height: '93%',
                padding: '1rem 1rem 0.5rem 1rem',
              }}
            >
              <CarouselLayout tracks={tracks}>
                <ParticipantTile />
              </CarouselLayout>
              {focusTrack && <FocusLayout style={{ width: '100%' }} trackRef={focusTrack} />}{' '}
            </FocusLayoutContainer>
          )}
          <CustomControlBar />
        </div>
      </div>
      <div className="side-panel-wrapper participants-panel" style={{ display: isParticipantsListOpen.state ? 'contents' : 'none' }}>
        <ParticipantList />
      </div>
      <div className="side-panel-wrapper chat-panel" style={{ display: isChatOpen.state ? 'contents' : 'none' }}>
        <Chat messageFormatter={chatMessageFormatter}>
          <CustomChatEntry entry={{} as any} />
        </Chat>
      </div>
      <SettingsMenu showSettings={layoutContext.widget.state?.showSettings || false} />
    </div>
  );
};

export default CustomVideoLayout;
