import {createChainClient} from "./chain/client.js";
import {ItemRelayAdapter} from "./chain/adapter.js";
import {RelayDatabase} from "./db/database.js";
import {MetaRepo} from "./db/metaRepo.js";
import {QueueRepo} from "./db/queueRepo.js";
import {RelayHealth} from "./health/state.js";
import {WebhookSinkClient, WebhookSinkError} from "./sinks/client.js";
import {computeBackoffDelay, sleep} from "./util/backoff.js";
import type {Logger} from "./util/logger.js";
import type {
  ItemTransferEvent,
  LegacyTransferPayload,
  NormalizedTransferPayload,
  ServiceConfig,
} from "./types.js";

export class RelayApp {
  private readonly db: RelayDatabase;
  private readonly metaRepo: MetaRepo;
  private readonly queueRepo: QueueRepo;
  private readonly chainClient;
  private readonly adapter: ItemRelayAdapter;
  private readonly sinks: Map<string, WebhookSinkClient>;
  private readonly health: RelayHealth;

  constructor(
    private readonly config: ServiceConfig,
    private readonly logger: Logger,
  ) {
    this.db = new RelayDatabase(this.config.storage.sqlitePath);
    this.metaRepo = new MetaRepo(this.db.connection);
    this.queueRepo = new QueueRepo(this.db.connection);
    this.chainClient = createChainClient(this.config.chain);
    this.adapter = new ItemRelayAdapter(
      this.chainClient,
      this.config.collections,
      this.config.shops,
    );
    this.sinks = this.buildSinks();
    this.health = new RelayHealth(
      this.config.serviceName,
      this.config.chain.chainId,
      Array.from(this.sinks.keys()),
    );
  }

  getHealth(): RelayHealth {
    return this.health;
  }

  async start(): Promise<void> {
    void this.runQueueWorker();
    await this.runPollLoop();
  }

  private buildSinks(): Map<string, WebhookSinkClient> {
    const sinks = new Map<string, WebhookSinkClient>();
    if (this.config.sinks.legacy?.enabled) {
      sinks.set("legacy", new WebhookSinkClient("legacy", this.config.sinks.legacy));
    }
    if (this.config.sinks.normalized?.enabled) {
      sinks.set(
        "normalized",
        new WebhookSinkClient("normalized", this.config.sinks.normalized),
      );
    }
    if (sinks.size === 0) {
      throw new Error("at least one sink must be enabled");
    }
    return sinks;
  }

  private async runPollLoop(): Promise<void> {
    const pollLogger = this.logger.child("poll");
    let nextFromBlock = Math.max(
      this.config.chain.startBlock,
      (this.metaRepo.getNumber("last_processed_block") ?? this.config.chain.startBlock - 1) + 1,
    );

    while (true) {
      try {
        const latestBlock = await this.adapter.getLatestBlock();
        this.health.setLastObservedBlock(latestBlock);

        const stableBlock = Math.max(
          0,
          latestBlock - this.config.chain.confirmationDepth,
        );

        if (stableBlock >= nextFromBlock) {
          const events = await this.adapter.getItemEvents(nextFromBlock, stableBlock);
          const now = Date.now();
          for (const event of events) {
            this.enqueueForSinks(event, now);
          }
          this.metaRepo.setNumber("last_processed_block", stableBlock);
          this.health.setLastProcessedBlock(stableBlock);
          if (events.length > 0) {
            this.health.markEvent(now);
          }
          pollLogger.info("processed block range", {
            fromBlock: nextFromBlock,
            toBlock: stableBlock,
            eventCount: events.length,
          });
          nextFromBlock = stableBlock + 1;
        }
      } catch (error) {
        pollLogger.warn("poll loop iteration failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      this.refreshHealthCounts();
      await sleep(this.config.sync.pollIntervalMs);
    }
  }

  private enqueueForSinks(event: ItemTransferEvent, now: number): void {
    const legacyPayload = this.toLegacyPayload(event);
    const normalizedPayload = this.toNormalizedPayload(event);

    for (const [sinkKey] of this.sinks) {
      const payload = sinkKey === "legacy" ? legacyPayload : normalizedPayload;
      this.queueRepo.enqueue(sinkKey, event, payload, now);
    }
  }

  private toLegacyPayload(event: ItemTransferEvent): LegacyTransferPayload {
    return {
      block_number: String(event.blockNumber),
      tx_hash: event.txHash,
      operator: event.operator,
      from: event.from,
      to: event.to,
      token_id: event.tokenId,
      value: event.value,
    };
  }

  private toNormalizedPayload(event: ItemTransferEvent): NormalizedTransferPayload {
    return {
      event_id: event.notificationId,
      chain_id: this.config.chain.chainId,
      block_number: event.blockNumber,
      tx_hash: event.txHash,
      log_index: event.logIndex,
      sub_index: event.subIndex,
      contract_address: event.contractAddress,
      collection_name: event.collectionName,
      standard: event.standard,
      event_name: event.eventName,
      operator: event.operator,
      from: event.from,
      to: event.to,
      token_id: event.tokenId,
      value: event.value,
      ...(event.shopContext
        ? {
            shop_context: {
              context_id: event.shopContext.contextId,
              collection_id: event.shopContext.collectionId,
              collection: event.shopContext.collection,
              standard: event.shopContext.standard,
              operator: event.shopContext.operator,
              from: event.shopContext.from,
              to: event.shopContext.to,
              token_id: event.shopContext.tokenId,
              amount: event.shopContext.amount,
              source_id: event.shopContext.sourceId,
            },
          }
        : {}),
    };
  }

  private async runQueueWorker(): Promise<void> {
    const queueLogger = this.logger.child("queue");

    while (true) {
      const now = Date.now();
      const records = this.queueRepo.claimReady(this.config.sync.queueBatchSize, now);
      if (records.length === 0) {
        this.refreshHealthCounts();
        await sleep(1000);
        continue;
      }

      for (const record of records) {
        const sink = this.sinks.get(record.sinkKey);
        if (!sink) {
          this.queueRepo.markDead(record.id, `unknown sink: ${record.sinkKey}`);
          continue;
        }

        try {
          await sink.push(JSON.parse(record.payloadJson) as unknown);
          this.queueRepo.markSucceeded(record.id);
          this.health.markSuccessfulPush(Date.now());
          queueLogger.info("pushed transfer notification", {
            sink: record.sinkKey,
            notificationId: record.notificationId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (error instanceof WebhookSinkError && !error.retryable) {
            this.queueRepo.markDead(record.id, message);
          } else {
            const nextAttemptAt =
              Date.now() +
              computeBackoffDelay(
                record.attemptCount,
                this.config.sync.retryBaseDelayMs,
                this.config.sync.retryMaxDelayMs,
              );
            this.queueRepo.markFailed(record.id, "failed", nextAttemptAt, message);
          }
          queueLogger.warn("failed to push transfer notification", {
            sink: record.sinkKey,
            notificationId: record.notificationId,
            error: message,
          });
        }
      }

      this.refreshHealthCounts();
    }
  }

  private refreshHealthCounts(): void {
    this.health.setQueueCounts(
      this.queueRepo.countByStatus("pending"),
      this.queueRepo.countByStatus("failed"),
      this.queueRepo.countByStatus("dead"),
    );
  }
}
