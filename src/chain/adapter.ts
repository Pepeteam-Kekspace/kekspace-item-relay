import {decodeEventLog, getAddress, type Address, type Log, type PublicClient} from "viem";
import {erc721TransferAbi} from "../abi/erc721.js";
import {erc1155TransferAbi} from "../abi/erc1155.js";
import {catalogShopAbi} from "../abi/catalogShop.js";
import type {
  CollectionBinding,
  ItemTransferEvent,
  ShopBinding,
  ShopContext,
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
  constructor(
    private readonly client: PublicClient,
    private readonly collections: CollectionBinding[],
    private readonly shops: ShopBinding[],
  ) {}

  async getLatestBlock(): Promise<number> {
    return Number(await this.client.getBlockNumber());
  }

  async getItemEvents(fromBlock: number, toBlock: number): Promise<ItemTransferEvent[]> {
    if (toBlock < fromBlock) {
      return [];
    }

    const rawEvents: RawEvent[] = [];
    const maxBlockRange = 10000;

    // Batch block ranges to avoid RPC limits
    for (let batchFromBlock = fromBlock; batchFromBlock <= toBlock; batchFromBlock += maxBlockRange) {
      const batchToBlock = Math.min(batchFromBlock + maxBlockRange - 1, toBlock);

      for (const collection of this.collections) {
        const logs = await this.client.getLogs({
          address: collection.address,
          fromBlock: BigInt(batchFromBlock),
          toBlock: BigInt(batchToBlock),
        });
        for (const log of logs) {
          rawEvents.push(...this.decodeCollectionLog(collection, log));
        }
      }

      for (const shop of this.shops) {
        const logs = await this.client.getLogs({
          address: shop.address,
          fromBlock: BigInt(batchFromBlock),
          toBlock: BigInt(batchToBlock),
        });
        for (const log of logs) {
          const decoded = this.decodeShopLog(shop, log);
          if (decoded) {
            rawEvents.push(decoded);
          }
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
