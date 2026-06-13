import {createServer, type Server} from "node:http";
import type {Address} from "viem";
import type {Logger} from "../util/logger.js";
import type {
  BundleListing,
  ItemTransferEvent,
  StandaloneListing,
  TokenListing,
  TokenStandard,
} from "../types.js";

export interface TestServerConfig {
  enabled: boolean;
  port: number;
  host: string;
  /** Gates the POST /inject endpoint. Read endpoints are always served. */
  eventTesting: boolean;
}

export type EventInjector = (event: ItemTransferEvent) => void;

/** Read-only listing lookups exposed to game devs over the local API. */
export interface ListingReader {
  getListingByToken(tokenId: string): TokenListing | null;
  getListingsByTokenInCollections(tokenId: string): StandaloneListing[];
  getBundleById(bundleId: number): BundleListing | null;
}

export interface TestServerHandlers {
  injectEvent: EventInjector;
  reader: ListingReader;
}

export function startTestServer(
  config: TestServerConfig,
  logger: Logger,
  handlers: TestServerHandlers,
): Server | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const server = createServer((req, res) => {
    const serverLogger = logger.child("test-server");
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET") {
      handleGet(path, url, handlers.reader, res, serverLogger);
      return;
    }

    if (req.method === "POST" && path === "/inject") {
      if (!config.eventTesting) {
        sendJson(res, 403, {error: "event injection disabled (set test.eventTesting)"});
        return;
      }
      handleInject(req, res, handlers.injectEvent, serverLogger);
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  server.listen(config.port, config.host);
  logger.info("test server started", {
    host: config.host,
    port: config.port,
    eventTesting: config.eventTesting,
  });
  return server;
}

function handleGet(
  path: string,
  url: URL,
  reader: ListingReader,
  res: import("node:http").ServerResponse,
  logger: Logger,
): void {
  try {
    if (path === "/fetch") {
      const tokenId = requireDigits(url.searchParams.get("tokenId"), "tokenId");
      const listing = reader.getListingByToken(tokenId);
      if (!listing) {
        sendJson(res, 404, {error: "no active listingID for tokenId", tokenId});
        return;
      }
      sendJson(res, 200, {tokenId, ...listing});
      return;
    }

    if (path === "/fetchInCollection") {
      const tokenId = requireDigits(url.searchParams.get("tokenId"), "tokenId");
      const listings = reader.getListingsByTokenInCollections(tokenId);
      sendJson(res, 200, {tokenId, listings});
      return;
    }

    if (path === "/fetchBundle") {
      const bundleId = requireDigits(url.searchParams.get("bundleId"), "bundleId");
      const bundle = reader.getBundleById(Number(bundleId));
      if (!bundle) {
        sendJson(res, 404, {error: "unknown listing", bundleId});
        return;
      }
      sendJson(res, 200, bundle);
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "bad request";
    logger.warn("invalid fetch request", {path, error: message});
    sendJson(res, 400, {error: message});
  }
}

function handleInject(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  injectEvent: EventInjector,
  logger: Logger,
): void {
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
      logger.info("injected test event", {notificationId: event.notificationId});
      sendJson(res, 202, {ok: true, notificationId: event.notificationId});
    } catch (error) {
      logger.warn("invalid test event", {
        error: error instanceof Error ? error.message : String(error),
      });
      sendJson(res, 400, {error: error instanceof Error ? error.message : "invalid payload"});
    }
  });
}

function sendJson(
  res: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function requireDigits(value: string | null, field: string): string {
  if (value === null || !/^\d+$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
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
    contractAddress: String(obj.contractAddress) as Address,
    collectionName: String(obj.collectionName ?? "test-collection"),
    standard: String(obj.standard) as TokenStandard,
    eventName: eventName as "Transfer" | "TransferSingle" | "TransferBatch",
    from: String(obj.from) as Address,
    to: String(obj.to) as Address,
    operator: String(obj.operator ?? obj.from) as Address,
    tokenId: String(obj.tokenId),
    value: String(obj.value),
    shopContext: obj.shopContext ? (obj.shopContext as any) : undefined,
  };
}
