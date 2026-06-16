# Kekspace Item Relay

`item-relay` is a production-oriented replacement for the old `ksitems-listener` script.

# Quick Start (Read This!)

## Run

- Copy config to `config/config.json`
- Install dependencies and build:

```bash
npm install
```

- Start kekspace-item-relay:

```bash
npm run dev
```

For production use `npm run start`



## Local API ListingID Lookup

These answer queries from CatalogShop. Full reference and response shapes are in `README-API.md`.

### `http://localhost:3099/fetch` API Examples:

```bash
# Get listingID + price (eth and erc20, if any) for a tokenId
curl 'http://127.0.0.1:3099/fetch?tokenId=218'
{"tokenId":"218","listingId":1,"eth":"0","erc20":[]}

# Bundle listing lookup - list of IDs + price. You need to know the bundle listingID.
curl 'http://127.0.0.1:3099/fetchBundle?bundleId=7'

# All listings for a token, if same tokenId is used in different collections (Not needed now)
curl 'http://127.0.0.1:3099/fetchInCollection?tokenId=218'

```

### Example response:
```bash
❯ curl 'http://localhost:3099/fetch?tokenId=218'
{"tokenId":"218","listingId":1,"eth":"0","erc20":[]}

❯ curl 'http://localhost:3099/fetch?tokenId=203'
{"tokenId":"203","listingId":3,"eth":"0.0005","erc20":[]}

❯ curl 'http://localhost:3099/fetch?tokenId=000'
{"error":"no active listing for tokenId","tokenId":"000"}

```
----------



## Listener Events 
### `http://localhost:3030/Kekspace/Web3ItemTransferLegacy`

- The item-relay service pushes token transfer events to the KekSpace game server via HTTP POST. 
- Two formats are available: **normalized** (recommended) and **legacy**.

**For now we can use the legacy endpoint.**

**Base URL:** `http://localhost:3030/Kekspace/Web3ItemTransferLegacy`

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


-------------------------




## Health Endpoint

### `GET /health`

Returns the current health and status.
```
curl https://localhost:3090/health
```

**Response**

`200 OK` with `Content-Type: application/json`.

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
A healthy service has `deadLetters: 0` and `lastProcessedBlock` close to `lastObservedBlock`.


-------------------

### config.json - Info about testing

Enabling the `endpoint` block in config.json starts a localhost-only API on `127.0.0.1:3099` with two purposes: 

- **read endpoints** for game devs (listing/bundle/price lookups) and an optional 
- **event-injection** endpoint for testing.

```json
...config.json...
{
  "endpoint": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 3099,
    "eventTesting": true
  }
}
```
- `enabled` runs the server and the read endpoints.
- `eventTesting: true` enables `POST http://localhost:3090/inject`for "fake" event testing - see **EXAMPLES.md**
-  **Keep `eventTesting` off in production.**




### Event injection (testing only)

With `eventTesting: true`, POST a test event to inject it into the queue 

**see `EXAMPLES.md` for curl "fake" event testing examples.**

### One more note:
### If you want to watch the Web3ItemTransferLegacy and watch the output in terminal,
### run:
```
❯ tools/mock-webhook-server-legacy.sh
Mock LEGACY webhook server listening on http://localhost:3030/Kekspace/Web3ItemTransferLegacy

Received LEGACY webhook: {
  block_number: '5843210',
  tx_hash: '0x8d7c9e4f3b2a1d6c5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
  operator: '0x1234567890abcdef1234567890abcdef12345678',
  from: '0x0000000000000000000000000000000000000000',
  to: '0x1234567890abcdef1234567890abcdef12345678',
  token_id: '1001',
  value: '1'
}
```
**you will see events or "test" events here, and/or in your game listener**

Thank you for reading the quickstart. Don't forget, test examples are in EXAMPLES.md

-----------------------------------
-----------------------------------
-----------------------------------
-----------------------------------

#END QUICKSTART

-----------------------------------
-----------------------------------
-----------------------------------
-----------------------------------

Some information is repeated below, the Quick Start has the most important info.
Also see EXAMPLES.md
Detailed API info in README-API.md


## README.md



