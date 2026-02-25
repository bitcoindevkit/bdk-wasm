#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$COMPOSE_FILE"

cleanup() {
  echo "Stopping Docker services..."
  docker compose -f "$COMPOSE_FILE" down
}
trap cleanup EXIT

echo "Starting Docker services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for Esplora to be ready..."
MAX_RETRIES=60
RETRY=0
until curl -sf http://localhost:8094/regtest/api/blocks/tip/height > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "Error: Esplora did not become ready in time"
    exit 1
  fi
  echo "  Waiting... ($RETRY/$MAX_RETRIES)"
  sleep 3
done
echo "Esplora is ready."

echo "Initializing regtest environment..."
docker exec esplora-regtest bash /init-esplora.sh

# Wait for Esplora to index the new blocks
echo "Waiting for Esplora to index blocks..."
sleep 10

echo "Running regtest integration tests..."
cd "$PROJECT_ROOT/tests/node"
set +e
NETWORK=regtest ESPLORA_URL=http://localhost:8094/regtest/api yarn jest --testPathPattern='integration/esplora'
TEST_EXIT_CODE=$?
set -e

exit $TEST_EXIT_CODE
