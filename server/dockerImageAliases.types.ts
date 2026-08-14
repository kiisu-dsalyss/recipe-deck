export interface DockerImageAliasPair {
  /** Existing local image (`docker tag` source). */
  source: string;
  /** Tag name recipes may reference (`docker tag` target). */
  target: string;
  /**
   * If true, tag failure is logged only (does not fail Run). Used for the built-in
   * spark sidekick alias when the base image may not exist yet (e.g. primary vLLM image not built).
   */
  optional?: boolean;
}
