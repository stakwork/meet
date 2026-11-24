/**
 * Live captions sent as `lk.transcription` text streams: how agents-js sends
 * a member's words, and how a Stadeum box's Jamie sends everyone's words in
 * its encrypted group calls (the streams are encrypted with the room, unlike
 * the old transcription packet). The box sends every caption as Jamie, so the
 * speaker is named from `lk.transcribed_track_id`, never from the sender.
 */

import { Encryption_Type } from 'livekit-client';

export const TRANSCRIPTION_TOPIC = 'lk.transcription';
export const ATTR_FINAL = 'lk.transcription_final';
export const ATTR_SEGMENT = 'lk.segment_id';
export const ATTR_TRACK = 'lk.transcribed_track_id';

/** The part of a participant a caption's speaker is looked up in. */
export interface CaptionParticipant {
  identity: string;
  name?: string;
  trackPublications: { has(sid: string): boolean };
}

/** The part of a room a caption's speaker is looked up in. */
export interface CaptionRoom {
  localParticipant: CaptionParticipant;
  remoteParticipants: { values(): Iterable<CaptionParticipant> };
}

/** The participant whose track `trackSid` is, local or remote. */
export function participantForTrack(
  room: CaptionRoom,
  trackSid: string,
): CaptionParticipant | undefined {
  if (room.localParticipant.trackPublications.has(trackSid)) return room.localParticipant;
  for (const p of Array.from(room.remoteParticipants.values())) {
    if (p.trackPublications.has(trackSid)) return p;
  }
  return undefined;
}

/**
 * Who spoke a caption stream's words.
 * - With `lk.transcribed_track_id`: the participant whose track that is, or
 *   nobody named when the track is not (or no longer) in the room. Never the
 *   sender, which on a box's call is Jamie for everyone.
 * - Without it: the stream's sender (a participant captioning its own words).
 */
export function captionSpeaker(
  room: CaptionRoom,
  attributes: Record<string, string> | undefined,
  senderIdentity: string,
): string {
  const trackSid = attributes?.[ATTR_TRACK];
  if (trackSid) {
    const p = participantForTrack(room, trackSid);
    return p ? p.name || p.identity : '';
  }
  if (senderIdentity === room.localParticipant.identity) {
    return room.localParticipant.name || senderIdentity;
  }
  for (const p of Array.from(room.remoteParticipants.values())) {
    if (p.identity === senderIdentity) return p.name || p.identity;
  }
  return senderIdentity;
}

/** A caption line as the overlay shows it: "Name: words". */
export function captionLine(speaker: string, text: string): string {
  return speaker ? `${speaker}: ${text}` : text;
}

/**
 * Whether a caption stream may be shown. In a call with a key, only a stream
 * that arrived encrypted with it: an unencrypted one could come from anyone
 * in the room without the key, putting words in a participant's mouth.
 */
export function captionStreamAllowed(
  callEncrypted: boolean,
  encryptionType: Encryption_Type | undefined,
): boolean {
  if (!callEncrypted) return true;
  return encryptionType !== undefined && encryptionType !== Encryption_Type.NONE;
}
