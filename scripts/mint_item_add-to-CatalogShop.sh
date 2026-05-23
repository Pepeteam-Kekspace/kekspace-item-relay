#!/usr/bin/env bash
# mint_item_add-to-CatalogShop.sh — Mint an ERC-1155 token and add it to the CatalogShop
#
# This script has three sections:
#   1. DIRECT MINT   — owner mints the token straight to a test wallet
#   2. SET TOKEN URI  — (optional) sets on-chain metadata URI from the item JSON
#   3. SHOP LISTING  — creates a free CatalogShop listing so devs can test the full purchase flow
#
# Requirements:
#   - Foundry installed (cast)
#   - FINALOWNER_PRIVATE_KEY set to the deployer/owner private key
#   - jq installed (only needed if using ITEM_JSON)
#   - Contract addresses from your deployment output (broadcast/ or run logs)
#
# Usage:
#   export FINALOWNER_PRIVATE_KEY=0x...
#   chmod +x mint_item_add-to-CatalogShop.sh
#   ./mint_item_add-to-CatalogShop.sh

set -e

# ─── CONFIGURATION ────────────────────────────────────────────────────────────

# Deployed contract addresses (chain 763373)
WEARABLES_ADDRESS="0xC58FB9bdC4c3e6c261f815b968476C7Cd3B17314"          # Wearables1155 proxy
CATALOG_SHOP_ADDRESS="0x7A3aF05187f565Cd2e1cd01873d3580E4F08Ef7c"       # CatalogShop proxy
WEARABLES_COLLECTION_ID="1"   # First collection registered — verify with:
                              # cast call $CATALOG_SHOP_ADDRESS "registry()(address)" --rpc-url $RPC_URL
                              # then check CollectionRegistry at 0xD19f8a1E5234D4B995ED2c176CE2C0b29bB4C185

# Test wallet (finalOwner from deployment)
TEST_RECIPIENT="0x21723a6760692E405C12bC32944Aaa8B79DD7bE2"

# RPC and key
RPC_URL="https://rpc-gel-sepolia.inkonchain.com"   # Chain 763373
FINALOWNER_PRIVATE_KEY="${FINALOWNER_PRIVATE_KEY}"  # Loaded from env — never hard-code this

# Metadata base URI — token URIs are built as: METADATA_BASE_URI + filename
METADATA_BASE_URI="https://files.memetimestudios.xyz/metadata/"

# ─── ITEM PARAMETERS ─────────────────────────────────────────────────────────
# Option A: Point ITEM_JSON at an item file and TOKEN_ID + ITEM_NAME are auto-read.
#           METADATA_URI is auto-built from METADATA_BASE_URI + JSON filename.
# Option B: Leave ITEM_JSON empty and set TOKEN_ID + METADATA_URI manually.

ITEM_JSON="${ITEM_JSON:-}"              # e.g. "item_20010218.json" — optional, requires jq
METADATA_URI="${METADATA_URI:-}"        # Auto-built from ITEM_JSON filename if not set manually

TOKEN_ID="${TOKEN_ID:-}"               # Overridden by ITEM_JSON .id if ITEM_JSON is set
MINT_AMOUNT="${MINT_AMOUNT:-}"         # env var or leave empty; falls back to JSON mint_amount, then default 1
PRICE_WEI="${PRICE_WEI:-0}"            # Price in wei (0 = free). JSON uses price_eth (e.g. 0.0005) — auto-converted

# ─── PARSE ITEM JSON (if provided) ───────────────────────────────────────────

ITEM_NAME=""
ITEM_IMAGE=""

