# Kekspace Item Relay

`item-relay` is a production-oriented replacement for the old `ksitems-listener` script.
It closes the known gaps:

- ERC721 `Transfer` support
- ERC1155 `TransferSingle` support
- ERC1155 `TransferBatch` support
- multiple collection addresses
- optional `DeliveryExecuted` enrichment from `CatalogShop`
- SQLite-backed deduplication
- restart backfill from the last processed block
- retry queue for downstream webhook delivery

## Compatibility model

This relay supports two outbound sinks:

- `normalized`: the recommended primary mode
  - posts to `/Kekspace/Web3ItemTransfer`
  - includes `standard`, `event_name`, `contract_address`, `log_index`, `sub_index`, and optional `shop_context`
  - treats ERC721, ERC1155 single, and ERC1155 batch transfers as first-class event types instead of forcing them into an ERC1155-only worldview
- `legacy`: optional fallback mode during backend migration
  - `{block_number, tx_hash, operator, from, to, token_id, value}`
  - ERC1155 batches are expanded into one payload per `(tokenId, value)` pair
  - ERC721 transfers are normalized to `value = "1"`
  - ERC721 `operator` is best-effort: the relay uses shop `DeliveryExecuted.operator` when available, otherwise it falls back to `from`

If the backend mainly cares about keeping the `/Kekspace/Web3ItemTransfer` route stable, use `normalized` on that route and only enable `legacy` as a temporary compatibility shim if the downstream parser still requires the old shape.

## Recommended rollout

1. Keep the route stable at `/Kekspace/Web3ItemTransfer`.
2. Send the normalized payload to that route.
3. If the game server still has rigid field validation, enable `legacy` temporarily in parallel.
4. Remove `legacy` once the backend has fully switched to normalized parsing.

## Run

1. Copy `config/config.example.json` to a real config file.
2. Point `ITEM_RELAY_CONFIG` at that file.
3. Install dependencies:

```bash
npm install
```

4. Start the relay:

```bash
npm run dev
```

## Incoming Endpoints

The service exposes a single HTTP endpoint for monitoring.

### `GET /health`

Returns the current health and operational state of the relay.

**Default address:** `http://localhost:3090/health` 

```
curl https://localhost:3090/health
```

(Host and port are configurable via `health.host` / `health.port` in the service config.)

**Authentication:** None

**Request**

No query parameters, headers, or request body required.

```
GET /health HTTP/1.1
Host: 127.0.0.1:3030
```

**Response**

`200 OK` with `Content-Type: application/json`. Any other path returns `404`.

```json
{
  "service": "item-relay",
  "chainId": 57073,
  "lastObservedBlock": 8765432,
  "lastProcessedBlock": 8765425,
  "lastEventTimestamp": 1714000000000,
  "lastSuccessfulPushTimestamp": 1714000005000,
  "pendingRetries": 0,
  "failedRetries": 0,
  "deadLetters": 0,
  "enabledSinks": ["normalized"]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `service` | `string` | Service name from config |
| `chainId` | `number` | Blockchain chain ID being monitored |
| `lastObservedBlock` | `number` | Most recent block seen from the RPC |
| `lastProcessedBlock` | `number` | Most recent block fully processed |
| `lastEventTimestamp` | `number` | Unix ms when the last transfer event was found |
| `lastSuccessfulPushTimestamp` | `number` | Unix ms of the last successful webhook delivery |
| `pendingRetries` | `number` | Items waiting for first delivery attempt |
| `failedRetries` | `number` | Items that failed and are waiting to retry |
| `deadLetters` | `number` | Items that received a `4xx` and will never be retried |
| `enabledSinks` | `string[]` | Active sink names, e.g. `["normalized"]` or `["legacy", "normalized"]` |

A healthy service has `deadLetters: 0` and `lastProcessedBlock` close to `lastObservedBlock`.

---

## Outbound Webhooks — Game Server Endpoints

The item-relay service pushes token transfer events to the KekSpace game server via HTTP POST. Two formats are available: **normalized** (recommended) and **legacy**.

**Base URL:** http://localhost:3030

### Common request headers

```
POST {endpoint}
Content-Type: application/json
Authorization: Bearer {token}
```

If a custom `authHeader` is configured on the relay side, that header name is used instead of `Authorization` and the token value is sent as-is (no `Bearer` prefix).

### Delivery guarantees

| Response | Behaviour |
| --- | --- |
| `2xx` | Success — message removed from queue |
| `5xx` or network/timeout error | Retried with exponential backoff, indefinitely |
| `4xx` | Permanent failure — moved to dead-letter, never retried |

Default backoff schedule (delays have ±20% jitter):

| Attempt | Approximate delay |
| --- | --- |
| 0 | ~1 s |
| 1 | ~2 s |
| 2 | ~4 s |
| 5+ | ~30 s (capped) |

---

### `POST /Kekspace/Web3ItemTransfer` — Normalized (recommended)

Use this endpoint for all new integrations.

**Full URL:** `https://localhost:3030/Kekspace/Web3ItemTransfer`

