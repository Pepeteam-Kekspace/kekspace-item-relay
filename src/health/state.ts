import type {HealthSnapshot} from "../types.js";

export class RelayHealth {
  private snapshot: HealthSnapshot;

  constructor(service: string, chainId: number, enabledSinks: string[]) {
    this.snapshot = {
      service,
      chainId,
      lastObservedBlock: 0,
      lastProcessedBlock: 0,
      lastEventTimestamp: null,
      lastSuccessfulPushTimestamp: null,
      pendingRetries: 0,
      failedRetries: 0,
      deadLetters: 0,
      enabledSinks,
    };
  }

  setLastObservedBlock(blockNumber: number): void {
    this.snapshot.lastObservedBlock = blockNumber;
  }

  setLastProcessedBlock(blockNumber: number): void {
    this.snapshot.lastProcessedBlock = blockNumber;
  }

  markEvent(now: number): void {
    this.snapshot.lastEventTimestamp = now;
  }

  markSuccessfulPush(now: number): void {
    this.snapshot.lastSuccessfulPushTimestamp = now;
  }

  setQueueCounts(pending: number, failed: number, dead: number): void {
    this.snapshot.pendingRetries = pending;
    this.snapshot.failedRetries = failed;
    this.snapshot.deadLetters = dead;
  }

  getSnapshot(): HealthSnapshot {
    return {...this.snapshot};
  }
}
