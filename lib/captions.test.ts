import { Encryption_Type } from 'livekit-client';
import {
  captionLine,
  captionPacketAllowed,
  captionSpeaker,
  captionStreamAllowed,
  participantForTrack,
  type CaptionRoom,
} from './captions';

function participant(identity: string, name: string, tracks: string[]) {
  return { identity, name, trackPublications: new Set(tracks) };
}

const jamie = participant('jamie-box', 'Jamie', ['TR_jamie_mic']);
const alice = participant('box_alice', 'Alice', ['TR_alice_mic', 'TR_alice_cam']);
const me = participant('me__abc', 'Bob', ['TR_bob_mic']);

const room: CaptionRoom = {
  localParticipant: me,
  remoteParticipants: new Map([
    [jamie.identity, jamie],
    [alice.identity, alice],
  ]),
};

describe('captionSpeaker', () => {
  it('names the owner of lk.transcribed_track_id, not the sender (Jamie)', () => {
    expect(captionSpeaker(room, { 'lk.transcribed_track_id': 'TR_alice_mic' }, 'jamie-box')).toBe(
      'Alice',
    );
  });

  it('finds the local participant by its own track', () => {
    expect(captionSpeaker(room, { 'lk.transcribed_track_id': 'TR_bob_mic' }, 'jamie-box')).toBe(
      'Bob',
    );
  });

  it('names nobody for a track that is not in the room', () => {
    expect(captionSpeaker(room, { 'lk.transcribed_track_id': 'TR_gone' }, 'jamie-box')).toBe('');
  });

  it('falls back to the sender without a track attribute', () => {
    expect(captionSpeaker(room, {}, 'jamie-box')).toBe('Jamie');
    expect(captionSpeaker(room, undefined, 'me__abc')).toBe('Bob');
    expect(captionSpeaker(room, undefined, 'stranger')).toBe('stranger');
  });
});

describe('participantForTrack', () => {
  it('returns undefined for an unknown track', () => {
    expect(participantForTrack(room, 'nope')).toBeUndefined();
  });
});

describe('captionLine', () => {
  it('prefixes the speaker when known', () => {
    expect(captionLine('Alice', 'hello')).toBe('Alice: hello');
    expect(captionLine('', 'hello')).toBe('hello');
  });
});

describe('captionStreamAllowed', () => {
  it('drops an unencrypted stream in a call with a key', () => {
    expect(captionStreamAllowed(true, Encryption_Type.NONE)).toBe(false);
    expect(captionStreamAllowed(true, undefined)).toBe(false);
  });

  it('shows an encrypted stream in a call with a key', () => {
    expect(captionStreamAllowed(true, Encryption_Type.GCM)).toBe(true);
  });

  it('shows every stream in a call without a key', () => {
    expect(captionStreamAllowed(false, Encryption_Type.NONE)).toBe(true);
    expect(captionStreamAllowed(false, undefined)).toBe(true);
  });
});

describe('captionPacketAllowed', () => {
  it('ignores the unencrypted transcription packet in a call with a key', () => {
    expect(captionPacketAllowed(true)).toBe(false);
  });

  it("shows it in a call without a key, as Hive's calls send it", () => {
    expect(captionPacketAllowed(false)).toBe(true);
  });
});
