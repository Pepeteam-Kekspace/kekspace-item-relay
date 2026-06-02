# Kekspace Item Relay

`item-relay` is a production-oriented replacement for the old `ksitems-listener` script.

## See README-API.md for in-depth details

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

The health endpoint is exposed at `/health`.

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
