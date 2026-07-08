import { useEffect, useRef } from 'react';
import { TranscriptionSegment } from 'livekit-client';
import styles from '../styles/Transcript.module.css';

export type AccumulatedSegment = {
  segment: TranscriptionSegment;
  participantName: string;
};

export default function Transcript(props: {
  segments: AccumulatedSegment[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.expanded) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        props.onToggle();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [props.expanded, props.onToggle]);

  const visible = props.expanded
    ? [...props.segments].reverse()
    : props.segments.slice(-3);

  return (
    <div
      ref={containerRef}
      className={`${styles.wrap} ${props.expanded ? styles.expanded : ''}`}
      onClick={props.onToggle}
      role="button"
      aria-expanded={props.expanded}
    >
      {visible.map(({ segment, participantName }) => (
        <p key={segment.id} className={styles.text}>
          {participantName ? `${participantName}: ${segment.text}` : segment.text}
        </p>
      ))}
    </div>
  );
}