if [[ -n "$ITEM_JSON" ]]; then
  if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required when using ITEM_JSON. Install with: brew install jq"
    exit 1
  fi
  if [[ ! -f "$ITEM_JSON" ]]; then
    echo "ERROR: ITEM_JSON file not found: $ITEM_JSON"
    exit 1
  fi

  TOKEN_ID=$(jq -r '.id' "$ITEM_JSON")
  ITEM_NAME=$(jq -r '.name' "$ITEM_JSON")
  ITEM_IMAGE=$(jq -r '.image // empty' "$ITEM_JSON")

  # Auto-build METADATA_URI from base + JSON filename if not already set
  if [[ -z "$METADATA_URI" ]]; then
    JSON_FILENAME=$(basename "$ITEM_JSON")
    METADATA_URI="${METADATA_BASE_URI}${JSON_FILENAME}"
  fi

  echo ""
  echo "Loaded item from $ITEM_JSON:"
  echo "  Name:     $ITEM_NAME"
  echo "  Token ID: $TOKEN_ID"
  echo "  URI:      $METADATA_URI"
  if [[ -n "$ITEM_IMAGE" ]]; then
    echo "  Image:    $ITEM_IMAGE"
  fi

  # Show attributes if present
  ATTR_COUNT=$(jq '.attributes | length' "$ITEM_JSON" 2>/dev/null || echo "0")
  if [[ "$ATTR_COUNT" -gt 0 ]]; then
    echo "  Attributes:"
    jq -r '.attributes[] | "    \(.trait_type): \(.value)"' "$ITEM_JSON"
  fi

  # Resolve MINT_AMOUNT: env var vs JSON mint_amount field
  JSON_MINT_AMOUNT=$(jq -r '.mint_amount // empty' "$ITEM_JSON")

  if [[ -n "$MINT_AMOUNT" && -n "$JSON_MINT_AMOUNT" && "$MINT_AMOUNT" != "$JSON_MINT_AMOUNT" ]]; then
    echo ""
    echo "MINT_AMOUNT conflict detected:"
    echo "  [1] Environment variable: $MINT_AMOUNT"
    echo "  [2] JSON file (mint_amount): $JSON_MINT_AMOUNT"
    echo "  [3] Enter a custom value"
    read -rp "Choose [1/2/3]: " MINT_CHOICE </dev/tty
    case "$MINT_CHOICE" in
      2) MINT_AMOUNT="$JSON_MINT_AMOUNT" ;;
      3) read -rp "Enter mint amount: " MINT_AMOUNT </dev/tty ;;
      *) ;; # keep env var value (default)
    esac
  elif [[ -z "$MINT_AMOUNT" && -n "$JSON_MINT_AMOUNT" ]]; then
    MINT_AMOUNT="$JSON_MINT_AMOUNT"
    echo "  Mint amount: $MINT_AMOUNT (from JSON)"
  elif [[ -n "$MINT_AMOUNT" ]]; then
    echo "  Mint amount: $MINT_AMOUNT (from env)"
  fi

  # Resolve price: JSON uses price_eth (human-friendly), converted to wei
  JSON_PRICE_ETH=$(jq -r '.price_eth // empty' "$ITEM_JSON")

  if [[ -n "$JSON_PRICE_ETH" ]]; then
    JSON_PRICE_WEI=$(cast to-wei "$JSON_PRICE_ETH" ether 2>/dev/null || echo "")
    if [[ -z "$JSON_PRICE_WEI" ]]; then
      echo "  WARNING: Failed to convert price_eth=$JSON_PRICE_ETH to wei, ignoring"
    elif [[ "$PRICE_WEI" != "0" && "$PRICE_WEI" != "$JSON_PRICE_WEI" ]]; then
      echo ""
      echo "Price conflict detected:"
      echo "  [1] Environment variable: $PRICE_WEI wei"
      echo "  [2] JSON file (price_eth): $JSON_PRICE_ETH ETH ($JSON_PRICE_WEI wei)"
      echo "  [3] Enter a custom value"
      read -rp "Choose [1/2/3]: " PRICE_CHOICE </dev/tty
      case "$PRICE_CHOICE" in
        2) PRICE_WEI="$JSON_PRICE_WEI" ;;
        3) read -rp "Enter price in wei (0 = free): " PRICE_WEI </dev/tty ;;
        *) ;; # keep env var value (default)
      esac
    elif [[ "$PRICE_WEI" == "0" ]]; then
      PRICE_WEI="$JSON_PRICE_WEI"
      echo "  Price:       $JSON_PRICE_ETH ETH ($PRICE_WEI wei, from JSON)"
    fi
  elif [[ "$PRICE_WEI" != "0" ]]; then
    echo "  Price:       $PRICE_WEI wei (from env)"
  else
    echo "  Price:       free"
  fi
