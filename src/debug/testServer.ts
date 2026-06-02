import {createServer} from "node:http";
import type {Logger} from "../util/logger.js";
import type {ItemTransferEvent} from "../types.js";

export interface TestServerConfig {
  enabled: boolean;
  port: number;
  host: string;
}

export type EventInjector = (event: ItemTransferEvent) => void;

export function startTestServer(
  config: TestServerConfig,
  logger: Logger,
  injectEvent: EventInjector,
): void {
  if (!config.enabled) {
    return;
  }

  const server = createServer((req, res) => {
    const testLogger = logger.child("test-server");

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }

    if (req.url !== "/inject") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1048576) {
        // 1MB limit
        req.destroy();
        res.statusCode = 413;
        res.end("payload too large");
      }
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as unknown;
        const event = validateTestEvent(payload);
        injectEvent(event);
        testLogger.info("injected test event", {notificationId: event.notificationId});
        res.statusCode = 202;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ok: true, notificationId: event.notificationId}));
      } catch (error) {
        testLogger.warn("invalid test event", {
          error: error instanceof Error ? error.message : String(error),
        });
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : "invalid payload",
        }));
      }
    });
  });

  server.listen(config.port, config.host);
  logger.info("test server started", {host: config.host, port: config.port});
}

function validateTestEvent(payload: unknown): ItemTransferEvent {
  const obj = payload as Record<string, unknown>;

  const required = [
    "notificationId",
    "blockNumber",
    "txHash",
    "logIndex",
    "contractAddress",
    "standard",
    "eventName",
    "from",
    "to",
    "tokenId",
    "value",
  ];

  for (const field of required) {
    if (!(field in obj)) {
      throw new Error(`missing required field: ${field}`);
    }
  }

  const eventName = String(obj.eventName);
  if (!["Transfer", "TransferSingle", "TransferBatch"].includes(eventName)) {
    throw new Error(`eventName must be one of: Transfer, TransferSingle, TransferBatch`);
  }

  return {
    notificationId: String(obj.notificationId),
    blockNumber: Number(obj.blockNumber),
    txHash: String(obj.txHash),
    logIndex: Number(obj.logIndex),
    subIndex: Number(obj.subIndex ?? 0),
    contractAddress: String(obj.contractAddress),
    collectionName: String(obj.collectionName ?? "test-collection"),
    standard: String(obj.standard),
    eventName: eventName as "Transfer" | "TransferSingle" | "TransferBatch",
    from: String(obj.from),
    to: String(obj.to),
    operator: String(obj.operator ?? obj.from),
    tokenId: String(obj.tokenId),
    value: String(obj.value),
    shopContext: obj.shopContext ? (obj.shopContext as any) : undefined,
  };
}
