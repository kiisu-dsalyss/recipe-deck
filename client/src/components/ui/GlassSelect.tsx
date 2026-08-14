import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { GlassSelectItem, GlassSelectProps } from "./GlassSelect.types.js";
import styles from "./GlassSelect.module.css";

export type { GlassSelectGroup, GlassSelectItem, GlassSelectProps } from "./GlassSelect.types.js";

export function GlassSelect(props: GlassSelectProps): ReactElement {
  const {
    id,
    value,
    onChange,
    groups,
    disabled = false,
    emptyLabel = "—",
    includeEmpty = true,
    layout = "fill",
    editable = false,
    placeholder,
    title,
  } = props;
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const [active, setActive] = useState(value);

  const visibleGroups = useMemo(() => {
    if (!editable) {
      return groups;
    }
    const q = value.trim().toLowerCase();
    if (!q) {
      return groups;
    }
    return groups
      .map((g) => {
        const folderHit = (g.label ?? "").toLowerCase().includes(q);
        if (folderHit) {
          return g;
        }
        return {
          ...g,
          items: g.items.filter(
            (i) =>
              i.value.toLowerCase().includes(q) || i.label.toLowerCase().includes(q),
          ),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [editable, groups, value]);

  const flat = useMemo<GlassSelectItem[]>(() => {
    const rows: GlassSelectItem[] = includeEmpty ? [{ value: "", label: emptyLabel }] : [];
    for (const g of visibleGroups) {
      rows.push(...g.items);
    }
    return rows;
  }, [emptyLabel, includeEmpty, visibleGroups]);

  const selected = flat.find((row) => row.value === value);
  const display = selected?.label ?? (value.trim() ? value : emptyLabel);

  const optionId = useCallback(
    (v: string) => `${listId}-${v === "" ? "empty" : v.replace(/[^\w.-]+/g, "_")}`,
    [listId],
  );

  const syncPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    setCoords({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const pick = useCallback(
    (v: string) => {
      onChange(v);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange],
  );

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    syncPosition();
    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);
    return () => {
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
    };
  }, [open, syncPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (wrapRef.current?.contains(t)) {
        return;
      }
      const menu = document.getElementById(listId);
      if (menu?.contains(t)) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [close, listId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!editable) {
      document.getElementById(listId)?.focus();
    }
    document.getElementById(optionId(value))?.scrollIntoView({ block: "nearest" });
  }, [editable, listId, open, optionId, value]);

  const moveActive = useCallback(
    (delta: number) => {
      const i = Math.max(0, flat.findIndex((row) => row.value === active));
      const next = flat[(i + delta + flat.length) % flat.length];
      if (next) {
        setActive(next.value);
      }
    },
    [active, flat],
  );

  useEffect(() => {
    if (flat.some((row) => row.value === active)) {
      return;
    }
    setActive(flat[0]?.value ?? value);
  }, [active, flat, value]);

  const onComboKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      moveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      moveActive(-1);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(active);
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActive(value);
      setOpen(true);
    }
  };

  const toggleOpen = () => {
    if (disabled) {
      return;
    }
    if (open) {
      close();
      return;
    }
    setActive(value);
    setOpen(true);
    if (editable) {
      triggerRef.current?.focus();
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    }
  };

  const renderItem = (item: GlassSelectItem, nested: boolean) => {
    const isActive = active === item.value;
    const isSelected = value === item.value;
    return (
      <button
        key={item.value || "empty"}
        type="button"
        id={optionId(item.value)}
        role="option"
        aria-selected={isSelected}
        className={`${styles.option}${nested ? ` ${styles.optionNested}` : ""}${
          isActive ? ` ${styles.optionActive}` : ""
        }${isSelected ? ` ${styles.optionSelected}` : ""}${item.danger ? ` ${styles.optionDanger}` : ""}`}
        onMouseEnter={() => {
          setActive(item.value);
        }}
        onClick={() => {
          pick(item.value);
        }}
      >
        {item.label}
      </button>
    );
  };

  return (
    <div className={layout === "grow" ? styles.wrapGrow : styles.wrapFill} ref={wrapRef}>
      {editable ? (
        <div className={styles.combo}>
          <input
            ref={triggerRef as RefObject<HTMLInputElement>}
            id={id}
            className={styles.comboInput}
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={placeholder}
            title={title}
            value={value}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onFocus={() => {
              if (!disabled) {
                setOpen(true);
              }
            }}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onComboKey}
          />
          <button
            type="button"
            className={styles.comboChevron}
            tabIndex={-1}
            aria-label="Show recipes"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={toggleOpen}
          >
            <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden>
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef as RefObject<HTMLButtonElement>}
          type="button"
          id={id}
          className={styles.trigger}
          disabled={disabled}
          title={title}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={toggleOpen}
          onKeyDown={onTriggerKey}
        >
          <span className={styles.triggerLabel}>{display}</span>
          <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden>
            <path fill="none" stroke="currentColor" strokeWidth="2" d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      {open && coords != null
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              tabIndex={-1}
              className={styles.menu}
              style={{
                left: coords.left,
                top: coords.top,
                width: Math.max(
                  coords.width,
                  Math.min(28 * 16, window.innerWidth - coords.left - 12),
                ),
              }}
              aria-activedescendant={optionId(active)}
              onKeyDown={onMenuKey}
            >
              {includeEmpty ? (
                <li role="presentation">{renderItem({ value: "", label: emptyLabel }, false)}</li>
              ) : null}
              {visibleGroups.length === 0 ? (
                <li className={styles.groupLabel} role="presentation">
                  No matching recipes
                </li>
              ) : null}
              {visibleGroups.map((g, gi) => (
                <li key={g.label ?? `g-${gi}`} role="presentation">
                  {g.label ? <div className={styles.groupLabel}>{g.label}</div> : null}
                  {g.items.map((item) => renderItem(item, Boolean(g.label)))}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
