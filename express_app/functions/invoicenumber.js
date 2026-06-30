function extractInvoiceNumber(textItems) {
  const ANCHORS = [
    /\binvoice\s*#\s*/i,
    /\binvoice\s*:\s*/i,
    /\binvoice\s+(?:number|no\.?|id|code|ref|reference)\s*[:=]?\s*/i,
    /\binv\s*[#:\.]?\s*(?:number|no\.?)?\s*[:=]?\s*/i,
  ];

  const VALUE_REGEX = /^[A-Z0-9][A-Z0-9\-\/#]*$/i;

  // ── Pass 1: same-line extraction ─────────────────────────────────────────
  // Collect ALL candidate invoice numbers found inline (e.g. "INVOICE: INV-100")

  const found = [];

  for (const item of textItems) {
    const text = (item.str || '').trim();
    if (!text) continue;

    for (const rx of ANCHORS) {
      const match = text.match(rx);
      if (!match) continue;

      const remaining = text.slice(match.index + match[0].length).trim();

      if (remaining && VALUE_REGEX.test(remaining)) {
        found.push(remaining);
      }
    }
  }

  if (found.length > 0) {
    // Must contain at least one digit and be at least 3 chars
    // to avoid random words like "REF", "CODE", "DUE" etc.
    const filtered = found.filter(v => /\d/.test(v) && v.length >= 3);
    filtered.sort((a, b) => b.length - a.length); // longer = more specific
    if (filtered.length > 0) return filtered[0];
  }

  // ── Pass 2: spatial search ────────────────────────────────────────────────
  // For cases where the value is on the next line or to the right of the anchor

  const anchorItems = [];

  for (const item of textItems) {
    const text = (item.str || '').trim();
    if (!text || !item.transform) continue;

    for (const rx of ANCHORS) {
      if (rx.test(text)) {
        anchorItems.push(item);
        break;
      }
    }
  }

  for (const anchor of anchorItems) {
    const anchorX = anchor.transform[4];
    const anchorY = anchor.transform[5];

    const hasImmediateTextBelow = textItems.some(item => {
      if (item === anchor) return false;
      if (!item.transform) return false;
      if (!(item.str || '').trim()) return false;

      const x = item.transform[4];
      const y = item.transform[5];

      return (
        y < anchorY &&
        Math.abs(anchorY - y) <= 30 &&
        Math.abs(x - anchorX) < 120
      );
    });

    const candidates = textItems
      .filter(item => {
        if (item === anchor) return false;
        if (!item.transform) return false;
        if (!(item.str || '').trim()) return false;

        const x = item.transform[4];
        const y = item.transform[5];

        const belowAnchor =
          y < anchorY &&
          Math.abs(anchorY - y) < 25 &&
          Math.abs(x - anchorX) < 120;

        const rightOfAnchor =
          !hasImmediateTextBelow &&
          Math.abs(y - anchorY) < 8 &&
          x > anchorX &&
          x - anchorX < 250;

        return belowAnchor || rightOfAnchor;
      })
      .sort((a, b) => {
        const aSameLine = Math.abs(a.transform[5] - anchorY) < 8;
        const bSameLine = Math.abs(b.transform[5] - anchorY) < 8;

        if (aSameLine && !bSameLine) return -1;
        if (!aSameLine && bSameLine) return 1;

        return Math.abs(a.transform[5] - anchorY)
             - Math.abs(b.transform[5] - anchorY);
      });

    for (const item of candidates) {
      const text = (item.str || '').trim();
      if (VALUE_REGEX.test(text) && /\d/.test(text) && text.length >= 3) {
        return text;
      }
    }
  }

  return '';
}

module.exports = extractInvoiceNumber;