fi

# Default MINT_AMOUNT if still unset
if [[ -z "$MINT_AMOUNT" ]]; then
  MINT_AMOUNT=1
fi

# ─── GUARD ────────────────────────────────────────────────────────────────────

if [[ -z "$FINALOWNER_PRIVATE_KEY" ]]; then
  echo "ERROR: FINALOWNER_PRIVATE_KEY env var is not set"
  exit 1
fi

if [[ -z "$TOKEN_ID" ]]; then
  echo "ERROR: TOKEN_ID is not set. Either set ITEM_JSON or TOKEN_ID manually."
  exit 1
fi

if [[ -z "$WEARABLES_ADDRESS" || -z "$CATALOG_SHOP_ADDRESS" || -z "$WEARABLES_COLLECTION_ID" || -z "$TEST_RECIPIENT" ]]; then
  echo "ERROR: Fill in WEARABLES_ADDRESS, CATALOG_SHOP_ADDRESS, WEARABLES_COLLECTION_ID, and TEST_RECIPIENT above"
  exit 1
fi

DISPLAY_NAME="${ITEM_NAME:-token $TOKEN_ID}"

# ─── SECTION 1: DIRECT MINT ───────────────────────────────────────────────────
# Mints the token directly to TEST_RECIPIENT from the Wearables1155 collection.
# The caller must hold MINTER_ROLE or be the owner.

echo ""
echo "=== Section 1: Direct Mint ==="

EXISTING_BALANCE=$(cast call "$WEARABLES_ADDRESS" \
  "balanceOf(address,uint256)(uint256)" \
  "$TEST_RECIPIENT" \
  "$TOKEN_ID" \
  --rpc-url "$RPC_URL" 2>/dev/null || echo "0")

RUN_MINT=true
if [[ "$EXISTING_BALANCE" -gt 0 ]]; then
  echo "Token $TOKEN_ID already exists for $TEST_RECIPIENT"
  echo "  Current balance: $EXISTING_BALANCE"
  echo "  New mint amount: $MINT_AMOUNT"
  echo "  Balance after:   $((EXISTING_BALANCE + MINT_AMOUNT))"
  read -rp "Mint $MINT_AMOUNT more? [y/N]: " MINT_CONFIRM </dev/tty
  if [[ "$MINT_CONFIRM" != "y" && "$MINT_CONFIRM" != "Y" ]]; then
    echo "Skipping mint."
    RUN_MINT=false
  fi
fi

if [[ "$RUN_MINT" == "true" ]]; then
  echo "Minting $DISPLAY_NAME (ID $TOKEN_ID) × $MINT_AMOUNT to $TEST_RECIPIENT..."

  cast send "$WEARABLES_ADDRESS" \
    "mint(address,uint256,uint256)" \
    "$TEST_RECIPIENT" \
    "$TOKEN_ID" \
    "$MINT_AMOUNT" \
    --private-key "$FINALOWNER_PRIVATE_KEY" \
    --rpc-url "$RPC_URL"

  echo "Direct mint submitted. Waiting for RPC to settle..."
  sleep 5

  echo "Check balance:"
  cast call "$WEARABLES_ADDRESS" \
    "balanceOf(address,uint256)(uint256)" \
    "$TEST_RECIPIENT" \
    "$TOKEN_ID" \
    --rpc-url "$RPC_URL"
fi

# ─── SECTION 2: SET TOKEN URI ─────────────────────────────────────────────────
# Sets on-chain metadata URI for this token. Requires MANAGER_ROLE or owner.
# Auto-built from METADATA_BASE_URI + JSON filename when using ITEM_JSON.
# Skipped if no METADATA_URI is configured.
# The collection's uri() function checks per-token URIs first, then falls back
# to baseURI + tokenId + ".json".

echo ""
echo "=== Section 2: Set Token URI ==="

