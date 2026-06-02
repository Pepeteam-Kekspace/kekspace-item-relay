# Event Injection Examples

The test server must be enabled with `"enabled": true` in `config.test`.

**Test Server Endpoint:** `POST http://127.0.0.1:3099/inject`

All examples send events to the same queue and delivery system as real blockchain events.

---

## 1. ERC1155 TransferSingle - Wearables (Basic)

Single item transfer from Wearables collection.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-wearables-001",
    "blockNumber": 5843210,
    "txHash": "0x8d7c9e4f3b2a1d6c5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x0000000000000000000000000000000000000000",
    "to": "0x1234567890abcdef1234567890abcdef12345678",
    "operator": "0x1234567890abcdef1234567890abcdef12345678",
    "tokenId": "1001",
    "value": "1"
  }'
```

---

## 2. ERC1155 TransferBatch - Wearables (Multiple Items)

Batch transfer of multiple wearable items in one transaction.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-wearables-batch-001",
    "blockNumber": 5843211,
    "txHash": "0x9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d",
    "logIndex": 2,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferBatch",
    "from": "0x1234567890abcdef1234567890abcdef12345678",
    "to": "0xabcdef1234567890abcdef1234567890abcdef12",
    "operator": "0x1234567890abcdef1234567890abcdef12345678",
    "tokenId": "1002,1003,1004",
    "value": "5,10,3"
  }'
```

---

## 3. ERC1155 TransferSingle - WorldItems

Single item transfer from WorldItems collection.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-worlditems-001",
    "blockNumber": 5843212,
    "txHash": "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    "logIndex": 1,
    "subIndex": 0,
    "contractAddress": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
    "collectionName": "worlditems1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x0000000000000000000000000000000000000000",
    "to": "0xfedc ba98765432 10fedc ba987654321 0fedc ba9",
    "operator": "0xfedc ba98765432 10fedc ba987654321 0fedc ba9",
    "tokenId": "2001",
    "value": "50"
  }'
```

---

## 4. ERC1155 TransferBatch - WorldItems (Bulk Transfer)

Large batch transfer of world items.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-worlditems-batch-001",
    "blockNumber": 5843213,
    "txHash": "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
    "logIndex": 3,
    "subIndex": 0,
    "contractAddress": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
    "collectionName": "worlditems1155",
    "standard": "ERC1155",
    "eventName": "TransferBatch",
    "from": "0xfedc ba98765432 10fedc ba987654321 0fedc ba9",
    "to": "0x9876543210fedcba9876543210fedcba98765432",
    "operator": "0xfedc ba98765432 10fedc ba987654321 0fedc ba9",
    "tokenId": "2002,2003,2004,2005",
    "value": "100,200,50,25"
  }'
```

---

## 5. ERC721 Transfer - Standard Collection

Single ERC721 token transfer.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-erc721-001",
    "blockNumber": 5843214,
    "txHash": "0x22334455667788990011223344556677889900112233445566778899001122",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0x88366612E25A9171b87393b0cF328CA46163EE86",
    "collectionName": "cosmetics721",
    "standard": "ERC721",
    "eventName": "Transfer",
    "from": "0x1111111111111111111111111111111111111111",
    "to": "0x2222222222222222222222222222222222222222",
    "operator": "0x2222222222222222222222222222222222222222",
    "tokenId": "42",
    "value": "1"
  }'
```

---

## 6. Wearables Transfer with Shop Context

Wearables transfer enriched with CatalogShop context.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-wearables-shop-001",
    "blockNumber": 5843215,
    "txHash": "0x33445566778899001122334455667788990011223344556677889900112233",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x3333333333333333333333333333333333333333",
    "to": "0x4444444444444444444444444444444444444444",
    "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
    "tokenId": "1005",
    "value": "1",
    "shopContext": {
      "contextId": "shop-001",
      "collectionId": 1,
      "collection": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
      "standard": "ERC1155",
      "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
      "from": "0x3333333333333333333333333333333333333333",
      "to": "0x4444444444444444444444444444444444444444",
      "tokenId": "1005",
      "amount": "1",
      "sourceId": "delivery-tx-001"
    }
  }'
```

---

## 7. WorldItems Transfer with Shop Context

WorldItems transfer enriched with CatalogShop context.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-worlditems-shop-001",
    "blockNumber": 5843216,
    "txHash": "0x44556677889900112233445566778899001122334455667788990011223344",
    "logIndex": 1,
    "subIndex": 0,
    "contractAddress": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
    "collectionName": "worlditems1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x5555555555555555555555555555555555555555",
    "to": "0x6666666666666666666666666666666666666666",
    "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
    "tokenId": "2010",
    "value": "25",
    "shopContext": {
      "contextId": "shop-002",
      "collectionId": 2,
      "collection": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
      "standard": "ERC1155",
      "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
      "from": "0x5555555555555555555555555555555555555555",
      "to": "0x6666666666666666666666666666666666666666",
      "tokenId": "2010",
      "amount": "25",
      "sourceId": "delivery-tx-002"
    }
  }'
