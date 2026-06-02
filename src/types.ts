import type {Address} from "viem";

export type TokenStandard = "ERC1155" | "ERC721";

export type CollectionBinding = {
  name: string;
  address: Address;
  standard: TokenStandard;
};

export type ShopBinding = {
  name: string;
  address: Address;
};

export type SinkConfig = {
  enabled: boolean;
  endpointUrl: string;
  timeoutMs: number;
  authToken?: string;
  authHeader?: string;
};

export type ServiceConfig = {
  serviceName: string;
  chain: {
    chainId: number;
    httpRpcUrl: string;
    startBlock: number;
    confirmationDepth: number;
  };
  sync: {
    pollIntervalMs: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
    queueBatchSize: number;
  };
  storage: {
    sqlitePath: string;
  };
  collections: CollectionBinding[];
  shops: ShopBinding[];
  sinks: {
    legacy?: SinkConfig;
    normalized?: SinkConfig;
  };
  health: {
    host: string;
    port: number;
  };
  test?: {
    enabled: boolean;
    host: string;
    port: number;
  };
};

export type ShopContext = {
  contextId: string;
  collectionId: number;
  collection: Address;
  standard: TokenStandard;
  operator: Address;
  from: Address;
  to: Address;
  tokenId: string;
  amount: string;
  sourceId: string;
};

export type ItemTransferEvent = {
  notificationId: string;
  txHash: string;
  logIndex: number;
  subIndex: number;
  blockNumber: number;
  contractAddress: Address;
  collectionName: string;
  standard: TokenStandard;
  eventName: "Transfer" | "TransferSingle" | "TransferBatch";
  operator: Address;
  from: Address;
  to: Address;
  tokenId: string;
  value: string;
  shopContext?: ShopContext;
};

export type LegacyTransferPayload = {
  block_number: string;
  tx_hash: string;
  operator: string;
  from: string;
  to: string;
  token_id: string;
  value: string;
};

export type NormalizedTransferPayload = {
  event_id: string;
  chain_id: number;
  block_number: number;
  tx_hash: string;
  log_index: number;
  sub_index: number;
  contract_address: string;
  collection_name: string;
  standard: TokenStandard;
  event_name: "Transfer" | "TransferSingle" | "TransferBatch";
  operator: string;
  from: string;
  to: string;
  token_id: string;
  value: string;
  shop_context?: {
    context_id: string;
    collection_id: number;
    collection: string;
    standard: TokenStandard;
    operator: string;
    from: string;
    to: string;
    token_id: string;
    amount: string;
    source_id: string;
  };
};

export type QueueStatus = "pending" | "inflight" | "failed" | "dead" | "done";

export type QueueRecord = {
  id: number;
  sinkKey: string;
  notificationId: string;
  payloadJson: string;
  status: QueueStatus;
  attemptCount: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type HealthSnapshot = {
  service: string;
  chainId: number;
  lastObservedBlock: number;
  lastProcessedBlock: number;
  lastEventTimestamp: number | null;
  lastSuccessfulPushTimestamp: number | null;
  pendingRetries: number;
  failedRetries: number;
  deadLetters: number;
  enabledSinks: string[];
};
