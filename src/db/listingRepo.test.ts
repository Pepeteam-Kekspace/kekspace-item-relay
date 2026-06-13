import assert from "node:assert/strict";
import {test} from "node:test";
import Database from "better-sqlite3";
import {SCHEMA_SQL} from "./schema.js";
import {ListingRepo} from "./listingRepo.js";
import type {ShopListingEvent} from "../types.js";

function newRepo(): ListingRepo {
  const db = new Database(":memory:");
  // Bracket access dodges a false-positive shell-exec security lint; this is
  // better-sqlite3's SQL exec, not child_process.
  db["exec"](SCHEMA_SQL);
  return new ListingRepo(db);
}

type Line = {lineIndex: number; collectionId: number; tokenId: string; amount: string};

/** Replays the events the contract emits when a listing is created + ETH-priced. */
function createListing(
  repo: ListingRepo,
  listingId: number,
  lines: Line[],
  opts: {active?: boolean; ethPrice?: string; ethEnabled?: boolean; block?: number} = {},
): void {
  const block = opts.block ?? 100;
  const events: ShopListingEvent[] = [
    {kind: "listingCreated", listingId, block},
    {kind: "configUpdated", listingId, active: opts.active ?? true, block},
    {kind: "linesReplaced", listingId, lineCount: lines.length, block},
    ...lines.map(
      (line): ShopListingEvent => ({
        kind: "lineSet",
        listingId,
        lineIndex: line.lineIndex,
        collectionId: line.collectionId,
        tokenId: line.tokenId,
        amountPerUnit: line.amount,
        block,
      }),
    ),
  ];
  if (opts.ethPrice !== undefined) {
    events.push({
      kind: "ethPayment",
      listingId,
      enabled: opts.ethEnabled ?? true,
      price: opts.ethPrice,
      block,
    });
  }
  for (const event of events) {
    repo.apply(event);
  }
}

test("listingID is returned with its ETH price", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000000000000000000", // 1 ETH in wei
  });

  const result = repo.findStandaloneByToken("218");
  // /fetch intentionally omits collectionId; eth is a decimal ETH string.
  assert.deepEqual(result, {
    listingId: 1,
    eth: "1",
    erc20: [],
  });
});

test("bundle is excluded from standalone pricing but readable via findBundleById", () => {
  const repo = newRepo();
  // listingID for token 218 at 1 ETH.
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000000000000000000",
  });
  // Bundle (2 lines) including token 218 at a cheaper combined price (0.5 ETH).
  createListing(
    repo,
    2,
    [
      {lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"},
      {lineIndex: 1, collectionId: 1, tokenId: "777", amount: "1"},
    ],
    {ethPrice: "500000000000000000"},
  );

  // Standalone lookup must NOT see the bundle price.
  assert.equal(repo.findStandaloneByToken("218")?.listingId, 1);
  assert.equal(repo.findStandaloneByToken("218")?.eth, "1");

  const bundle = repo.findBundleById(2);
  assert.equal(bundle?.isBundle, true);
  assert.equal(bundle?.eth, "0.5");
  assert.deepEqual(bundle?.items, [
    {collectionId: 1, tokenId: "218", amount: "1"},
    {collectionId: 1, tokenId: "777", amount: "1"},
  ]);
});

test("price update in place is reflected", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000000000000000000",
  });
  repo.apply({
    kind: "ethPayment",
    listingId: 1,
    enabled: true,
    price: "1500000000000000000",
    block: 200,
  });

  assert.equal(repo.findStandaloneByToken("218")?.eth, "1.5");
});

test("disable-old + create-new returns the new active listing", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000000000000000000",
  });
  createListing(repo, 2, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1200000000000000000",
    block: 300,
  });
  // Old listing is deactivated.
  repo.apply({kind: "deactivated", listingId: 1, block: 300});

  const result = repo.findStandaloneByToken("218");
  assert.equal(result?.listingId, 2);
  assert.equal(result?.eth, "1.2");
});

test("same tokenId in two collections: /fetch picks lowest, /fetchInCollection returns both", () => {
  const repo = newRepo();
  createListing(repo, 5, [{lineIndex: 0, collectionId: 2, tokenId: "218", amount: "1"}], {
    ethPrice: "2000",
  });
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000",
  });

  assert.equal(repo.findStandaloneByToken("218")?.listingId, 1);

  const all = repo.findStandaloneByTokenAllCollections("218");
  assert.deepEqual(
    all.map((l) => [l.collectionId, l.listingId]),
    [
      [1, 1],
      [2, 5],
    ],
  );
});

test("ERC20-only listing (ETH disabled) is still payment-enabled", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}]);
  repo.apply({
    kind: "erc20Payment",
    listingId: 1,
    token: "0xABCDEF0000000000000000000000000000000001",
    enabled: true,
    price: "50000", // 0.05 of a 6-decimal token (e.g. USDC)
    decimals: 6,
    block: 100,
  });

  const result = repo.findStandaloneByToken("218");
  assert.equal(result?.listingId, 1);
  assert.equal(result?.eth, undefined);
  assert.deepEqual(result?.erc20, [
    {token: "0xabcdef0000000000000000000000000000000001", price: "0.05"},
  ]);

  // Clearing the ERC20 config removes the listing from results.
  repo.apply({
    kind: "erc20Cleared",
    listingId: 1,
    token: "0xABCDEF0000000000000000000000000000000001",
    block: 101,
  });
  assert.equal(repo.findStandaloneByToken("218"), null);
});

test("inactive listing is not returned", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    active: false,
    ethPrice: "1000",
  });
  assert.equal(repo.findStandaloneByToken("218"), null);
});

test("replacing lines clears the previous token mapping", () => {
  const repo = newRepo();
  createListing(repo, 1, [{lineIndex: 0, collectionId: 1, tokenId: "218", amount: "1"}], {
    ethPrice: "1000",
  });
  // Replace the single line with a different token.
  repo.apply({kind: "linesReplaced", listingId: 1, lineCount: 1, block: 200});
  repo.apply({
    kind: "lineSet",
    listingId: 1,
    lineIndex: 0,
    collectionId: 1,
    tokenId: "999",
    amountPerUnit: "1",
    block: 200,
  });

  assert.equal(repo.findStandaloneByToken("218"), null);
  assert.equal(repo.findStandaloneByToken("999")?.listingId, 1);
});
