export const catalogShopAbi = [
  {
    type: "event",
    name: "DeliveryExecuted",
    anonymous: false,
    inputs: [
      {indexed: true, name: "contextId", type: "bytes32"},
      {indexed: true, name: "collectionId", type: "uint32"},
      {indexed: true, name: "collection", type: "address"},
      {indexed: false, name: "standard", type: "uint8"},
      {indexed: false, name: "operator", type: "address"},
      {indexed: false, name: "from", type: "address"},
      {indexed: false, name: "to", type: "address"},
      {indexed: false, name: "tokenId", type: "uint256"},
      {indexed: false, name: "amount", type: "uint256"},
      {indexed: false, name: "sourceId", type: "uint256"},
    ],
  },
] as const;
