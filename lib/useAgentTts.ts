'use client';

import { useState, useEffect, useCallback } from 'react';
import { Room, RoomEvent } from 'livekit-client';

/**
 * Track the voice agent's TTS attribute. Returns the current state ("on" | "off" | null)
 * and a toggle function. Returns null when no agent is present in the room.
 */
export function useAgentTts(room: Room) {
  /** Find the agent participant (the one with a `tts` attribute). */
  const findAgent = useCallback(() => {
    for (const [, p] of room.remoteParticipants) {
      if (p.attributes?.tts !== undefined) return p;
    }
    return undefined;
  }, [room]);

  const [ttsState, setTtsState] = useState<string | null>(() => {
    return findAgent()?.attributes?.tts ?? null;
  });

  useEffect(() => {
    const update = () => {
      setTtsState(findAgent()?.attributes?.tts ?? null);
    };
    room.on(RoomEvent.Connected, update);
    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    room.on(RoomEvent.ParticipantAttributesChanged, update);
    update();
    return () => {
      room.off(RoomEvent.Connected, update);
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
      room.off(RoomEvent.ParticipantAttributesChanged, update);
    };
  }, [room, findAgent]);

  const toggle = useCallback(() => {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'tts-toggle' }));
    room.localParticipant.publishData(payload, { reliable: true, topic: 'lk-chat-topic' });
  }, [room]);

  return { ttsState, toggle };
}