**Payload**

```json
{
  "event_id": "0xabc...def:12:0",
  "chain_id": 57073,
  "block_number": 8765432,
  "tx_hash": "0xabc...def",
  "log_index": 12,
  "sub_index": 0,
  "contract_address": "0x...",
  "collection_name": "wearables1155",
  "standard": "ERC1155",
  "event_name": "TransferSingle",
  "operator": "0x...",
  "from": "0x...",
  "to": "0x...",
  "token_id": "42",
  "value": "3",
  "shop_context": {
    "context_id": "0x...",
    "collection_id": 1,
    "collection": "0x...",
    "standard": "ERC1155",
    "operator": "0x...",
    "from": "0x...",
    "to": "0x...",
    "token_id": "42",
    "amount": "3",
    "source_id": "7"
  }
}
```

**Top-level fields**

| Field | Type | Description |
| --- | --- | --- |
| `event_id` | `string` | Globally unique per transfer line (`txHash:logIndex:subIndex`). Use as an idempotency key. |
| `chain_id` | `number` | Chain ID the transfer occurred on |
| `block_number` | `number` | Block number of the transfer |
| `tx_hash` | `string` | Transaction hash |
| `log_index` | `number` | Log index within the transaction |
| `sub_index` | `number` | `0` for single transfers. For `TransferBatch`, each token ID gets its own payload with an incrementing `sub_index`. |
| `contract_address` | `string` | Token contract address |
| `collection_name` | `string` | Friendly name from relay config |
| `standard` | `"ERC721" \ | "ERC1155"` | Token standard |
| `event_name` | `"Transfer" \ | "TransferSingle" \ | "TransferBatch"` | On-chain event name (`Transfer` = ERC-721, `TransferSingle` / `TransferBatch` = ERC-1155) |
| `operator` | `string` | Address that triggered the transfer |
| `from` | `string` | Sender address. Zero address (`0x000...000`) for mints. |
| `to` | `string` | Recipient address |
| `token_id` | `string` | Token ID (numeric string) |
| `value` | `string` | Amount transferred. Always `"1"` for ERC-721. |
| `shop_context` | `object \ | undefined` | Present only when the transfer originated through the CatalogShop. Omitted for direct transfers. |

**`shop_context` fields**

| Field | Type | Description |
| --- | --- | --- |
| `context_id` | `string` | CatalogShop delivery ID |
| `collection_id` | `number` | Internal collection identifier in the shop |
| `collection` | `string` | Collection contract address |
| `standard` | `"ERC721" \ | "ERC1155"` | Token standard as recorded by the shop |
| `operator` | `string` | Shop operator address |
| `from` | `string` | Source address in the shop delivery |
| `to` | `string` | Recipient address in the shop delivery |
| `token_id` | `string` | Token ID as recorded by the shop |
| `amount` | `string` | Amount as recorded by the shop |
| `source_id` | `string` | CatalogShop listing ID |

---

### `POST /Kekspace/Web3ItemTransferLegacy` — Legacy

Use this endpoint only if you have an existing integration that cannot be migrated to the normalized format.

**Full URL:** `https://localhost:3030/Kekspace/Web3ItemTransferLegacy`

**Payload**

```json
{
  "block_number": "8765432",
  "tx_hash": "0xabc...def",
  "operator": "0x...",
  "from": "0x...",
  "to": "0x...",
  "token_id": "42",
  "value": "3"
}
```

All values are strings.

| Field | Type | Description |
| --- | --- | --- |
| `block_number` | `string` | Block number of the transfer |
| `tx_hash` | `string` | Transaction hash |
| `operator` | `string` | Address that triggered the transfer. For ERC-721 transfers, falls back to `from` if no shop context is available. |
| `from` | `string` | Sender address |
| `to` | `string` | Recipient address |
| `token_id` | `string` | Token ID |
| `value` | `string` | Amount transferred |

