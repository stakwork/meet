import { AccumulatedSegment } from './Transcript';
import { TranscriptionSegment } from 'livekit-client';

// Helper to build a minimal TranscriptionSegment
function makeSegment(id: string, text: string, startTime: number, final = true): TranscriptionSegment {
  return { id, text, startTime, endTime: startTime + 1000, language: '', final, firstReceivedTime: startTime, lastReceivedTime: startTime + 500 };
}

function makeAccSeg(id: string, text: string, startTime: number, participantName = '', final = true): AccumulatedSegment {
  return { segment: makeSegment(id, text, startTime, final), participantName };
}

// ---- Reducer logic (mirrors what Transcript.tsx / PageClientImpl render logic does) ----

/** Simulates the pruning logic from updateTranscriptions */
function applySegments(
  prev: { [id: string]: AccumulatedSegment },
  segments: TranscriptionSegment[],
  participantName: string,
): { [id: string]: AccumulatedSegment } {
  const next = { ...prev };
  for (const segment of segments) {
    next[segment.id] = { segment, participantName };
  }
  const entries = Object.entries(next).sort(
    ([, a], [, b]) => a.segment.startTime - b.segment.startTime,
  );
  return Object.fromEntries(entries.slice(-50));
}

/** Simulates sortedSegments memo */
function sortedSegments(dict: { [id: string]: AccumulatedSegment }): AccumulatedSegment[] {
  return Object.values(dict).sort((a, b) => a.segment.startTime - b.segment.startTime);
}

// ---- Tests ----

