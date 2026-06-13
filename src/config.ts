import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {getAddress} from "viem";
import type {
  CollectionBinding,
  ServiceConfig,
  ShopBinding,
  SinkConfig,
  TokenStandard,
} from "./types.js";

const MODULE_DIR = fileURLToPath(new URL(".", import.meta.url));

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asString(value, label);
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function asStandard(value: unknown, label: string): TokenStandard {
  if (value !== "ERC1155" && value !== "ERC721") {
    throw new Error(`${label} must be ERC1155 or ERC721`);
  }
  return value;
}

function asCollection(value: unknown, label: string): CollectionBinding {
  const item = asObject(value, label);
  return {
    name: asString(item.name, `${label}.name`),
    address: getAddress(asString(item.address, `${label}.address`)),
    standard: asStandard(item.standard, `${label}.standard`),
  };
}

function asShop(value: unknown, label: string): ShopBinding {
  const item = asObject(value, label);
  return {
    name: asString(item.name, `${label}.name`),
    address: getAddress(asString(item.address, `${label}.address`)),
  };
}

function asSink(value: unknown, label: string): SinkConfig {
  const item = asObject(value, label);
  const authToken = asOptionalString(item.authToken, `${label}.authToken`);
  const authHeader = asOptionalString(item.authHeader, `${label}.authHeader`);
  return {
    enabled: asBoolean(item.enabled, `${label}.enabled`),
    endpointUrl: asString(item.endpointUrl, `${label}.endpointUrl`),
    timeoutMs: asNumber(item.timeoutMs, `${label}.timeoutMs`),
    ...(authToken !== undefined ? {authToken} : {}),
    ...(authHeader !== undefined ? {authHeader} : {}),
  };
}

export function loadConfig(): ServiceConfig {
  const configPath =
    process.env.ITEM_RELAY_CONFIG ??
    resolve(MODULE_DIR, "..", "config", "config.json");
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  const root = asObject(parsed, "config");

  const chain = asObject(root.chain, "config.chain");
  const sync = asObject(root.sync, "config.sync");
  const storage = asObject(root.storage, "config.storage");
  const sinks = asObject(root.sinks, "config.sinks");
  const health = asObject(root.health, "config.health");

  if (!Array.isArray(root.collections) || root.collections.length === 0) {
    throw new Error("config.collections must be a non-empty array");
  }
  if (!Array.isArray(root.shops)) {
    throw new Error("config.shops must be an array");
  }

  return {
    serviceName: asString(root.serviceName, "config.serviceName"),
    chain: {
      chainId: asNumber(chain.chainId, "config.chain.chainId"),
      httpRpcUrl: asString(chain.httpRpcUrl, "config.chain.httpRpcUrl"),
      startBlock: asNumber(chain.startBlock, "config.chain.startBlock"),
      confirmationDepth: asNumber(
        chain.confirmationDepth,
        "config.chain.confirmationDepth",
      ),
    },
    sync: {
      pollIntervalMs: asNumber(sync.pollIntervalMs, "config.sync.pollIntervalMs"),
      retryBaseDelayMs: asNumber(
        sync.retryBaseDelayMs,
        "config.sync.retryBaseDelayMs",
      ),
      retryMaxDelayMs: asNumber(
        sync.retryMaxDelayMs,
        "config.sync.retryMaxDelayMs",
      ),
      queueBatchSize: asNumber(sync.queueBatchSize, "config.sync.queueBatchSize"),
    },
    storage: {
      sqlitePath: asString(storage.sqlitePath, "config.storage.sqlitePath"),
    },
    collections: root.collections.map((entry, index) =>
      asCollection(entry, `config.collections[${index}]`),
    ),
    shops: root.shops.map((entry, index) =>
      asShop(entry, `config.shops[${index}]`),
    ),
    sinks: {
      ...(sinks.legacy !== undefined ? {legacy: asSink(sinks.legacy, "config.sinks.legacy")} : {}),
      ...(sinks.normalized !== undefined
        ? {normalized: asSink(sinks.normalized, "config.sinks.normalized")}
        : {}),
    },
    health: {
      host: asString(health.host, "config.health.host"),
      port: asNumber(health.port, "config.health.port"),
    },
    ...(root.endpoint !== undefined
      ? {
          endpoint: (() => {
            const endpoint = asObject(root.endpoint, "config.endpoint");
            return {
              enabled: asBoolean(endpoint.enabled, "config.endpoint.enabled"),
              host: asString(endpoint.host, "config.endpoint.host"),
              port: asNumber(endpoint.port, "config.endpoint.port"),
              eventTesting:
                endpoint.eventTesting === undefined
                  ? false
                  : asBoolean(endpoint.eventTesting, "config.endpoint.eventTesting"),
            };
          })(),
        }
      : {}),
  };
}
