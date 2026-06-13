import {
  decodeEventLog,
  erc20Abi,
  getAddress,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import {erc721TransferAbi} from "../abi/erc721.js";
import {erc1155TransferAbi} from "../abi/erc1155.js";
import {catalogShopAbi} from "../abi/catalogShop.js";
import type {Logger} from "../util/logger.js";
import type {
  CollectionBinding,
  ItemTransferEvent,
  ShopBinding,
  ShopContext,
  ShopListingEvent,
  TokenStandard,
} from "../types.js";

type RawTransferItem = {
  kind: "transfer";
  txHash: string;
  logIndex: number;
  subIndex: number;
  blockNumber: number;
  contractAddress: Address;
  collectionName: string;
  standard: TokenStandard;
  eventName: "Transfer" | "TransferSingle" | "TransferBatch";
  operator?: Address;
  from: Address;
  to: Address;
  tokenId: string;
  value: string;
};

type RawDelivery = {
  kind: "delivery";
  txHash: string;
  logIndex: number;
  blockNumber: number;
  shopName: string;
  context: ShopContext;
};

type RawEvent = RawTransferItem | RawDelivery;

export class ItemRelayAdapter {
  private readonly erc20DecimalsCache = new Map<string, number>();

  constructor(
    private readonly client: PublicClient,
    private readonly collections: CollectionBinding[],
    private readonly shops: ShopBinding[],
    private readonly logger?: Logger,
  ) {}

  async getLatestBlock(): Promise<number> {
    return Number(await this.client.getBlockNumber());
  }

  async getItemEvents(fromBlock: number, toBlock: number): Promise<ItemTransferEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const rawEvents: RawEvent[] = [];

    for (const collection of this.collections) {
      const logs = await this.client.getLogs({
        address: collection.address,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });
      for (const log of logs) {
        rawEvents.push(...this.decodeCollectionLog(collection, log));
      }
    }

    for (const shop of this.shops) {
      const logs = await this.client.getLogs({
        address: shop.address,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });
      for (const log of logs) {
        const decoded = this.decodeShopLog(shop, log);
        if (decoded) {
          rawEvents.push(decoded);
        }
      }
    }

    rawEvents.sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      if (left.logIndex !== right.logIndex) {
        return left.logIndex - right.logIndex;
      }
      const leftSub = left.kind === "transfer" ? left.subIndex : -1;
      const rightSub = right.kind === "transfer" ? right.subIndex : -1;
      return leftSub - rightSub;
    });

    return this.enrichTransfers(rawEvents);
  }

  private decodeCollectionLog(
    collection: CollectionBinding,
    log: Log,
  ): RawTransferItem[] {
    if (!log.transactionHash) {
      return [];
    }

    const txHash = log.transactionHash;
    const logIndex = Number(log.logIndex ?? 0n);
    const blockNumber = Number(log.blockNumber ?? 0n);
    const contractAddress = getAddress(log.address);

    try {
      if (collection.standard === "ERC721") {
        const decoded = decodeEventLog({
          abi: erc721TransferAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "Transfer") {
          return [];
        }
        return [
          {
            kind: "transfer",
            txHash,
            logIndex,
            subIndex: 0,
            blockNumber,
            contractAddress,
            collectionName: collection.name,
            standard: "ERC721",
            eventName: "Transfer",
            from: getAddress(String((decoded.args as any).from)),
            to: getAddress(String((decoded.args as any).to)),
            tokenId: String((decoded.args as any).tokenId),
            value: "1",
          },
        ];
      }

      const decoded = decodeEventLog({
        abi: erc1155TransferAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TransferSingle") {
        return [
          {
            kind: "transfer",
            txHash,
            logIndex,
            subIndex: 0,
            blockNumber,
            contractAddress,
            collectionName: collection.name,
            standard: "ERC1155",
            eventName: "TransferSingle",
            operator: getAddress(String((decoded.args as any).operator)),
            from: getAddress(String((decoded.args as any).from)),
            to: getAddress(String((decoded.args as any).to)),
            tokenId: String((decoded.args as any).id),
            value: String((decoded.args as any).value),
          },
        ];
      }

      if (decoded.eventName === "TransferBatch") {
        const ids = ((decoded.args as any).ids as bigint[]).map((value) => String(value));
        const values = ((decoded.args as any).values as bigint[]).map((value) => String(value));
        return ids.map((tokenId, index) => ({
          kind: "transfer" as const,
          txHash,
          logIndex,
          subIndex: index,
          blockNumber,
          contractAddress,
          collectionName: collection.name,
          standard: "ERC1155" as const,
          eventName: "TransferBatch" as const,
          operator: getAddress(String((decoded.args as any).operator)),
          from: getAddress(String((decoded.args as any).from)),
          to: getAddress(String((decoded.args as any).to)),
          tokenId,
          value: values[index] ?? "0",
        }));
      }

      return [];
    } catch {
      return [];
    }
  }

  private decodeShopLog(shop: ShopBinding, log: Log): RawDelivery | null {
    if (!log.transactionHash) {
      return null;
    }

    try {
      const decoded = decodeEventLog({
        abi: catalogShopAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "DeliveryExecuted") {
        return null;
      }

      const args = decoded.args as any;
      const standardValue = Number(args.standard);
      const standard: TokenStandard = standardValue === 1 ? "ERC721" : "ERC1155";

      return {
        kind: "delivery",
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex ?? 0n),
        blockNumber: Number(log.blockNumber ?? 0n),
        shopName: shop.name,
        context: {
          contextId: String(args.contextId),
          collectionId: Number(args.collectionId),
          collection: getAddress(String(args.collection)),
          standard,
          operator: getAddress(String(args.operator)),
          from: getAddress(String(args.from)),
          to: getAddress(String(args.to)),
          tokenId: String(args.tokenId),
          amount: String(args.amount),
          sourceId: String(args.sourceId),
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Decodes CatalogShop listing/payment events from the shop addresses over a
   * block range, in chain order. Used to index local listing/price state; these
   * events are not delivered to webhook sinks.
   */
  async getListingEvents(fromBlock: number, toBlock: number): Promise<ShopListingEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const decoded: Array<{logIndex: number; event: ShopListingEvent}> = [];

    for (const shop of this.shops) {
      const logs = await this.client.getLogs({
        address: shop.address,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });
      for (const log of logs) {
        const event = this.decodeListingLog(log);
        if (event) {
          decoded.push({logIndex: Number(log.logIndex ?? 0n), event});
        }
      }
    }

    decoded.sort((left, right) => {
      if (left.event.block !== right.event.block) {
        return left.event.block - right.event.block;
      }
      return left.logIndex - right.logIndex;
    });

    // Enrich ERC20 payment events with the token's decimals so prices can be
    // formatted for display. Read once per token and cached.
    for (const {event} of decoded) {
      if (event.kind === "erc20Payment") {
        event.decimals = await this.getErc20Decimals(event.token);
      }
    }

    return decoded.map((entry) => entry.event);
  }

  /** Reads (and caches) an ERC20 token's `decimals()`; defaults to 18 on failure. */
  private async getErc20Decimals(token: string): Promise<number> {
    const key = token.toLowerCase();
    const cached = this.erc20DecimalsCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const decimals = Number(
        await this.client.readContract({
          address: getAddress(token),
          abi: erc20Abi,
          functionName: "decimals",
        }),
      );
      this.erc20DecimalsCache.set(key, decimals);
      return decimals;
    } catch (error) {
      // Non-standard token or transient read failure; default to 18 but don't
      // cache, so a later poll can resolve the real value.
      this.logger?.warn("failed to read erc20 decimals; defaulting to 18", {
        token,
        error: error instanceof Error ? error.message : String(error),
      });
      return 18;
    }
  }

  private decodeListingLog(log: Log): ShopListingEvent | null {
    const block = Number(log.blockNumber ?? 0n);

    try {
      const decoded = decodeEventLog({
        abi: catalogShopAbi,
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as any;

      switch (decoded.eventName) {
        case "ListingCreated":
          return {kind: "listingCreated", listingId: Number(args.listingId), block};
        case "ListingConfigUpdated":
          return {
            kind: "configUpdated",
            listingId: Number(args.listingId),
            active: Boolean(args.active),
            block,
          };
        case "ListingLinesReplaced":
          return {
            kind: "linesReplaced",
            listingId: Number(args.listingId),
            lineCount: Number(args.lineCount),
            block,
          };
        case "ListingLineSet":
          return {
            kind: "lineSet",
            listingId: Number(args.listingId),
            lineIndex: Number(args.lineIndex),
            collectionId: Number(args.collectionId),
            tokenId: String(args.tokenId),
            amountPerUnit: String(args.amountPerUnit),
            block,
          };
        case "ListingDeactivated":
          return {kind: "deactivated", listingId: Number(args.listingId), block};
        case "ETHPaymentConfigured":
          return {
            kind: "ethPayment",
            listingId: Number(args.listingId),
            enabled: Boolean(args.enabled),
            price: String(args.price),
            block,
          };
        case "ERC20PaymentConfigured":
          return {
            kind: "erc20Payment",
            listingId: Number(args.listingId),
            token: getAddress(String(args.token)),
            enabled: Boolean(args.enabled),
            price: String(args.price),
            // Placeholder; resolved from the token contract in getListingEvents.
            decimals: 18,
            block,
          };
        case "ERC20PaymentConfigCleared":
          return {
            kind: "erc20Cleared",
            listingId: Number(args.listingId),
            token: getAddress(String(args.token)),
            block,
          };
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private enrichTransfers(rawEvents: RawEvent[]): ItemTransferEvent[] {
    const deliveryMap = new Map<string, RawDelivery[]>();

    for (const event of rawEvents) {
      if (event.kind !== "delivery") {
        continue;
      }
      const key = this.buildDeliveryKey(
        event.txHash,
        event.context.collection,
        event.context.standard,
        event.context.from,
        event.context.to,
        event.context.tokenId,
        event.context.amount,
      );
      const bucket = deliveryMap.get(key) ?? [];
      bucket.push(event);
      deliveryMap.set(key, bucket);
    }

    for (const bucket of deliveryMap.values()) {
      bucket.sort((left, right) => left.logIndex - right.logIndex);
    }

    const transfers = rawEvents.filter(
      (event): event is RawTransferItem => event.kind === "transfer",
    );

    return transfers.map((transfer) => {
      const key = this.buildDeliveryKey(
        transfer.txHash,
        transfer.contractAddress,
        transfer.standard,
        transfer.from,
        transfer.to,
        transfer.tokenId,
        transfer.value,
      );
      const match = deliveryMap.get(key)?.shift();
      // ERC721 Transfer has no operator field, so we fall back to shop context or sender.
      const operator = transfer.operator ?? match?.context.operator ?? transfer.from;

      return {
        notificationId: `${transfer.txHash}:${transfer.logIndex}:${transfer.subIndex}`,
        txHash: transfer.txHash,
        logIndex: transfer.logIndex,
        subIndex: transfer.subIndex,
        blockNumber: transfer.blockNumber,
        contractAddress: transfer.contractAddress,
        collectionName: transfer.collectionName,
        standard: transfer.standard,
        eventName: transfer.eventName,
        operator,
        from: transfer.from,
        to: transfer.to,
        tokenId: transfer.tokenId,
        value: transfer.value,
        ...(match ? {shopContext: match.context} : {}),
      };
    });
  }

  private buildDeliveryKey(
    txHash: string,
    collection: Address,
    standard: TokenStandard,
    from: Address,
    to: Address,
    tokenId: string,
    amount: string,
  ): string {
    return [
      txHash.toLowerCase(),
      collection.toLowerCase(),
      standard,
      from.toLowerCase(),
      to.toLowerCase(),
      tokenId,
      amount,
    ].join(":");
  }
}
