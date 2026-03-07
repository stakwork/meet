'use client';

import type { ReceivedChatMessage } from '@livekit/components-core';
import React from 'react';
import { chatMessageFormatter } from './chatMessageFormatter';

/** Extended message type that may carry a `sender` field set by the voice agent. */
interface VoiceChatMessage extends ReceivedChatMessage {
  sender?: string;
}

interface CustomChatEntryProps {
  entry: VoiceChatMessage;
  hideName?: boolean;
  hideTimestamp?: boolean;
  messageFormatter?: (message: string) => React.ReactNode;
}

/**
 * Custom ChatEntry that uses the `sender` field (set by the voice agent for
 * voice commands) to display the actual speaker's name instead of the agent's.
 */
export const CustomChatEntry = React.forwardRef<HTMLLIElement, CustomChatEntryProps>(
  function CustomChatEntry({ entry, hideName = false, hideTimestamp = false }, _ref) {
    const formatted = chatMessageFormatter(entry.message);
    const hasBeenEdited = !!entry.editTimestamp;
    const time = new Date(entry.timestamp);
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

    // Use the explicit sender field (voice commands) or fall back to the from participant
    const displayName = entry.sender ?? entry.from?.name ?? entry.from?.identity;

    return (
      <li
        ref={_ref}
        className="lk-chat-entry"
        title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
        data-lk-message-origin={entry.from?.isLocal ? 'local' : 'remote'}
      >
        {(!hideTimestamp || !hideName || hasBeenEdited) && (
          <span className="lk-meta-data">
            {!hideName && <strong className="lk-participant-name">{displayName}</strong>}
            {(!hideTimestamp || hasBeenEdited) && (
              <span className="lk-timestamp">
                {hasBeenEdited && 'edited '}
                {time.toLocaleTimeString(locale, { timeStyle: 'short' })}
              </span>
            )}
          </span>
        )}
        <span className="lk-message-body">{formatted}</span>
      </li>
    );
  },
);
