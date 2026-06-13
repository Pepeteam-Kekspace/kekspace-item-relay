import assert from "node:assert/strict";
import {type AddressInfo} from "node:net";
import {after, test} from "node:test";
import {Logger} from "../util/logger.js";
import {startTestServer, type ListingReader, type TestServerConfig} from "./testServer.js";
import type {ItemTransferEvent} from "../types.js";

const reader: ListingReader = {
  getListingByToken(tokenId) {
    if (tokenId === "218") {
      return {listingId: 1, eth: "1", erc20: []};
    }
    return null;
  },
  getListingsByTokenInCollections(tokenId) {
    if (tokenId === "218") {
      return [{listingId: 1, collectionId: 1, eth: "1000", erc20: []}];
    }
    return [];
  },
  getBundleById(bundleId) {
    if (bundleId === 2) {
      return {
        bundleId: 2,
        isBundle: true,
        eth: "500",
        erc20: [],
        items: [
          {collectionId: 1, tokenId: "218", amount: "1"},
          {collectionId: 1, tokenId: "777", amount: "1"},
        ],
      };
    }
    return null;
  },
};

const logger = new Logger("test");

const validInjectBody = JSON.stringify({
  notificationId: "evt-1",
  blockNumber: 1,
  txHash: "0xabc",
  logIndex: 0,
  contractAddress: "0x0000000000000000000000000000000000000001",
  standard: "ERC1155",
  eventName: "TransferSingle",
  from: "0x0000000000000000000000000000000000000002",
  to: "0x0000000000000000000000000000000000000003",
  tokenId: "218",
  value: "1",
});

async function startOnEphemeralPort(
  overrides: Partial<TestServerConfig>,
  injectEvent: (event: ItemTransferEvent) => void = () => {},
): Promise<{base: string; close: () => Promise<void>}> {
  const config: TestServerConfig = {
    enabled: true,
    host: "127.0.0.1",
    port: 0,
    eventTesting: false,
    ...overrides,
  };
  const server = startTestServer(config, logger, {injectEvent, reader});
  assert.ok(server, "server should be created when enabled");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const {port} = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("GET /fetch returns a listingID", async () => {
  const {base, close} = await startOnEphemeralPort({eventTesting: true});
  after(close);

  const res = await fetch(`${base}/fetch?tokenId=218`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    tokenId: "218",
    listingId: 1,
    eth: "1",
    erc20: [],
  });
});

test("GET /fetch returns 404 for an unknown token and 400 for a bad token", async () => {
  const {base, close} = await startOnEphemeralPort({eventTesting: true});
  after(close);

  assert.equal((await fetch(`${base}/fetch?tokenId=999`)).status, 404);
  assert.equal((await fetch(`${base}/fetch?tokenId=abc`)).status, 400);
  assert.equal((await fetch(`${base}/fetch`)).status, 400);
});

test("GET /fetchBundle returns bundle composition", async () => {
  const {base, close} = await startOnEphemeralPort({eventTesting: true});
  after(close);

  const res = await fetch(`${base}/fetchBundle?bundleId=2`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {items: unknown[]};
  assert.equal(body.items.length, 2);
  assert.equal((await fetch(`${base}/fetchBundle?bundleId=9`)).status, 404);
});

test("POST /inject is rejected with 403 when eventTesting is off", async () => {
  let injected = 0;
  const {base, close} = await startOnEphemeralPort({eventTesting: false}, () => {
    injected += 1;
  });
  after(close);

  const res = await fetch(`${base}/inject`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: validInjectBody,
  });
  assert.equal(res.status, 403);
  assert.equal(injected, 0);
});

test("POST /inject accepts a valid event when eventTesting is on", async () => {
  let injected = 0;
  const {base, close} = await startOnEphemeralPort({eventTesting: true}, () => {
    injected += 1;
  });
  after(close);

  const res = await fetch(`${base}/inject`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: validInjectBody,
  });
  assert.equal(res.status, 202);
  assert.equal(injected, 1);
});

test("unknown paths return 404", async () => {
  const {base, close} = await startOnEphemeralPort({eventTesting: true});
  after(close);

  assert.equal((await fetch(`${base}/nope`)).status, 404);
});
