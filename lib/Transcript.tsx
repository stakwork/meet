import styles from '../styles/Transcript.module.css';

export default function Transcript(props: { latestText: string }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.text}>{props.latestText}</p>
    </div>
  );
}
