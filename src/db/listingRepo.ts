import type Database from "better-sqlite3";
import {formatEther, formatUnits} from "viem";
import type {
  BundleListing,
  Erc20Price,
  ListingPrices,
  ShopListingEvent,
  StandaloneListing,
  TokenListing,
} from "../types.js";

/**
 * Indexes CatalogShop listing/payment events into local SQLite state so the
 * relay can answer tokenId -> (listingId, price) lookups without an on-chain
 * read function. Writers are idempotent (last-write-wins, keyed by listing id),
 * so replaying a block range is safe.
 *
 * A "bundle" is a single listing with more than one delivery line
 * (`line_count > 1`); bundles are excluded from standalone tokenId pricing so a
 * discounted bundle never overwrites a standalone listing's price.
 */
export class ListingRepo {
  constructor(private readonly db: Database.Database) {}

  apply(event: ShopListingEvent): void {
    switch (event.kind) {
      case "listingCreated":
        return this.onListingCreated(event.listingId, event.block);
      case "configUpdated":
        return this.onConfigUpdated(event.listingId, event.active, event.block);
      case "linesReplaced":
        return this.onLinesReplaced(event.listingId, event.lineCount, event.block);
      case "lineSet":
        return this.onLineSet(
          event.listingId,
          event.lineIndex,
          event.collectionId,
          event.tokenId,
          event.amountPerUnit,
        );
      case "deactivated":
        return this.onDeactivated(event.listingId, event.block);
      case "ethPayment":
        return this.onEthPayment(event.listingId, event.enabled, event.price, event.block);
      case "erc20Payment":
        return this.onErc20Payment(
          event.listingId,
          event.token,
          event.enabled,
          event.price,
          event.decimals,
        );
      case "erc20Cleared":
        return this.onErc20Cleared(event.listingId, event.token);
    }
  }

  // --- writers ---