> **Note:** `TransferBatch` events are expanded — one POST per token ID. Both sinks can be enabled simultaneously during a migration period.

---

## Service Configuration Reference

The relay is configured via a JSON file (default: `config/config.json`) or the `ITEM_RELAY_CONFIG` env var.

```json
{
  "serviceName": "item-relay",
  "chain": {
    "chainId": 57073,
    "httpRpcUrl": "https://your-rpc-endpoint",
    "startBlock": 0,
    "confirmationDepth": 0
  },
  "sync": {
    "pollIntervalMs": 3000,
    "retryBaseDelayMs": 1000,
    "retryMaxDelayMs": 30000,
    "queueBatchSize": 50
  },
  "storage": {
    "sqlitePath": "./data/item-relay.sqlite"
  },
  "collections": [
    { "name": "wearables1155", "address": "0x...", "standard": "ERC1155" },
    { "name": "collectibles721", "address": "0x...", "standard": "ERC721" }
  ],
  "shops": [
    { "name": "catalogShop", "address": "0x..." }
  ],
  "sinks": {
    "normalized": {
      "enabled": true,
      "endpointUrl": "https://localhost:3030/Kekspace/Web3ItemTransfer",
      "timeoutMs": 5000,
      "authToken": "optional-bearer-token",
      "authHeader": "optional-custom-header-name"
    },
    "legacy": {
      "enabled": false,
      "endpointUrl": "https://localhost:3030/Kekspace/Web3ItemTransferLegacy",
      "timeoutMs": 5000
    }
  },
  "health": {
    "host": "127.0.0.1",
    "port": 3030
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `chain.chainId` | `number` | Must match the chain your contracts are deployed on |
| `chain.httpRpcUrl` | `string` | HTTP(S) RPC endpoint (WebSocket not supported) |
| `chain.startBlock` | `number` | First block to scan — set to your contract deployment block |
| `chain.confirmationDepth` | `number` | Blocks behind tip to wait before processing. `0` = process immediately. |
| `sync.pollIntervalMs` | `number` | Milliseconds between RPC polls |
| `sync.retryBaseDelayMs` | `number` | Starting backoff delay for failed deliveries |
| `sync.retryMaxDelayMs` | `number` | Maximum backoff delay |
| `sync.queueBatchSize` | `number` | Items to process per worker iteration |
| `storage.sqlitePath` | `string` | Path to SQLite file (directory created if missing) |
| `collections[].name` | `string` | Friendly name used in normalized payloads |
| `collections[].address` | `string` | Checksummed contract address |
| `collections[].standard` | `"ERC1155" \ | "ERC721"` | Determines which events to decode |
| `shops[].address` | `string` | CatalogShop address for delivery context enrichment |
| `sinks.*.enabled` | `boolean` | At least one sink must be enabled |
| `sinks.*.endpointUrl` | `string` | Full webhook URL including path |
| `sinks.*.timeoutMs` | `number` | Per-request timeout in milliseconds |
| `sinks.*.authToken` | `string` (optional) | Sent as `Authorization: Bearer <token>` unless `authHeader` is set |
| `sinks.*.authHeader` | `string` (optional) | Overrides the header name; token sent as-is with no `Bearer` prefix |
| `health.host` | `string` | `127.0.0.1` for localhost only, `0.0.0.0` to expose externally |
| `health.port` | `number` | Port for the health endpoint |



## Testing & Event Injection

To test the webhook delivery without waiting for blockchain events, enable the optional test server in your config:

```json
{
  "test": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 3095
  }
}
```

Then POST a test event to inject it into the queue:

```bash
curl -X POST http://127.0.0.1:3095/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "test-event-1",
    "blockNumber": 1000000,
    "txHash": "0x123456789abcdef",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0x0000000000000000000000000000000000000001",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x0000000000000000000000000000000000000002",
    "to": "0x0000000000000000000000000000000000000003",
    "operator": "0x0000000000000000000000000000000000000004",
    "tokenId": "42",
    "value": "100"
  }'
```

The event will flow through the same queue and webhook delivery logic as blockchain events, so you can verify your downstream endpoint receives the correct payload shape.


## Mock Webhook Endpoint Listener

In the tools/ folder there is a Quick Node mock server.

Normally the game  will listen to events sent from the listener to port 3000, but if it is not in place yet
the item-relay will give errors while testing.

Running this mock-webhook-server.sh allows testing curl calls with no game/webhook server running.

This is only needed if enabling test mode and there is no game endpoint yet
