// First-run boards. Dates are computed from today so the notes never look stale.
(function (DB) {
  'use strict';
  const { create } = DB.schema;

  function formatDate(offsetDays) {
    const date = new Date(Date.now() + offsetDays * 86400000);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function monthName(offsetDays) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-US', { month: 'long' });
  }

  function createBuilder() {
    const shapes = new Map();
    const add = (type, props) => {
      const shape = create(type, props);
      shapes.set(shape.id, shape);
      return shape.id;
    };
    const box = (type, x, y, w, h, text, props) => add(type, { x, y, w, h, text, ...props });
    const label = (x, y, text, props) => {
      const shape = DB.text.refit(create('text', { x, y, text, ...props }));
      shapes.set(shape.id, shape);
      return shape.id;
    };
    const link = (from, to, props) => add('arrow', {
      start: { id: from, side: 'auto' }, end: { id: to, side: 'auto' }, route: 'elbow', width: 1.5, stroke: 'ink', ...props,
    });
    const finish = () => {
      const doc = { shapes };
      return Array.from(shapes.values()).map((s) => (DB.geometry.isLine(s) ? DB.connectors.resolve(s, doc) : s));
    };
    return { add, box, label, link, finish };
  }

  // A closed loop with a little deliberate wobble, like a circle drawn around something in a review.
  function loopPoints(w, h) {
    const points = [];
    for (let i = 0; i <= 40; i += 1) {
      const a = (i / 40) * Math.PI * 2.08 - 2.6;
      const wobble = 1 + Math.sin(i * 0.9) * 0.018 + (i / 40) * 0.035;
      points.push([Math.round((w / 2 + (Math.cos(a) * w * wobble) / 2.1) * 100) / 100, Math.round((h / 2 + (Math.sin(a) * h * wobble) / 2.1) * 100) / 100]);
    }
    return points;
  }

  function lanes(b) {
    [['Clients', 0], ['Edge', 260], ['Services', 540], ['Data stores', 820]].forEach(([name, x]) => {
      b.box('rect', x, 0, 240, 480, '', { fill: 'none', stroke: 'graphite', width: 1, dash: 'dashed', locked: true });
      b.label(x + 14, 12, name, { stroke: 'graphite', fontSize: 14, locked: true });
    });
  }

  function architecture() {
    const b = createBuilder();
    b.label(0, -84, 'Fernway checkout: production architecture', { fontSize: 30 });
    b.label(2, -38, `Revision 7, updated ${formatDate(-2)}. Owner: platform team.`, { stroke: 'graphite', fontSize: 14 });
    lanes(b);

    const web = b.box('rect', 20, 50, 200, 60, 'Web storefront');
    const mobile = b.box('rect', 20, 140, 200, 60, 'Mobile app');
    const partner = b.box('rect', 20, 290, 200, 60, 'Partner API clients');

    const cdn = b.box('rect', 280, 50, 200, 60, 'CDN and static assets');
    const gateway = b.box('rect', 280, 140, 200, 90, 'API gateway', { fill: 'vermilionTint', stroke: 'vermilion' });
    const limit = b.box('diamond', 290, 270, 180, 100, 'Within rate limit?');
    const reject = b.box('rect', 300, 410, 160, 50, 'Reject with 429', { fill: 'stone', stroke: 'graphite' });

    const auth = b.box('rect', 560, 50, 200, 60, 'Auth service');
    const catalog = b.box('rect', 560, 140, 200, 60, 'Catalog service');
    const cart = b.box('rect', 560, 230, 200, 60, 'Cart service');
    const payments = b.box('rect', 560, 320, 200, 60, 'Payments service');
    const orders = b.box('rect', 560, 410, 200, 60, 'Orders service', { fill: 'vermilionTint', stroke: 'vermilion' });

    const identity = b.box('ellipse', 840, 50, 200, 60, 'Identity store');
    const catalogDb = b.box('ellipse', 840, 140, 200, 60, 'Catalog database');
    const session = b.box('ellipse', 840, 230, 200, 60, 'Session cache');
    const processor = b.box('rect', 840, 320, 200, 60, 'Card processor', { dash: 'dashed', stroke: 'ochre', fill: 'ochreTint' });
    const ordersDb = b.box('ellipse', 840, 410, 200, 60, 'Orders database');

    const bus = b.box('rect', 560, 520, 480, 44, 'Event bus: order.placed, payment.settled, shipment.updated', { fill: 'blueTint', stroke: 'blue', fontSize: 15 });
    const email = b.box('rect', 560, 600, 140, 56, 'Email worker');
    const fulfilment = b.box('rect', 730, 600, 140, 56, 'Fulfilment worker');
    const analytics = b.box('rect', 900, 600, 140, 56, 'Analytics sink');

    [[web, cdn], [mobile, gateway], [partner, limit], [cdn, gateway], [gateway, auth], [gateway, catalog], [gateway, cart], [gateway, orders],
      [auth, identity], [catalog, catalogDb], [cart, session], [orders, payments], [payments, processor], [orders, ordersDb]]
      .forEach(([from, to]) => b.link(from, to));
    b.link(limit, gateway, { text: 'yes', fontSize: 13 });
    b.link(limit, reject, { text: 'no', fontSize: 13 });
    b.link(orders, bus, { dash: 'dashed', stroke: 'blue', start: { id: orders, side: 's' }, end: { id: bus, side: 'n' } });
    [email, fulfilment, analytics].forEach((worker) => {
      b.link(bus, worker, { dash: 'dashed', stroke: 'blue', start: { id: bus, side: 's' }, end: { id: worker, side: 'n' } });
    });

    b.add('pen', { x: 826, y: 396, w: 228, h: 88, points: loopPoints(228, 88), stroke: 'vermilion', width: 2.5 });
    b.label(1084, 410, 'Peak write\nbottleneck', { stroke: 'vermilion', fontSize: 15 });
    b.add('arrow', { points: [[1078, 430], [1056, 430]], stroke: 'vermilion', width: 1.5 });

    b.box('sticky', 1084, 50, 170, 150, `Can catalog reads move to the session cache before the ${monthName(30)} sale?`, { fontSize: 15 });
    b.box('sticky', 1084, 230, 170, 130, 'Processor timeouts: retry twice, then hold the order.', { fontSize: 15, fill: 'blueTint' });
    b.box('sticky', 280, 520, 220, 136, `Load test on ${formatDate(9)}: hold 1,200 orders per minute with p95 under 400 ms.`, { fontSize: 15 });

    b.label(0, 524, 'Legend', { fontSize: 14, stroke: 'graphite' });
    b.add('arrow', { points: [[0, 566], [64, 566]], width: 1.5 });
    b.label(76, 556, 'Synchronous HTTP', { fontSize: 14 });
    b.add('arrow', { points: [[0, 600], [64, 600]], width: 1.5, dash: 'dashed', stroke: 'blue' });
    b.label(76, 590, 'Asynchronous event', { fontSize: 14 });
    b.box('rect', 0, 624, 64, 28, '', { dash: 'dashed', stroke: 'ochre', fill: 'ochreTint', width: 1.5 });
    b.label(76, 628, 'External vendor', { fontSize: 14 });
    return b.finish();
  }

  function phoneFrame(b, x, title) {
    b.label(x, -40, title, { fontSize: 18 });
    b.box('rect', x, 0, 280, 560, '', { width: 2 });
    b.box('rect', x, 0, 280, 52, title, { fill: 'stone', fontSize: 15 });
    b.box('rect', x + 16, 490, 248, 50, 'Continue', { fill: 'vermilionTint', stroke: 'vermilion' });
  }

  function wireframe() {
    const b = createBuilder();
    b.label(0, -110, 'Checkout wireframes, mobile', { fontSize: 28 });
    phoneFrame(b, 0, 'Cart');
    phoneFrame(b, 360, 'Shipping');
    phoneFrame(b, 720, 'Payment');

    [0, 1, 2].forEach((row) => {
      const y = 72 + row * 112;
      b.box('rect', 16, y, 72, 72, '', { fill: 'stone', width: 1 });
      b.add('line', { points: [[104, y + 14], [264, y + 14]], width: 4, stroke: 'graphite' });
      b.add('line', { points: [[104, y + 36], [210, y + 36]], width: 4, stroke: 'graphite', opacity: 0.5 });
      b.label(104, y + 48, ['$42.00', '$18.50', '$7.25'][row], { fontSize: 14 });
    });
    ['Full name', 'Street address', 'City and postal code', 'Delivery date'].forEach((field, i) => {
      b.box('rect', 376, 76 + i * 72, 248, 48, field, { fontSize: 14, stroke: 'graphite', width: 1 });
    });
    b.box('rect', 736, 76, 248, 140, 'Card preview', { fill: 'stone', stroke: 'graphite', width: 1 });
    ['Card number', 'Expiry', 'Security code'].forEach((field, i) => {
      b.box('rect', 736, 240 + i * 72, 248, 48, field, { fontSize: 14, stroke: 'graphite', width: 1 });
    });

    const shipping = b.box('sticky', 1040, 40, 190, 150, 'Saved addresses should fill the shipping form on one tap.', { fontSize: 15 });
    const payment = b.box('sticky', 1040, 240, 190, 130, `Review with design on ${formatDate(5)}.`, { fontSize: 15, fill: 'blueTint' });
    b.link(shipping, payment, { stroke: 'graphite' });
    return b.finish();
  }

  function retryPolicy() {
    const b = createBuilder();
    b.label(0, -70, 'Payment retry policy', { fontSize: 28 });
    const charge = b.box('rect', 0, 0, 200, 70, 'Charge card');
    const ok = b.box('diamond', 280, -15, 200, 100, 'Accepted?');
    const confirm = b.box('rect', 580, 0, 200, 70, 'Confirm order', { fill: 'greenTint', stroke: 'green' });
    const retryable = b.box('diamond', 280, 150, 200, 100, 'Timeout or 5xx?');
    const wait = b.box('rect', 0, 165, 200, 70, 'Wait 2s, then 8s');
    const decline = b.box('rect', 580, 165, 200, 70, 'Show decline reason', { fill: 'vermilionTint', stroke: 'vermilion' });
    const attempts = b.box('diamond', 280, 320, 200, 100, 'Attempts under 3?');
    const hold = b.box('rect', 580, 335, 200, 70, 'Hold order, page on-call', { fill: 'ochreTint', stroke: 'ochre' });
    b.link(charge, ok);
    b.link(ok, confirm, { text: 'yes', fontSize: 13 });
    b.link(ok, retryable, { text: 'no', fontSize: 13 });
    b.link(retryable, decline, { text: 'no', fontSize: 13 });
    b.link(retryable, attempts, { text: 'yes', fontSize: 13 });
    b.link(attempts, hold, { text: 'no', fontSize: 13 });
    b.link(attempts, wait, { text: 'yes', fontSize: 13, start: { id: attempts, side: 'w' }, end: { id: wait, side: 's' } });
    b.link(wait, charge);
    b.box('sticky', 860, 150, 190, 120, `Finance sign-off due ${formatDate(12)}.`, { fontSize: 15 });
    return b.finish();
  }

  // Exactly 1,000 shapes spread over a wide area, for trying pan, zoom and selection under load.
  function stressShapes() {
    const b = createBuilder();
    const kinds = ['rect', 'ellipse', 'diamond'];
    const fills = ['paper', 'stone', 'blueTint', 'greenTint', 'ochreTint', 'vermilionTint'];
    const ids = [];
    const columns = 40;
    for (let i = 0; i < 800; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      ids.push(b.box(kinds[i % 3], column * 180, row * 120, 140, 80, `node ${i + 1}`, { fill: fills[i % fills.length], fontSize: 14 }));
    }
    for (let i = 0; i < 200; i += 1) {
      const from = i * 4;
      const to = (from % columns === columns - 1) ? from + columns : from + 1;
      b.add('arrow', { start: { id: ids[from], side: 'auto' }, end: { id: ids[Math.min(to, 799)], side: 'auto' }, width: 1.5 });
    }
    return b.finish();
  }

  function boards() {
    return [
      { name: 'Fernway checkout architecture', shapes: architecture() },
      { name: 'Checkout wireframes', shapes: wireframe() },
      { name: 'Payment retry policy', shapes: retryPolicy() },
    ];
  }

  DB.seed = { boards, stressShapes };
})(window.DB);
