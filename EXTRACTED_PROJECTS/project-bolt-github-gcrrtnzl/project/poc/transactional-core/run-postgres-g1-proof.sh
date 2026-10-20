#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE

psql -v ON_ERROR_STOP=1 -f poc/transactional-core/postgres-g1-proof.sql

fail_expected() {
  if "$@" >/tmp/g1-unexpected.out 2>&1; then
    echo "Expected failure did not occur" >&2
    cat /tmp/g1-unexpected.out >&2
    exit 1
  fi
}

# 1. Client-supplied stale price must be rejected and must not mutate state.
fail_expected psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000001', 1, 1, 99.00);"
[[ "$(psql -At -c 'SELECT quantity FROM g1_poc.inventory WHERE product_id = 1')" == "1" ]]
[[ "$(psql -At -c 'SELECT count(*) FROM g1_poc.orders')" == "0" ]]

# 2. Successful order uses canonical price and server-calculated total.
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000002', 1, 1, 10.00);"
[[ "$(psql -At -c "SELECT unit_price || ':' || total FROM g1_poc.orders WHERE operation_id = '00000000-0000-0000-0000-000000000002'::uuid")" == "10.00:10.00" ]]
[[ "$(psql -At -c 'SELECT quantity FROM g1_poc.inventory WHERE product_id = 1')" == "0" ]]

# 3. Replaying the exact operation returns the original order without mutation.
replay_result=$(psql -At -c "SELECT replayed FROM g1_poc.create_order('00000000-0000-0000-0000-000000000002', 1, 1, 10.00)")
[[ "$replay_result" == "t" ]]
[[ "$(psql -At -c 'SELECT count(*) FROM g1_poc.orders')" == "1" ]]

# 4. Reusing an operation_id with a changed payload must be rejected.
fail_expected psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000002', 1, 2, 10.00);"
[[ "$(psql -At -c 'SELECT count(*) FROM g1_poc.orders')" == "1" ]]

# 5. Concurrent different operations cannot oversell one inventory row.
psql -v ON_ERROR_STOP=1 -c 'TRUNCATE g1_poc.orders RESTART IDENTITY; UPDATE g1_poc.inventory SET quantity = 1 WHERE product_id = 1;'
set +e
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000010', 1, 1, 10.00);" >/tmp/g1-concurrency-a.out 2>&1 &
pid_a=$!
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000011', 1, 1, 10.00);" >/tmp/g1-concurrency-b.out 2>&1 &
pid_b=$!
rc_a=0
wait "$pid_a" || rc_a=$?
rc_b=0
wait "$pid_b" || rc_b=$?
set -e
(( (rc_a == 0 && rc_b != 0) || (rc_a != 0 && rc_b == 0) ))
[[ "$(psql -At -c 'SELECT quantity FROM g1_poc.inventory WHERE product_id = 1')" == "0" ]]
[[ "$(psql -At -c 'SELECT count(*) FROM g1_poc.orders')" == "1" ]]

# 6. Concurrent identical operation_id requests are idempotent: one order only.
psql -v ON_ERROR_STOP=1 -c 'TRUNCATE g1_poc.orders RESTART IDENTITY; UPDATE g1_poc.inventory SET quantity = 1 WHERE product_id = 1;'
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000020', 1, 1, 10.00);" >/tmp/g1-replay-a.out 2>&1 &
pid_c=$!
psql -v ON_ERROR_STOP=1 -c "SELECT * FROM g1_poc.create_order('00000000-0000-0000-0000-000000000020', 1, 1, 10.00);" >/tmp/g1-replay-b.out 2>&1 &
pid_d=$!
wait "$pid_c"
wait "$pid_d"
[[ "$(psql -At -c 'SELECT quantity FROM g1_poc.inventory WHERE product_id = 1')" == "0" ]]
[[ "$(psql -At -c 'SELECT count(*) FROM g1_poc.orders')" == "1" ]]
replay_count=$(cat /tmp/g1-replay-a.out /tmp/g1-replay-b.out | grep -E '^[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*[0-9]+\.[0-9]{2}[[:space:]]*\|[[:space:]]*[tf][[:space:]]*$' | awk -F'|' '$3 ~ /t/ {count++} END {print count+0}')
[[ "$replay_count" == "1" ]]

echo "G1 PostgreSQL proof: PASS — atomicity, canonical pricing, server totals, idempotent replay, payload conflict, and concurrent oversell protection verified."
