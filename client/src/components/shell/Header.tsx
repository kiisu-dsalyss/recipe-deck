import type { ReactElement } from "react";
import { formatListenDisplay } from "../../../../shared/formatListenDisplay";
import type { HeaderProps } from "./Header.types";
import { HeaderCacheStrip } from "./HeaderCacheStrip";
import { IconGear, IconMoon, IconSun } from "./HeaderIcons";
import { DiskUsedStat, LocalAccelStack, RemoteAccelStacks } from "./HeaderStats";
import styles from "./Header.module.css";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";

export function Header(props: HeaderProps): ReactElement {
  const {
    listenHost,
    listenPort,
    metrics,
    modelCacheProgress,
    theme,
    onToggleTheme,
    onOpenServerSettings,
    onOpenHelp,
  } = props;
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.titleRow}>
          <span className={styles.title}>Recipe Deck</span>
          <span className={styles.appVersion} title="Recipe Deck UI version">
            v{APP_VERSION}
          </span>
        </div>
        <span className={styles.port} title="HTTP bind (SWITCHER_HOST:SWITCHER_PORT)">
          UI · {formatListenDisplay(listenHost ?? "0.0.0.0", listenPort)}
        </span>
      </div>
      <HeaderCacheStrip cache={modelCacheProgress} />
      <div className={styles.strip}>
        <button
          type="button"
          className={styles.gearBtn}
          onClick={onOpenServerSettings}
          title="Settings"
          aria-label="Settings"
        >
          <IconGear />
        </button>
        <button
          type="button"
          className={styles.helpBtn}
          onClick={onOpenHelp}
          title="About & help"
          aria-label="About and help"
        >
          ?
        </button>
        <button
          type="button"
          className={styles.themeBtn}
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <DiskUsedStat disk={metrics?.disk ?? null} />
        <LocalAccelStack cpu={metrics?.cpu ?? null} gpu={metrics?.gpu ?? null} />
        {metrics?.hosts && metrics.hosts.length > 1 && (
          <RemoteAccelStacks hosts={metrics.hosts} />
        )}
      </div>
    </header>
  );
}
