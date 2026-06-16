import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {loadConfig} from "./config.js";

function baseConfig(): Record<string, unknown> {
  return {
    serviceName: "item-relay",
    chain: {chainId: 1, httpRpcUrl: "https://example.invalid", startBlock: 0, confirmationDepth: 0},
    sync: {pollIntervalMs: 1000, retryBaseDelayMs: 1000, retryMaxDelayMs: 1000, queueBatchSize: 1},
    storage: {sqlitePath: "./data/test.sqlite"},
    collections: [
      {name: "c", address: "0x0000000000000000000000000000000000000001", standard: "ERC1155"},
    ],
    shops: [],
    sinks: {},
    health: {host: "127.0.0.1", port: 3090},
    endpoint: {enabled: true, host: "127.0.0.1", port: 3099, eventTesting: true},
  };
}

function loadWith(rpcUrl: string): ReturnType<typeof loadConfig> {
  const cfg = baseConfig();
  (cfg.chain as Record<string, unknown>).httpRpcUrl = rpcUrl;
  const path = join(tmpdir(), `item-relay-config-test-${rpcUrl.replace(/\W/g, "_")}.json`);
  writeFileSync(path, JSON.stringify(cfg));
  process.env.ITEM_RELAY_CONFIG = path;
  return loadConfig();
}

test("eventTesting is force-disabled on a non-testnet RPC URL", () => {
  const config = loadWith("https://mainnet.example.com/rpc");
  assert.equal(config.endpoint?.eventTesting, false);
});

test("eventTesting stays enabled on a sepolia RPC URL", () => {
  const config = loadWith("https://rpc-gel-sepolia.inkonchain.com");
  assert.equal(config.endpoint?.eventTesting, true);
});

test("eventTesting stays enabled when the URL contains 'testnet'", () => {
  const config = loadWith("https://some-testnet-node.example.com");
  assert.equal(config.endpoint?.eventTesting, true);
});

test("the check is case-insensitive", () => {
  const config = loadWith("https://Sepolia.example.com");
  assert.equal(config.endpoint?.eventTesting, true);
});