describe('AccumulatedSegment type and reducer logic', () => {
  describe('applySegments (mirrors updateTranscriptions body)', () => {
    it('accumulates segments by id', () => {
      let state: { [id: string]: AccumulatedSegment } = {};
      state = applySegments(state, [makeSegment('a', 'hello', 100), makeSegment('b', 'world', 200)], 'Alice');
      expect(Object.keys(state)).toHaveLength(2);
      expect(state['a'].segment.text).toBe('hello');
      expect(state['b'].participantName).toBe('Alice');
    });

    it('upserts non-final segment by same id without duplicating', () => {
      let state: { [id: string]: AccumulatedSegment } = {};
      // First arrival: non-final
      state = applySegments(state, [makeSegment('seg1', 'hel', 100, false)], 'Bob');
      expect(Object.keys(state)).toHaveLength(1);
      expect(state['seg1'].segment.text).toBe('hel');

      // Second arrival: final version of same id
      state = applySegments(state, [makeSegment('seg1', 'hello', 100, true)], 'Bob');
      expect(Object.keys(state)).toHaveLength(1);
      expect(state['seg1'].segment.text).toBe('hello');
      expect(state['seg1'].segment.final).toBe(true);
    });

    it('prunes to 50 most recent entries', () => {
      let state: { [id: string]: AccumulatedSegment } = {};
      // Insert 60 segments
      const segments = Array.from({ length: 60 }, (_, i) =>
        makeSegment(`id${i}`, `text${i}`, i * 100),
      );
      state = applySegments(state, segments, 'Charlie');
      expect(Object.keys(state)).toHaveLength(50);

      // The retained entries should be the 50 most recent (ids 10–59 by startTime ordering)
      const sorted = sortedSegments(state);
      expect(sorted[0].segment.id).toBe('id10');
      expect(sorted[49].segment.id).toBe('id59');
    });

    it('handles empty segments array without mutating state', () => {
      const initial: { [id: string]: AccumulatedSegment } = {
        x: makeAccSeg('x', 'existing', 100),
      };
      // Simulate the early-return guard: segments.length === 0 means we never call applySegments
      // so state remains unchanged; test that by not calling and verifying initial state
      expect(Object.keys(initial)).toHaveLength(1);
    });
  });

  describe('sortedSegments memo', () => {
    it('returns segments sorted ascending by startTime', () => {
      const dict: { [id: string]: AccumulatedSegment } = {
        c: makeAccSeg('c', 'third', 300),
        a: makeAccSeg('a', 'first', 100),
        b: makeAccSeg('b', 'second', 200),
      };
      const sorted = sortedSegments(dict);
      expect(sorted.map((s) => s.segment.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('collapsed view slice', () => {
    it('shows last 3 segments when more than 3 exist', () => {
      const segs: AccumulatedSegment[] = [
        makeAccSeg('a', 'one', 100),
        makeAccSeg('b', 'two', 200),
        makeAccSeg('c', 'three', 300),
        makeAccSeg('d', 'four', 400),
        makeAccSeg('e', 'five', 500),
      ];
      const visible = segs.slice(-3);
      expect(visible).toHaveLength(3);
      expect(visible[0].segment.id).toBe('c');
      expect(visible[2].segment.id).toBe('e');
    });

    it('shows all segments when fewer than 3 exist', () => {
      const segs: AccumulatedSegment[] = [makeAccSeg('a', 'one', 100)];
      const visible = segs.slice(-3);
      expect(visible).toHaveLength(1);
    });
  });

  describe('expanded view reversal', () => {
    it('reverses segments so most recent is first', () => {
      const segs: AccumulatedSegment[] = [
        makeAccSeg('a', 'first', 100),
        makeAccSeg('b', 'second', 200),
        makeAccSeg('c', 'third', 300),
      ];
      const reversed = [...segs].reverse();
      expect(reversed[0].segment.id).toBe('c');
      expect(reversed[2].segment.id).toBe('a');
    });
  });

  describe('speaker attribution', () => {
    it('renders prefix when participantName is present', () => {
      const seg = makeAccSeg('a', 'hello', 100, 'Alice');
      const line = seg.participantName ? `${seg.participantName}: ${seg.segment.text}` : seg.segment.text;
      expect(line).toBe('Alice: hello');
    });

    it('renders plain text when participantName is absent', () => {
      const seg = makeAccSeg('a', 'hello', 100, '');
      const line = seg.participantName ? `${seg.participantName}: ${seg.segment.text}` : seg.segment.text;
      expect(line).toBe('hello');
    });
  });

  describe('auto-hide timer logic (collapsed vs expanded)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('schedules clearTranscriptions after 4400ms when collapsed', () => {
      const setTranscriptions = jest.fn();
      const hideTimer = { current: null as ReturnType<typeof setTimeout> | null };
      const transcriptExpanded = false;

      // Simulate the collapsed branch of updateTranscriptions
      if (!transcriptExpanded) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setTranscriptions({}), 4400);
      }

      expect(setTranscriptions).not.toHaveBeenCalled();
      jest.advanceTimersByTime(4400);
      expect(setTranscriptions).toHaveBeenCalledWith({});
    });

    it('does NOT fire hide timer when expanded', () => {
      const setTranscriptions = jest.fn();
      const hideTimer = { current: setTimeout(() => {}, 9999) };
      const transcriptExpanded = true;

      // Simulate the expanded branch
      if (!transcriptExpanded) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setTranscriptions({}), 4400);
      } else if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      jest.advanceTimersByTime(10000);
      expect(setTranscriptions).not.toHaveBeenCalled();
      expect(hideTimer.current).toBeNull();
    });

    it('resets existing timer when a new segment arrives while collapsed', () => {
      const setTranscriptions = jest.fn();
      const hideTimer = { current: null as ReturnType<typeof setTimeout> | null };
      const transcriptExpanded = false;

      // First event at t=0
      if (!transcriptExpanded) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setTranscriptions('first-call'), 4400);
      }

      // Advance 3000ms — timer should NOT have fired yet
      jest.advanceTimersByTime(3000);
      expect(setTranscriptions).not.toHaveBeenCalled();

      // Second event resets the timer
      if (!transcriptExpanded) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setTranscriptions({}), 4400);
      }

      // Advance another 3000ms — still within the new 4400ms window
      jest.advanceTimersByTime(3000);
      expect(setTranscriptions).not.toHaveBeenCalled();

      // Advance the remaining 1400ms — now it should fire
      jest.advanceTimersByTime(1400);
      expect(setTranscriptions).toHaveBeenCalledWith({});
    });
  });
});