if [[ -n "$METADATA_URI" ]]; then
  EXISTING_URI=$(cast call "$WEARABLES_ADDRESS" \
    "uri(uint256)(string)" \
    "$TOKEN_ID" \
    --rpc-url "$RPC_URL" 2>/dev/null || echo "")

  RUN_URI=true
  if [[ -n "$EXISTING_URI" && "$EXISTING_URI" != "\"\"" && "$EXISTING_URI" != "$METADATA_URI" ]]; then
    # Strip surrounding quotes from cast output for clean comparison
    CLEAN_EXISTING=$(echo "$EXISTING_URI" | tr -d '"')
    CLEAN_NEW=$(echo "$METADATA_URI" | tr -d '"')

    if [[ "$CLEAN_EXISTING" != "$CLEAN_NEW" ]]; then
      echo "Token $TOKEN_ID already has a URI set:"
      echo "  Current: $CLEAN_EXISTING"
      echo "  New:     $CLEAN_NEW"
      read -rp "Overwrite existing URI? [y/N]: " URI_CONFIRM </dev/tty
      if [[ "$URI_CONFIRM" != "y" && "$URI_CONFIRM" != "Y" ]]; then
        echo "Skipping URI update."
        RUN_URI=false
      fi
    fi
  fi

  if [[ "$RUN_URI" == "true" ]]; then
    echo "Setting metadata URI for token $TOKEN_ID..."
    echo "  URI: $METADATA_URI"

    sleep 5

    cast send "$WEARABLES_ADDRESS" \
      "setTokenURI(uint256,string)" \
      "$TOKEN_ID" \
      "$METADATA_URI" \
      --private-key "$FINALOWNER_PRIVATE_KEY" \
      --rpc-url "$RPC_URL"

    echo "Token URI set. Waiting for RPC to settle..."
    sleep 5

    echo "Verify on-chain URI:"
    cast call "$WEARABLES_ADDRESS" \
      "uri(uint256)(string)" \
      "$TOKEN_ID" \
      --rpc-url "$RPC_URL"
  fi
else
  echo "Skipped (no METADATA_URI configured)"
  echo "  To set a per-token URI later:"
  echo "  cast send $WEARABLES_ADDRESS \"setTokenURI(uint256,string)\" $TOKEN_ID \"https://your-host/metadata/$TOKEN_ID.json\" --private-key \$FINALOWNER_PRIVATE_KEY --rpc-url $RPC_URL"
fi

# ─── SECTION 3: SHOP LISTING ──────────────────────────────────────────────────
# Creates a free CatalogShop listing so developers can test the full purchase
# flow end-to-end (shop -> adapter -> mint -> webhook).
#
# ListingConfig tuple: (active, startsAt, endsAt, maxPerWallet, maxTotalSales, sold, payoutGroupId)
#   active=true, no time window, no wallet limit, no total cap, sold=0, payout to treasury (0)
#
# ListingLine tuple:   (collectionId, tokenId, amountPerUnit, deliveryMode, adapterData)
#   collectionId = WEARABLES_COLLECTION_ID (from registry)
#   tokenId      = TOKEN_ID
#   amountPerUnit= 1
#   deliveryMode = 0  (Mint — adapter mints fresh tokens on each purchase)
#   adapterData  = 0x (empty)
#
# After listing creation, ETH payment is configured at price=0 (free).

echo ""
echo "=== Section 3: Create Shop Listing ==="

# Check for existing listings that reference this token
NEXT_ID=$(cast call "$CATALOG_SHOP_ADDRESS" \
  "nextListingId()(uint256)" \
  --rpc-url "$RPC_URL" 2>/dev/null || echo "1")

EXISTING_COUNT=$((NEXT_ID - 1))
RUN_LISTING=true

