import { useState } from "react";
import type { ReactElement } from "react";
import styles from "./HfTokenField.module.css";
import type { HfTokenFieldProps } from "./HfTokenField.types";

export type { HfTokenFieldProps } from "./HfTokenField.types";

function IconEye(): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff(): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function HfTokenField(props: HfTokenFieldProps): ReactElement {
  const { value, onChange, onBlur, placeholder = "Paste token", id } = props;
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        className={styles.input}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={() => {
          onBlur?.();
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.eye}
        aria-pressed={visible}
        aria-label={visible ? "Hide token" : "Show token"}
        title={visible ? "Hide token" : "Show token"}
        onClick={() => {
          setVisible((v) => !v);
        }}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}
