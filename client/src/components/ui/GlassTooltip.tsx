import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./GlassTooltip.module.css";
import type { GlassTooltipProps } from "./GlassTooltip.types";

export type { GlassTooltipProps } from "./GlassTooltip.types";

/**
 * Wraps a control and shows a glassmorphism tooltip on hover and keyboard focus.
 * Renders the tooltip in a portal so it stacks above the fixed header.
 */
export function GlassTooltip(props: GlassTooltipProps): ReactElement {
  const { label, children } = props;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** After pointer leaves, keep the tip visible this long, then opacity-fade. */
  const HIDE_DELAY_MS = 1500;
  /** Extra offset so the cursor (over the control) does not cover the tip. */
  const POINTER_CLEARANCE_PX = 22;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const syncPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    setCoords({ left: r.left + r.width / 2, top: r.bottom + POINTER_CLEARANCE_PX });
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    setFadeOut(false);
    setOpen(true);
  }, [clearHideTimer]);

  /** Pointer left: wait, then fade out (keyboard blur uses hideNow). */
  const hideSoon = useCallback(() => {
    clearHideTimer();
    setFadeOut(false);
    hideTimerRef.current = setTimeout(() => {
      setFadeOut(true);
      hideTimerRef.current = null;
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const hideNow = useCallback(() => {
    clearHideTimer();
    setFadeOut(false);
    setOpen(false);
    setCoords(null);
  }, [clearHideTimer]);

  const onTipTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity" || !fadeOut) {
        return;
      }
      setOpen(false);
      setFadeOut(false);
      setCoords(null);
    },
    [fadeOut],
  );

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    syncPosition();
    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);
    return () => {
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
    };
  }, [open, label, syncPosition]);

  useLayoutEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <span
        ref={wrapRef}
        className={styles.wrap}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideNow}
      >
        {children}
      </span>
      {open && coords != null
        ? createPortal(
            <div
              className={`${styles.tipFixed} ${fadeOut ? styles.tipFadeOut : ""}`}
              role="tooltip"
              style={{
                left: coords.left,
                top: coords.top,
              }}
              onTransitionEnd={onTipTransitionEnd}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
