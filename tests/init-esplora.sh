#!/bin/bash
set -e

# Load or create the default wallet
cli -regtest createwallet default 2>/dev/null || cli -regtest loadwallet default || true

# Generate initial blocks to make coins spendable (100+ confirmations needed for coinbase)
MINER_ADDRESS=$(cli -regtest getnewaddress)
cli -regtest generatetoaddress 101 "$MINER_ADDRESS"

# Fund the test wallet's first external address (index 0)
# Derived from descriptor: wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)
# Address at index 0 on regtest: bcrt1qkn59f87tznmmjw5nu6ng8p7k6vcur2emmngn5j
RECEIVER_ADDRESS="bcrt1qkn59f87tznmmjw5nu6ng8p7k6vcur2emmngn5j"

AMOUNT=1.0
TXID=$(cli -regtest -rpcwallet=default sendtoaddress "$RECEIVER_ADDRESS" $AMOUNT)
echo "Transaction sent. TXID: $TXID"

echo "Mining 10 blocks to confirm transaction..."
cli -regtest generatetoaddress 10 "$MINER_ADDRESS"

echo "Setup complete. Funds sent to $RECEIVER_ADDRESS."
