export const erc721TransferAbi = [
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      {indexed: true, name: "from", type: "address"},
      {indexed: true, name: "to", type: "address"},
      {indexed: true, name: "tokenId", type: "uint256"},
    ],
  },
] as const;
