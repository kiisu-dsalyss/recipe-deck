import type { ReactElement } from "react";

const common = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/** Play triangle — run from disk / run buffer */
export function IconPlay(): ReactElement {
  return (
    <svg {...common}>
      <path d="M8 5.25v13.5L18.5 12 8 5.25z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Circular arrows — refresh / reload list */
export function IconRefresh(): ReactElement {
  return (
    <svg {...common}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 3" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 21" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/** Stop square — transport motif (pairs with play triangle) */
export function IconStopSign(): ReactElement {
  return (
    <svg {...common}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Trash — delete recipe */
export function IconTrash(): ReactElement {
  return (
    <svg {...common}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
    </svg>
  );
}

/** Floppy / save */
export function IconSave(): ReactElement {
  return (
    <svg {...common}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

/** Undo / revert */
export function IconRevert(): ReactElement {
  return (
    <svg {...common}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

/** Lightning — force kill */
export function IconForceKill(): ReactElement {
  return (
    <svg {...common}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Power / boot — auto-start at boot */
export function IconPower(): ReactElement {
  return (
    <svg {...common}>
      <path d="M12 2v10" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  );
}

/** Brain — hub cache / model load progress (pulsing in Running Model) */
export function IconBrain(): ReactElement {
  return (
    <svg {...common} fill="none">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    </svg>
  );
}
