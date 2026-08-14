import type { ReactElement } from "react";
import { useEffect } from "react";
import { SPARK_VLLM_DOCKER_REPO_URL } from "../../constants/upstream";
import type { HelpModalProps } from "./HelpModal.types";
import styles from "./HelpModal.module.css";

export type { HelpModalProps } from "./HelpModal.types";

export function HelpModal(props: HelpModalProps): ReactElement {
  const { onClose } = props;
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={styles.card}
        data-testid="demo-section-about"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="help-title" className={styles.title}>
              About Recipe Deck
            </h2>
            <p className={styles.meta}>
              <span className={styles.version}>v{version}</span>
              <span className={styles.metaSep} aria-hidden>
                ·
              </span>
              <a
                className={styles.link}
                href={SPARK_VLLM_DOCKER_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/eugr/spark-vllm-docker
              </a>
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.lede}>
            Control plane for{" "}
            <a
              className={styles.link}
              href={SPARK_VLLM_DOCKER_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              spark-vllm-docker
            </a>
            : one Node.js process serves REST (<code>/api/*</code>), WebSocket logs (
            <code>/ws</code>), and a static UI. At most one runner child (<code>run-recipe.py</code>,
            slot{" "}
            <code>a</code>) at a time. Config and secrets live under <code>SPARK_VLLM_ROOT</code> (
            <code>.env</code>, paths in Settings).
          </p>

          <div className={styles.sections}>
            <section className={styles.block} aria-labelledby="help-runner">
              <h3 id="help-runner" className={styles.blockLabel}>
                Runner
              </h3>
              <p className={styles.blockText}>
                Start/stop maps to the child process; health follows <code>READY_REGEX</code> in
                logs. Boot: HF hub cache download/progress when the stack exposes it. Optional{" "}
                <code>docker ps</code> match for the vLLM listen port; stop/kill only what this
                session started unless you clear a stray container explicitly.
              </p>
            </section>

            <section className={styles.block} aria-labelledby="help-recipes">
              <h3 id="help-recipes" className={styles.blockLabel}>
                Recipes
              </h3>
              <p className={styles.blockText}>
                <code>GET /api/recipe</code>, <code>POST /api/recipe/save</code> for YAML on disk.
                Optional <code>recipe_deck.broken</code> sorts last. <code>HF_TOKEN</code> merge
                rules: see <code>README.md</code>. Aggregate metrics (<code>GET /api/state</code>):
                disk, GPU, vLLM <code>/metrics</code>, <code>/v1/models</code>.
              </p>
            </section>

            <section className={styles.block} aria-labelledby="help-usage">
              <h3 id="help-usage" className={styles.blockLabel}>
                Usage ordering
              </h3>
              <p className={styles.blockText}>
                Per–recipe-stem counters in <code>recipe-run-counts.json</code> under{" "}
                <code>LOG_DIR</code>.
              </p>
            </section>

            <section className={styles.block} aria-labelledby="help-docs">
              <h3 id="help-docs" className={styles.blockLabel}>
                Docs
              </h3>
              <p className={styles.blockText}>
                <code>README.md</code>, <code>docs/ARCHITECTURE.md</code> (data flow, API),{" "}
                <code>docs/UI.md</code> (client tokens/CSS).
              </p>
            </section>
          </div>

          <div className={styles.warn}>
            <strong>Security.</strong> There is no login. Anyone who can reach this HTTP port can
            use the API (including Hugging Face token read/write). Run behind a firewall or VPN,
            bind to loopback only (<code>SWITCHER_HOST=127.0.0.1</code> plus SSH tunnel), or put a
            reverse proxy with auth in front if you expose it beyond a trusted network.
          </div>
        </div>
      </div>
    </div>
  );
}
