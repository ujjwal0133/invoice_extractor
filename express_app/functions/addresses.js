function extractAddressBlocks(textItems, invoice) {

  const BILLING_KEYWORDS = [
    'to',
    'billing',
    'bill to',
    'billto',
    'billing address',
    'invoice to',
    'ivoiceto',
    'customer',
    'customer address',
    'buyer',
    'sold to'
  ];

  const SHIPPING_KEYWORDS = [
    'shipping',
    'ship to',
    'shipping address',
    'deliver to',
    'delivery address',
    'consignee'
  ];

  const TERMINATORS = [
    ...BILLING_KEYWORDS,
    ...SHIPPING_KEYWORDS,

    'invoice',
    'invoice number',
    'invoice date',
    'date',
    'instructions',
    'instruction',
    'notes',
    'note',
    'remarks',
    'payment terms',

    'subtotal',
    'sales tax',
    'tax',
    'total',
    'amount due',
    'grand total',

    'description',
    'qty',
    'quantity',
    'item',
    'unit price',
    'price',
    'rate',
    'amount',

    'terms',
    'salesperson',
    'po number',
    'comments',
    'special instructions'
  ].map(x => x.toLowerCase());

  const normalize = str =>
    str
      .toLowerCase()
      .replace(/[:]/g, '')
      .trim();

  function isHeading(text) {
    const t = normalize(text);

    return TERMINATORS.some(keyword =>
      t === keyword ||
      t.startsWith(keyword)
    );
  }

  function findAnchor(keywordList) {

    for (const item of textItems) {

      const text = normalize(item.str);

      for (const keyword of keywordList) {

        if (text === keyword) {
          return item;
        }
      }
    }

    return null;
  }

  function extractBlock(anchor) {

    if (!anchor) return [];

    const anchorX = anchor.transform[4];
    const anchorY = anchor.transform[5];

    const hasImmediateTextBelow = textItems.some(item => {
      const x = item.transform[4];
      const y = item.transform[5];

      return (
        item !== anchor &&
        y < anchorY &&
        Math.abs(anchorY - y) <= 30 &&
        Math.abs(x - anchorX) < 120
      );
    });

    const candidates = textItems
      .filter(item => {

        const x = item.transform[4];
        const y = item.transform[5];

        const belowAnchor =
          y < anchorY &&
          Math.abs(x - anchorX) < 120;

        const rightOfAnchor =
          !hasImmediateTextBelow &&
          Math.abs(y - anchorY) < 8 &&
          x > anchorX;

        return (belowAnchor || rightOfAnchor) &&
          item.str.trim() !== '';
      })
      .sort((a, b) => b.transform[5] - a.transform[5]);

    const result = [];
    let previousY = null;

    for (const item of candidates) {

      const text = item.str.trim();

      if (!text) continue;

      if (
        text === anchor.str ||
        normalize(text) === normalize(anchor.str)
      ) {
        continue;
      }

      if (isHeading(text)) {
        break;
      }

      if (
        /(qty|quantity|description|unit\s*price|price|rate|amount|total)/i.test(text)
      ) {
        break;
      }

      const currentY = item.transform[5];

      if (previousY !== null) {

        const gap = Math.abs(previousY - currentY);

        if (gap > 30) {
          break;
        }
      }

      result.push(text);
      previousY = currentY;
    }

    return result;
  }

  const billingAnchor = findAnchor(BILLING_KEYWORDS);
  const shippingAnchor = findAnchor(SHIPPING_KEYWORDS);

  invoice.billing_address = extractBlock(billingAnchor);
  invoice.shipping_address = extractBlock(shippingAnchor);

  return invoice;
}

module.exports = extractAddressBlocks;