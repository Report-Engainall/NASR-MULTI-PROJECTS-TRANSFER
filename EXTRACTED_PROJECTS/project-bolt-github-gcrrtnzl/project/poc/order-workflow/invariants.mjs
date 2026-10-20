import test from 'node:test';
import assert from 'node:assert/strict';

const transitions = {
  NEW: new Set(['CONFIRMED', 'CANCELLED']),
  CONFIRMED: new Set(['IN_PROGRESS', 'CANCELLED']),
  IN_PROGRESS: new Set(['PREPARED', 'CANCELLED']),
  PREPARED: new Set(['DELIVERED', 'CANCELLED']),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
};

function transition(order, next, actor) {
  if (!transitions[order.status]?.has(next)) {
    throw new Error(`INVALID_ORDER_TRANSITION:${order.status}->${next}`);
  }
  return {
    ...order,
    status: next,
    status_history: [...order.status_history, { from: order.status, to: next, actor }],
  };
}

test('valid order lifecycle advances through the canonical state machine', () => {
  let order = { status: 'NEW', status_history: [] };
  order = transition(order, 'CONFIRMED', 'sales');
  order = transition(order, 'IN_PROGRESS', 'warehouse');
  order = transition(order, 'PREPARED', 'warehouse');
  order = transition(order, 'DELIVERED', 'delivery');
  assert.equal(order.status, 'DELIVERED');
  assert.equal(order.status_history.length, 4);
});

test('cancelled orders cannot be revived or delivered', () => {
  let order = { status: 'NEW', status_history: [] };
  order = transition(order, 'CANCELLED', 'sales');
  assert.throws(() => transition(order, 'CONFIRMED', 'sales'), /INVALID_ORDER_TRANSITION/);
  assert.throws(() => transition(order, 'DELIVERED', 'delivery'), /INVALID_ORDER_TRANSITION/);
});

test('delivered orders are terminal and cannot be mutated by status replay', () => {
  let order = { status: 'NEW', status_history: [] };
  for (const next of ['CONFIRMED', 'IN_PROGRESS', 'PREPARED', 'DELIVERED']) {
    order = transition(order, next, 'authorized');
  }
  assert.throws(() => transition(order, 'CANCELLED', 'authorized'), /INVALID_ORDER_TRANSITION/);
  assert.throws(() => transition(order, 'DELIVERED', 'authorized'), /INVALID_ORDER_TRANSITION/);
});

test('invalid jumps are rejected instead of being normalized silently', () => {
  const order = { status: 'NEW', status_history: [] };
  assert.throws(() => transition(order, 'DELIVERED', 'client'), /INVALID_ORDER_TRANSITION/);
  assert.equal(order.status, 'NEW');
});
