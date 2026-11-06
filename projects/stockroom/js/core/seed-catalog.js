// The demo shop's range. Variant tuples: [name, sku, price, cost, opening stock, reorder point, reorder qty].
// Amounts are cents. pop is how often the item sells relative to others.
SR.seedCatalog = (function () {
  const settings = {
    shopName: 'Tallow Lane Hardware & Garden',
    address: '214 Tallow Lane, Millbrook',
    phone: '(555) 014-2277',
    taxRateBp: 825,
    floatCents: 15000,
    receiptFooter: 'Returns within 30 days with this receipt. Plants carry a 14 day guarantee.',
  };

  const suppliers = [
    { key: 'brook', name: 'Brookside Fastener Supply', contact: 'Dana Whitlow', email: 'orders@brookside-fastener.example', phone: '(555) 010-3341', leadDays: 3 },
    { key: 'north', name: 'Northgate Tool Distribution', contact: 'Sam Ostrander', email: 'sales@northgate-tools.example', phone: '(555) 010-7782', leadDays: 5 },
    { key: 'kettle', name: 'Kettlewell Paint Works', contact: 'Priya Venn', email: 'trade@kettlewell-paint.example', phone: '(555) 010-1190', leadDays: 4 },
    { key: 'marlow', name: 'Marlow Greenhouse Growers', contact: 'Tomas Reyle', email: 'wholesale@marlow-greenhouse.example', phone: '(555) 010-5526', leadDays: 2 },
    { key: 'hedge', name: 'Hedgerow Seed & Soil', contact: 'Abby Crane', email: 'orders@hedgerow-seed.example', phone: '(555) 010-9043', leadDays: 4 },
  ];

  const P = (name, category, supplier, pop, variants, taxable = true) => ({ name, category, supplier, pop, variants, taxable });

  const products = [
    P('Deck screws #8', 'Fasteners', 'brook', 6, [['1 lb box', 'FAS-DS1', 899, 412, 34, 10, 12], ['5 lb box', 'FAS-DS5', 3250, 1640, 14, 4, 6]]),
    P('Drywall screws', 'Fasteners', 'brook', 5, [['1 lb box', 'FAS-DW1', 649, 290, 30, 10, 12], ['5 lb box', 'FAS-DW5', 2499, 1210, 12, 3, 6]]),
    P('Wall anchor kit, 50 piece', 'Fasteners', 'brook', 5, [['Standard', 'FAS-WA50', 599, 235, 28, 8, 12]]),
    P('Picture hanging kit', 'Fasteners', 'brook', 4, [['Standard', 'FAS-PH1', 675, 260, 22, 6, 12]]),
    P('Hex bolts 1/4 in, 10 pack', 'Fasteners', 'brook', 3, [['1 in', 'FAS-HB1', 349, 130, 26, 8, 12], ['2 in', 'FAS-HB2', 429, 170, 24, 8, 12]]),
    P('Zip ties, 100 pack', 'Fasteners', 'brook', 4, [['Standard', 'FAS-ZT1', 499, 180, 30, 8, 12]]),

    P('Claw hammer, 16 oz', 'Tools', 'north', 3, [['Standard', 'TOL-CH16', 1895, 920, 12, 3, 6]]),
    P('Tape measure', 'Tools', 'north', 4, [['16 ft', 'TOL-TM16', 1150, 510, 16, 4, 6], ['25 ft', 'TOL-TM25', 1695, 780, 14, 4, 6]]),
    P('Utility knife', 'Tools', 'north', 4, [['Standard', 'TOL-UK1', 999, 410, 18, 5, 6]]),
    P('Screwdriver set, 6 piece', 'Tools', 'north', 3, [['Standard', 'TOL-SD6', 2100, 1025, 10, 3, 4]]),
    P('Adjustable wrench', 'Tools', 'north', 2, [['8 in', 'TOL-AW8', 1450, 660, 10, 3, 4], ['12 in', 'TOL-AW12', 2275, 1100, 7, 2, 4]]),

    P('Interior latex paint, eggshell', 'Paint', 'kettle', 5, [['Quart', 'PNT-IQ', 1999, 940, 18, 5, 6], ['Gallon', 'PNT-IG', 4600, 2420, 16, 5, 4]]),
    P('Exterior paint, satin', 'Paint', 'kettle', 3, [['Quart', 'PNT-EQ', 2250, 1090, 10, 3, 6], ['Gallon', 'PNT-EG', 5400, 2910, 10, 3, 4]]),
    P('Stain-blocking primer, gallon', 'Paint', 'kettle', 3, [['Standard', 'PNT-PR1', 3200, 1650, 9, 3, 4]]),
    P('Paint roller kit', 'Paint', 'kettle', 5, [['Standard', 'PNT-RK1', 1350, 580, 18, 5, 6]]),
    P('Angled sash brush', 'Paint', 'kettle', 4, [['2 in', 'PNT-BR2', 875, 360, 16, 5, 6], ['3 in', 'PNT-BR3', 1125, 490, 12, 4, 6]]),
    P('Painter\'s tape, 60 yd', 'Paint', 'kettle', 6, [['Standard', 'PNT-T60', 625, 275, 36, 10, 12]]),
    P('Canvas drop cloth, 9 x 12 ft', 'Paint', 'kettle', 3, [['Standard', 'PNT-DC9', 1749, 810, 10, 3, 4]]),

    P('PTFE thread tape', 'Plumbing', 'north', 5, [['Standard', 'PLB-TT1', 199, 55, 40, 10, 24]]),
    P('Faucet washer assortment', 'Plumbing', 'north', 3, [['Standard', 'PLB-FW1', 449, 140, 18, 5, 12]]),
    P('Toilet flush valve kit', 'Plumbing', 'north', 3, [['Standard', 'PLB-FV1', 1599, 775, 10, 3, 4]]),
    P('Drain snake, 25 ft', 'Plumbing', 'north', 2, [['Standard', 'PLB-DS25', 2750, 1390, 7, 2, 3]]),

    P('LED bulb A19, 2 pack', 'Electrical', 'north', 6, [['60 W equivalent', 'ELC-LED60', 799, 340, 36, 10, 12], ['100 W equivalent', 'ELC-LED100', 1099, 495, 22, 6, 12]]),
    P('Extension cord', 'Electrical', 'north', 3, [['15 ft', 'ELC-EC15', 1799, 825, 12, 3, 6], ['50 ft', 'ELC-EC50', 3950, 2040, 8, 2, 4]]),
    P('AA batteries, 8 pack', 'Electrical', 'north', 6, [['Standard', 'ELC-AA8', 949, 490, 34, 10, 12]]),
    P('Outlet tester', 'Electrical', 'north', 2, [['Standard', 'ELC-OT1', 899, 370, 9, 3, 4]]),
    P('Smoke alarm', 'Electrical', 'north', 3, [['Standard', 'ELC-SA1', 1950, 1020, 12, 4, 6]]),

    P('Golden pothos', 'Houseplants', 'marlow', 8, [['4 in pot', 'HSP-POT4', 850, 325, 24, 6, 8], ['6 in pot', 'HSP-POT6', 1600, 675, 16, 4, 6]]),
    P('Snake plant', 'Houseplants', 'marlow', 6, [['4 in pot', 'HSP-SNK4', 950, 380, 18, 5, 8], ['8 in pot', 'HSP-SNK8', 3400, 1550, 8, 2, 3]]),
    P('Monstera deliciosa', 'Houseplants', 'marlow', 6, [['6 in pot', 'HSP-MON6', 2400, 1050, 12, 3, 4], ['10 in pot', 'HSP-MON10', 5800, 2800, 5, 1, 2]]),
    P('Spider plant, 4 in pot', 'Houseplants', 'marlow', 5, [['Standard', 'HSP-SPD4', 750, 280, 16, 4, 8]]),
    P('Peace lily, 6 in pot', 'Houseplants', 'marlow', 4, [['Standard', 'HSP-PL6', 1900, 825, 10, 3, 4]]),
    P('ZZ plant, 6 in pot', 'Houseplants', 'marlow', 4, [['Standard', 'HSP-ZZ6', 2600, 1160, 9, 2, 4]]),
    P('Fiddle-leaf fig, 10 in pot', 'Houseplants', 'marlow', 2, [['Standard', 'HSP-FIG10', 7200, 3650, 4, 1, 2]]),
    P('Assorted succulent, 2.5 in pot', 'Houseplants', 'marlow', 8, [['Standard', 'HSP-SUC2', 450, 160, 40, 12, 24]]),

    P('Terracotta pot', 'Planters', 'marlow', 7, [['4 in', 'POT-TC4', 375, 135, 36, 10, 12], ['6 in', 'POT-TC6', 650, 260, 28, 8, 12], ['8 in', 'POT-TC8', 1100, 470, 18, 5, 6]]),
    P('Glazed ceramic planter', 'Planters', 'marlow', 4, [['6 in', 'POT-GC6', 1850, 800, 12, 3, 4], ['10 in', 'POT-GC10', 3600, 1675, 8, 2, 3]]),
    P('Plant saucer', 'Planters', 'marlow', 4, [['6 in', 'POT-SC6', 225, 70, 30, 8, 12], ['10 in', 'POT-SC10', 375, 125, 20, 6, 12]]),
    P('Coir hanging basket, 12 in', 'Planters', 'marlow', 2, [['Standard', 'POT-HB12', 1400, 600, 8, 2, 4]]),

    P('Potting mix', 'Garden', 'hedge', 7, [['8 qt', 'GDN-PM8', 899, 390, 30, 8, 12], ['25 qt', 'GDN-PM25', 1950, 920, 18, 5, 6]]),
    P('Leaf compost, 40 lb', 'Garden', 'hedge', 4, [['Standard', 'GDN-CP40', 925, 460, 18, 5, 10]]),
    P('Perlite, 8 qt', 'Garden', 'hedge', 3, [['Standard', 'GDN-PE8', 750, 330, 14, 4, 6]]),
    P('All-purpose fertilizer, 4 lb', 'Garden', 'hedge', 4, [['Standard', 'GDN-FZ4', 1450, 690, 14, 4, 6]]),
    P('Hand pruners', 'Garden', 'hedge', 3, [['Standard', 'GDN-HP1', 2450, 1175, 9, 3, 4]]),
    P('Bypass loppers', 'Garden', 'hedge', 2, [['Standard', 'GDN-LP1', 3200, 1575, 6, 2, 3]]),
    P('Galvanized watering can, 2 gal', 'Garden', 'hedge', 3, [['Standard', 'GDN-WC2', 1750, 790, 8, 2, 4]]),
    P('Garden hose', 'Garden', 'hedge', 3, [['50 ft', 'GDN-GH50', 3400, 1725, 9, 3, 4], ['100 ft', 'GDN-GH100', 5800, 3100, 5, 2, 3]]),
    P('Neem oil, 16 oz', 'Garden', 'hedge', 3, [['Standard', 'GDN-NO16', 1325, 610, 12, 3, 6]]),

    P('Brandywine tomato seed', 'Seeds', 'hedge', 5, [['Standard', 'SED-TOM', 349, 105, 40, 10, 24]], false),
    P('Genovese basil seed', 'Seeds', 'hedge', 4, [['Standard', 'SED-BAS', 299, 85, 32, 8, 24]], false),
    P('Sweet pea seed', 'Seeds', 'hedge', 3, [['Standard', 'SED-SWP', 325, 95, 24, 8, 24]], false),
    P('Mammoth sunflower seed', 'Seeds', 'hedge', 3, [['Standard', 'SED-SUN', 275, 80, 26, 8, 24]], false),
    P('Native wildflower mix', 'Seeds', 'hedge', 2, [['Standard', 'SED-WFM', 650, 240, 14, 4, 12]], false),
  ];

  // Likely add-ons: buying from the key category often adds an item from one of these.
  const pairings = {
    Houseplants: ['Planters', 'Garden'],
    'Planters': ['Garden', 'Houseplants'],
    Paint: ['Paint'],
    Seeds: ['Garden', 'Seeds'],
    Garden: ['Seeds', 'Planters'],
    Fasteners: ['Tools', 'Fasteners'],
    Plumbing: ['Plumbing', 'Tools'],
    Electrical: ['Electrical', 'Fasteners'],
    'Tools': ['Fasteners'],
  };

  // Stock that the demo leaves short on purpose, so the alerts have something to show on first run.
  const leftShort = ['HSP-POT4', 'POT-TC6', 'GDN-PM8', 'PNT-T60', 'ELC-AA8', 'FAS-WA50', 'HSP-MON6', 'SED-BAS', 'TOL-TM25'];

  return { settings, suppliers, products, pairings, leftShort };
})();
