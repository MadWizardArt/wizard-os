import styles from "./GrottoGate.module.css";

export default function GrottoGate() {
  return (
    <a
      className={styles.keyLink}
      href="/grotto"
      aria-label="Enter the Grotto"
      title="The Grotto"
    >
      <span className={styles.keyhole} aria-hidden="true" />
    </a>
  );
}