if [[ "$EXISTING_COUNT" -gt 0 ]]; then
  echo "CatalogShop already has $EXISTING_COUNT listing(s)."
  echo "  Scanning for token $TOKEN_ID..."

  FOUND_LISTINGS=""
  for (( i=1; i<=EXISTING_COUNT; i++ )); do
    LINES_OUTPUT=$(cast call "$CATALOG_SHOP_ADDRESS" \
      "getListingLines(uint256)((uint32,uint256,uint256,uint8,bytes)[])" \
      "$i" \
      --rpc-url "$RPC_URL" 2>/dev/null || echo "")
    if echo "$LINES_OUTPUT" | grep -q "$TOKEN_ID"; then
      FOUND_LISTINGS="${FOUND_LISTINGS} ${i}"
    fi
  done

  if [[ -n "$FOUND_LISTINGS" ]]; then
    echo "  Token $TOKEN_ID already exists in listing(s):$FOUND_LISTINGS"
    echo "  New listing will create: listing $NEXT_ID (collectionId=$WEARABLES_COLLECTION_ID, tokenId=$TOKEN_ID, deliveryMode=Mint, free)"
    read -rp "Create another listing for this token? [y/N]: " LISTING_CONFIRM </dev/tty
    if [[ "$LISTING_CONFIRM" != "y" && "$LISTING_CONFIRM" != "Y" ]]; then
      echo "Skipping listing creation."
      RUN_LISTING=false
      LISTING_ID="${FOUND_LISTINGS## }"  # use first existing listing ID
      LISTING_ID="${LISTING_ID%% *}"
    fi
  fi
fi

if [[ "$RUN_LISTING" == "true" ]]; then
  echo "Creating free listing for $DISPLAY_NAME (ID $TOKEN_ID) in CatalogShop..."

  sleep 5

  cast send "$CATALOG_SHOP_ADDRESS" \
    "createListing((bool,uint64,uint64,uint64,uint64,uint64,uint32),(uint32,uint256,uint256,uint8,bytes)[])" \
    "(true,0,0,0,0,0,0)" \
    "[(${WEARABLES_COLLECTION_ID},${TOKEN_ID},1,0,0x)]" \
    --private-key "$FINALOWNER_PRIVATE_KEY" \
    --rpc-url "$RPC_URL"

  echo "Listing created. Waiting for RPC to settle..."
  sleep 5

  NEXT_ID=$(cast call "$CATALOG_SHOP_ADDRESS" \
    "nextListingId()(uint256)" \
    --rpc-url "$RPC_URL")

  LISTING_ID=$((NEXT_ID - 1))
  echo "Listing created with ID: $LISTING_ID"
fi

# ─── CONFIGURE ETH PAYMENT ────────────────────────────────────────────────────
# Uses PRICE_WEI (default 0 = free). Only runs if a new listing was created.

if [[ "$RUN_LISTING" == "true" ]]; then
  if [[ "$PRICE_WEI" == "0" ]]; then
    PRICE_LABEL="free"
  else
    PRICE_LABEL="${PRICE_WEI} wei"
  fi

  echo ""
  echo "Configuring ETH payment for listing $LISTING_ID (${PRICE_LABEL})..."

  sleep 5

  cast send "$CATALOG_SHOP_ADDRESS" \
    "configureETHPayment(uint256,bool,uint256)" \
    "$LISTING_ID" \
    "true" \
    "$PRICE_WEI" \
    --private-key "$FINALOWNER_PRIVATE_KEY" \
    --rpc-url "$RPC_URL"
fi

echo ""
echo "=== Done ==="
echo "$DISPLAY_NAME (token $TOKEN_ID) is now available:"
echo "  - Quantity minted:       $MINT_AMOUNT"
echo "  - Direct mint sent to:   $TEST_RECIPIENT"
echo "  - Token URI:             ${METADATA_URI:-(not set)}"
if [[ "$PRICE_WEI" == "0" ]]; then
  echo "  - Shop listing ID:       $LISTING_ID  (free, any wallet can purchase)"
else
  echo "  - Shop listing ID:       $LISTING_ID  (price: $PRICE_WEI wei)"
fi
echo ""
echo "To test a purchase from a different wallet:"
echo "  cast send $CATALOG_SHOP_ADDRESS \"purchaseWithETH(uint256,uint256)\" $LISTING_ID 1 --value $PRICE_WEI --private-key <BUYER_KEY> --rpc-url $RPC_URL"
