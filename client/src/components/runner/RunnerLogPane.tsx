import { useEffect, useRef, type ReactElement } from "react";
import styles from "./RunningModelPanel.module.css";

export function RunnerLogPane(props: { logText: string }): ReactElement {
  const { logText } = props;
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logText]);

  return (
    <pre ref={logRef} className={styles.log}>
      {logText || "—"}
    </pre>
  );
}