  onListingCreated(listingId: number, block: number): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing(
          listing_id, line_count, is_bundle, active, eth_enabled, eth_price, updated_block, updated_at
        ) VALUES(?, 0, 0, 0, 0, NULL, ?, ?)
        ON CONFLICT(listing_id) DO NOTHING`,
      )
      .run(listingId, block, Date.now());
  }

  onConfigUpdated(listingId: number, active: boolean, block: number): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing(
          listing_id, line_count, is_bundle, active, eth_enabled, eth_price, updated_block, updated_at
        ) VALUES(?, 0, 0, ?, 0, NULL, ?, ?)
        ON CONFLICT(listing_id) DO UPDATE SET
          active = excluded.active,
          updated_block = excluded.updated_block,
          updated_at = excluded.updated_at`,
      )
      .run(listingId, active ? 1 : 0, block, Date.now());
  }

  onLinesReplaced(listingId: number, lineCount: number, block: number): void {
    const isBundle = lineCount > 1 ? 1 : 0;
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO shop_listing(
            listing_id, line_count, is_bundle, active, eth_enabled, eth_price, updated_block, updated_at
          ) VALUES(?, ?, ?, 0, 0, NULL, ?, ?)
          ON CONFLICT(listing_id) DO UPDATE SET
            line_count = excluded.line_count,
            is_bundle = excluded.is_bundle,
            updated_block = excluded.updated_block,
            updated_at = excluded.updated_at`,
        )
        .run(listingId, lineCount, isBundle, block, Date.now());
      // Lines are about to be re-emitted as ListingLineSet; clear the old set.
      this.db.prepare("DELETE FROM shop_listing_line WHERE listing_id = ?").run(listingId);
    });
    tx();
  }

  onLineSet(
    listingId: number,
    lineIndex: number,
    collectionId: number,
    tokenId: string,
    amountPerUnit: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing_line(
          listing_id, line_index, collection_id, token_id, amount_per_unit
        ) VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(listing_id, line_index) DO UPDATE SET
          collection_id = excluded.collection_id,
          token_id = excluded.token_id,
          amount_per_unit = excluded.amount_per_unit`,
      )
      .run(listingId, lineIndex, collectionId, tokenId, amountPerUnit);
  }

  onDeactivated(listingId: number, block: number): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing(
          listing_id, line_count, is_bundle, active, eth_enabled, eth_price, updated_block, updated_at
        ) VALUES(?, 0, 0, 0, 0, NULL, ?, ?)
        ON CONFLICT(listing_id) DO UPDATE SET
          active = 0,
          updated_block = excluded.updated_block,
          updated_at = excluded.updated_at`,
      )
      .run(listingId, block, Date.now());
  }

  onEthPayment(listingId: number, enabled: boolean, price: string, block: number): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing(
          listing_id, line_count, is_bundle, active, eth_enabled, eth_price, updated_block, updated_at
        ) VALUES(?, 0, 0, 0, ?, ?, ?, ?)
        ON CONFLICT(listing_id) DO UPDATE SET
          eth_enabled = excluded.eth_enabled,
          eth_price = excluded.eth_price,
          updated_block = excluded.updated_block,
          updated_at = excluded.updated_at`,
      )
      .run(listingId, enabled ? 1 : 0, price, block, Date.now());
  }

  onErc20Payment(
    listingId: number,
    token: string,
    enabled: boolean,
    price: string,
    decimals: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO shop_listing_erc20_price(listing_id, token, enabled, price, decimals)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(listing_id, token) DO UPDATE SET
          enabled = excluded.enabled,
          price = excluded.price,
          decimals = excluded.decimals`,
      )
      .run(listingId, token.toLowerCase(), enabled ? 1 : 0, price, decimals);
  }

  onErc20Cleared(listingId: number, token: string): void {
    this.db
      .prepare("DELETE FROM shop_listing_erc20_price WHERE listing_id = ? AND token = ?")
      .run(listingId, token.toLowerCase());
  }

  // --- readers ---

  /**
   * First (lowest listingId) standalone, active, payment-enabled listing that
   * delivers `tokenId`. Assumes tokenId is unique across collections; use
   * {@link findStandaloneByTokenAllCollections} when it may not be. The result
   * intentionally omits `collectionId` — fetch that via the per-collection lookup.
   */
  findStandaloneByToken(tokenId: string): TokenListing | null {
    const row = this.db
      .prepare(
        `SELECT l.listing_id AS listingId
         FROM shop_listing_line ln
         JOIN shop_listing l ON l.listing_id = ln.listing_id
         WHERE ln.token_id = ?
           AND l.is_bundle = 0
           AND l.active = 1
           AND ${PAYMENT_ENABLED_PREDICATE}
         ORDER BY l.listing_id ASC
         LIMIT 1`,
      )
      .get(tokenId) as {listingId: number} | undefined;
    if (!row) {
      return null;
    }
    return {listingId: row.listingId, ...this.getPrices(row.listingId)};
  }

  /**
   * Lowest standalone, active, payment-enabled listing per collection that
   * delivers `tokenId`. Returns one entry per collection (empty if none).
   */
  findStandaloneByTokenAllCollections(tokenId: string): StandaloneListing[] {
    const rows = this.db
      .prepare(
        `SELECT ln.collection_id AS collectionId, MIN(l.listing_id) AS listingId
         FROM shop_listing_line ln
         JOIN shop_listing l ON l.listing_id = ln.listing_id
         WHERE ln.token_id = ?
           AND l.is_bundle = 0
           AND l.active = 1
           AND ${PAYMENT_ENABLED_PREDICATE}
         GROUP BY ln.collection_id
         ORDER BY ln.collection_id ASC`,
      )
      .all(tokenId) as Array<{collectionId: number; listingId: number}>;
    return rows.map((row) => ({
      listingId: row.listingId,
      collectionId: row.collectionId,
      ...this.getPrices(row.listingId),
    }));
  }

  /** Full composition + price for a listing (bundle or not). Null if unknown. */
  findBundleById(listingId: number): BundleListing | null {
    const listing = this.db
      .prepare("SELECT is_bundle AS isBundle FROM shop_listing WHERE listing_id = ?")
      .get(listingId) as {isBundle: number} | undefined;
    if (!listing) {
      return null;
    }
    const items = this.db
      .prepare(
        `SELECT collection_id AS collectionId, token_id AS tokenId, amount_per_unit AS amount
         FROM shop_listing_line
         WHERE listing_id = ?
         ORDER BY line_index ASC`,
      )
      .all(listingId) as Array<{collectionId: number; tokenId: string; amount: string}>;
    return {
      bundleId: listingId,
      isBundle: listing.isBundle === 1,
      items,
      ...this.getPrices(listingId),
    };
  }

  private getPrices(listingId: number): ListingPrices {
    const listing = this.db
      .prepare("SELECT eth_enabled AS ethEnabled, eth_price AS ethPrice FROM shop_listing WHERE listing_id = ?")
      .get(listingId) as {ethEnabled: number; ethPrice: string | null} | undefined;
    const erc20Rows = this.db
      .prepare(
        `SELECT token, price, decimals FROM shop_listing_erc20_price
         WHERE listing_id = ? AND enabled = 1
         ORDER BY token ASC`,
      )
      .all(listingId) as Array<{token: string; price: string; decimals: number}>;
    // Prices are returned as human-readable decimal strings: ETH scaled by 18,
    // each ERC20 scaled by that token's own decimals.
    const erc20: Erc20Price[] = erc20Rows.map((row) => ({
      token: row.token,
      price: formatUnits(BigInt(row.price), row.decimals),
    }));
    // Insert `eth` before `erc20` so the serialized JSON matches the documented
    // field order ({..., eth, erc20}).
    if (listing && listing.ethEnabled === 1 && listing.ethPrice !== null) {
      return {eth: formatEther(BigInt(listing.ethPrice)), erc20};
    }
    return {erc20};
  }
}

const PAYMENT_ENABLED_PREDICATE = `(
  l.eth_enabled = 1
  OR EXISTS (
    SELECT 1 FROM shop_listing_erc20_price e
    WHERE e.listing_id = l.listing_id AND e.enabled = 1
  )
)`;
