import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { SlotId } from "../types/index.js";
import type { ServerToClientMessage } from "../types/ws.js";
import type { DeckService } from "./deckService.js";

export class WsHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(server: HttpServer, private readonly deck: DeckService) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      const payload = this.deck.getFullState();
      ws.send(
        JSON.stringify({
          type: "state",
          payload,
        } satisfies ServerToClientMessage),
      );
      const snap = this.deck.getRunnerLogSnapshot();
      ws.send(
        JSON.stringify({
          type: "log_snapshot",
          slot: payload.slots.a.slot,
          text: snap,
        } satisfies ServerToClientMessage),
      );
      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  broadcastLog(slot: SlotId, line: string): void {
    const msg: ServerToClientMessage = { type: "log", slot, line };
    this.sendAll(msg);
  }

  broadcastState(): void {
    const msg: ServerToClientMessage = {
      type: "state",
      payload: this.deck.getFullState(),
    };
    this.sendAll(msg);
  }

  private sendAll(msg: ServerToClientMessage): void {
    const raw = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === 1) {
        c.send(raw);
      }
    }
  }

}

export type { LogBroadcastFn } from "./wsHub.types.js";