##kekspace-item-relay


**Features:**

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

1. Copy `config/config.example.json` to `config/config.json`
2. or export `ITEM_RELAY_CONFIG=config/custom_config_file.json`
3. Install dependencies:

```bash
npm install
```

4. Start the relay:

```bash
npm run dev
```

## Health Endpoint

The service exposes a single HTTP endpoint for status.

### `GET /health`

Returns the current health and operational state of the relay.

**Default address:** `http://localhost:3090/health` 

```
curl https://localhost:3090/health
```

(Host and port are configurable via `health.host` / `health.port` in the service config.)

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

http://localhost:3030/Kekspace/Web3ItemTransferLegacy`

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
### `POST /Kekspace/Web3ItemTransferLegacy` — Legacy

Use this endpoint for compatbility with the old listener, until upgrading is needed.

**Full URL:** `https://localhost:3030/Kekspace/Web3ItemTransferLegacy






## config.json Reference

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
  },
  {
  "endpoint": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 3099,
    "eventTesting": false
  }
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
| `endpoint.enabled` | `boolean` | Runs the local API server (`:3099`) that serves the read endpoints |
| `endpoint.host` | `string` | Local API bind host (use `127.0.0.1`) |
| `endpoint.port` | `number` | Local API port (default `3099`) |
| `endpoint.eventTesting` | `boolean` | Gates `POST /inject` only. Keep `false` in production |


--------------------

## Local API Server (port 3099)

Enabling the `endpoint` block starts a localhost-only API on `127.0.0.1:3099` with two purposes: **read endpoints** for game devs (listing/bundle/price lookups) and an optional **event-injection** endpoint for testing.

```json
{
  "endpoint": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 3099,
    "eventTesting": false
  }
}
```

- `enabled` runs the server and the read endpoints.
- `eventTesting` gates `POST /inject` only — when `false`, injection returns `403` while the read endpoints keep working. **Keep `eventTesting` off in production.**

### Read endpoints

These answer queries from CatalogShop listing state the relay indexes locally from on-chain events (no per-request chain call). Full reference and response shapes are in `README-API.md`.

```bash
# First standalone listing + price for a token (assumes tokenId is unique)
curl 'http://127.0.0.1:3099/fetch?tokenId=218'

# All standalone listings for a token, one per collection
curl 'http://127.0.0.1:3099/fetchInCollection?tokenId=218'

# A listing's full composition + price (isBundle=true when it has >1 line)
curl 'http://127.0.0.1:3099/fetchBundle?bundleId=2'
```

A **bundle** is a single listing with more than one delivery line; bundles are excluded from the standalone-token lookups, so a discounted bundle never overrides a token's standalone price.


## Example Fetch Requests

Quick curl examples for the read endpoints on the local API server (`127.0.0.1:3099`, enabled by `endpoint.enabled`). These need no `eventTesting` flag. Replace `218` / `2` with a real tokenId / listingId from your CatalogShop. See `README-API.md` for full detailed info.

```bash
# Look up the first standalone listing + price for a token
curl 'http://127.0.0.1:3099/fetch?tokenId=218'
# → {"tokenId":"218","listingId":1,"eth":"1000000000000000000","erc20":[]}

# Look up standalone listings for a token across every collection (one per collection)
curl 'http://127.0.0.1:3099/fetchInCollection?tokenId=218'
# → {"tokenId":"218","listings":[{"listingId":1,"collectionId":1,"eth":"1000000000000000000","erc20":[]}]}

# Look up a listing's full composition + price by listingId (isBundle=true when it has >1 line)
curl 'http://127.0.0.1:3099/fetchBundle?bundleId=2'
# → {"bundleId":2,"isBundle":true,"eth":"500000000000000000","erc20":[],"items":[{"collectionId":1,"tokenId":"218","amount":"1"},{"collectionId":1,"tokenId":"777","amount":"1"}]}
```



### Event injection (testing only)

With `eventTesting: true`, POST a test event to inject it into the queue (see `EXAMPLES.md` for more):

```bash
curl -X POST http://127.0.0.1:3099/inject \
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

# See EXAMPLES.md for more event testing examples.




