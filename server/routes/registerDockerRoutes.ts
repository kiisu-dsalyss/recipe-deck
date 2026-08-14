import type { Express, Request, Response } from "express";
import type { DeckService } from "../deckService.js";
import {
  isValidDockerContainerId,
  listLocalDockerImageRefs,
  listRunningDockerContainers,
  stopDockerContainer,
} from "../metrics/dockerPs.js";

export function registerDockerRoutes(app: Express, deck: DeckService): void {
  /** Running containers from `docker ps` (same user as Recipe Deck; needs Docker CLI). */
  app.get("/api/docker/containers", async (_req: Request, res: Response) => {
    try {
      const containers = await listRunningDockerContainers();
      res.json({ containers });
    } catch (e) {
      res.status(503).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * Unique `repository:tag` strings from `docker images` plus `Image` from running containers,
   * for recipe `container:` field suggestions in the form editor.
   */
  app.get("/api/docker/image-options", async (_req: Request, res: Response) => {
    try {
      const [running, local] = await Promise.all([
        listRunningDockerContainers(),
        listLocalDockerImageRefs(),
      ]);
      const set = new Set<string>();
      for (const row of running) {
        const im = row.image?.trim();
        if (im) {
          set.add(im);
        }
      }
      for (const im of local) {
        if (im.trim()) {
          set.add(im.trim());
        }
      }
      const images = Array.from(set).sort((a, b) => a.localeCompare(b));
      res.json({ images });
    } catch (e) {
      res.status(503).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** `docker stop <id>` — e.g. zombie containers not tied to the managed runner. */
  app.post("/api/docker/stop", async (req: Request, res: Response) => {
    const raw = (req.body as { id?: unknown }).id;
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!isValidDockerContainerId(id)) {
      res.status(400).json({ error: "invalid container id" });
      return;
    }
    try {
      await stopDockerContainer(id);
      await deck.refreshLiveDiscovery();
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