```

---

## 8. ERC721 Transfer with Shop Context

ERC721 token transfer enriched with shop context (e.g., from marketplace delivery).

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-erc721-shop-001",
    "blockNumber": 5843217,
    "txHash": "0x55667788990011223344556677889900112233445566778899001122334455",
    "logIndex": 2,
    "subIndex": 0,
    "contractAddress": "0x88366612E25A9171b87393b0cF328CA46163EE86",
    "collectionName": "cosmetics721",
    "standard": "ERC721",
    "eventName": "Transfer",
    "from": "0x7777777777777777777777777777777777777777",
    "to": "0x8888888888888888888888888888888888888888",
    "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
    "tokenId": "99",
    "value": "1",
    "shopContext": {
      "contextId": "shop-003",
      "collectionId": 3,
      "collection": "0x88366612E25A9171b87393b0cF328CA46163EE86",
      "standard": "ERC721",
      "operator": "0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c",
      "from": "0x7777777777777777777777777777777777777777",
      "to": "0x8888888888888888888888888888888888888888",
      "tokenId": "99",
      "amount": "1",
      "sourceId": "delivery-tx-003"
    }
  }'
```

---

## 9. High-Value Transfer (Large Quantities)

Transfer with significant quantities to test payload handling.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-wearables-highval-001",
    "blockNumber": 5843218,
    "txHash": "0x66778899001122334455667788990011223344556677889900112233445566",
    "logIndex": 3,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x9999999999999999999999999999999999999999",
    "to": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "operator": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "tokenId": "1010",
    "value": "1000000000000000000"
  }'
```

---

## 10. Mint from Zero Address (Burn-like Reverse)

Transfer from zero address to simulate minting.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-worlditems-mint-001",
    "blockNumber": 5843219,
    "txHash": "0x77889900112233445566778899001122334455667788990011223344556677",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
    "collectionName": "worlditems1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0x0000000000000000000000000000000000000000",
    "to": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "operator": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "tokenId": "2050",
    "value": "500"
  }'
```

---

## 11. Complex Batch with Many Items

Large batch transfer with diverse token IDs and quantities.

```bash
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-wearables-complex-batch-001",
    "blockNumber": 5843220,
    "txHash": "0x88990011223344556677889900112233445566778899001122334455667788",
    "logIndex": 5,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferBatch",
    "from": "0xcccccccccccccccccccccccccccccccccccccccc",
    "to": "0xdddddddddddddddddddddddddddddddddddddddd",
    "operator": "0xcccccccccccccccccccccccccccccccccccccccc",
    "tokenId": "1100,1101,1102,1103,1104,1105",
    "value": "2,4,6,8,10,12"
  }'
```

---

## 12. Sequential SubIndex Transfers (Multiple events in one transaction)

Two transfers with different subIndex values from the same transaction.

```bash
# First transfer in transaction
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-multi-subindex-001a",
    "blockNumber": 5843221,
    "txHash": "0x99001122334455667788990011223344556677889900112233445566778899",
    "logIndex": 0,
    "subIndex": 0,
    "contractAddress": "0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314",
    "collectionName": "wearables1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "to": "0xffffffffffffffffffffffffffffffffffffffff",
    "operator": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "tokenId": "1200",
    "value": "1"
  }'

# Second transfer in same transaction (different subIndex)
curl -X POST http://127.0.0.1:3099/inject \
  -H "Content-Type: application/json" \
  -d '{
    "notificationId": "evt-multi-subindex-001b",
    "blockNumber": 5843221,
    "txHash": "0x99001122334455667788990011223344556677889900112233445566778899",
    "logIndex": 0,
    "subIndex": 1,
    "contractAddress": "0x1F57b89514A32533E85d9F9797200ab70c5479a5",
    "collectionName": "worlditems1155",
    "standard": "ERC1155",
    "eventName": "TransferSingle",
    "from": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "to": "0xffffffffffffffffffffffffffffffffffffffff",
    "operator": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "tokenId": "2100",
    "value": "10"
  }'
```

---

## Testing Webhook Delivery

After injecting events, check your webhook endpoint logs to verify:

1. **Normalized payload** receives all required fields (when `normalized` sink is enabled)
2. **Legacy payload** shape matches expected format (when `legacy` sink is enabled)
3. **Shop context** is properly formatted when included
4. **Retry logic** works if you intentionally fail the webhook

Monitor queue status via the health endpoint:

```bash
curl http://127.0.0.1:3090/health | jq .
```

Response includes:
- `pendingRetries`: Events waiting for retry
- `failedRetries`: Events that failed and are scheduled for retry
- `deadLetters`: Events that exceeded max retries

---

## Response Format

All inject requests return 202 (Accepted) on success:

```json
{
  "ok": true,
  "notificationId": "evt-wearables-001"
}
```

On validation error, returns 400 with error message:

```json
{
  "error": "missing required field: eventName"
}
```
