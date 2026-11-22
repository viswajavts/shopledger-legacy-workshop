const assert = require('node:assert/strict');
const test = require('node:test');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

test('a quantity below sellable stock can be committed', () => {
  const product = { id: 1, name: 'Rice', stock: 5, reserved: 2 };
  const items = [{ id: 1, qty: 2 }];

  assert.deepEqual(inventory.check([product], items), { ok: true });
  inventory.reserve([product], items);

  assert.equal(product.stock, 3);
  assert.equal(product.reserved, 2);
  assert.equal(inventory.getSellableStock(product), 1);
});

test('a quantity above sellable stock is rejected even if physical stock covers it', () => {
  const product = { id: 1, name: 'Rice', stock: 5, reserved: 2 };

  assert.deepEqual(inventory.check([product], [{ id: 1, qty: 4 }]), {
    ok: false,
    msg: 'Rice is out of stock (3 sellable available)',
  });
});

test('the last sellable unit can be sold without consuming reserved stock', () => {
  const product = { id: 1, name: 'Rice', stock: 3, reserved: 2 };
  const items = [{ id: 1, qty: 1 }];

  assert.deepEqual(inventory.check([product], items), { ok: true });
  inventory.reserve([product], items);

  assert.equal(product.stock, 2);
  assert.equal(product.reserved, 2);
  assert.equal(inventory.getSellableStock(product), 0);
  assert.equal(inventory.check([product], items).ok, false);
});

test('multiple lines for the same product cannot consume reserved stock', () => {
  const product = { id: 1, name: 'Rice', stock: 5, reserved: 2 };
  const items = [{ id: 1, qty: 2 }, { id: '1', qty: 2 }];

  assert.equal(inventory.check([product], [items[0]]).ok, true);
  assert.equal(inventory.check([product], [items[1]]).ok, true);
  assert.equal(inventory.check([product], items).ok, false);
});

test('cancelling a placed order restores physical stock exactly once', () => {
  const product = { id: 1, name: 'Rice', stock: 5, reserved: 2 };
  const db = { products: [product], orders: [], nextOrderId: 1001 };
  const items = [{ id: 1, qty: 2 }];

  inventory.reserve(db.products, items);
  const order = orders.add(db, { items });

  const cancellation = orders.cancel(db, order.id, 'Customer requested');
  assert.deepEqual(cancellation, { ok: true, order });
  assert.equal(order.status, 'cancelled');
  assert.equal(order.cancelReason, 'Customer requested');
  assert.match(order.cancelledAt, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(product.stock, 5);
  assert.equal(product.reserved, 2);
  assert.equal(inventory.getSellableStock(product), 3);
  assert.equal(orders.cancel(db, order.id).ok, false);
  assert.equal(product.stock, 5);
});

test('release restores physical stock for order lines without changing reservations', () => {
  const product = { id: 1, name: 'Rice', stock: 3, reserved: 2 };

  inventory.release([product], [{ id: 1, qty: 1 }]);

  assert.equal(product.stock, 4);
  assert.equal(product.reserved, 2);
});
