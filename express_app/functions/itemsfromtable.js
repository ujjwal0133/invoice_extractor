/**
 * extractLineItems.js
 *
 * Generic invoice line-item extractor.
 * Works with Camelot-style output: an array of tables,
 * where each table is a 2-D array of strings.
 *
 * Supports SAP, Oracle, QuickBooks, Zoho, Tally,
 * Microsoft Dynamics, Odoo, Xero, and others.
 */

"use strict";

// ─────────────────────────────────────────────────────────────
// 1. ALIAS DICTIONARIES
//    Add new aliases here without touching any other function.
//    IMPORTANT: put MORE SPECIFIC aliases first in each list
//    (e.g. "disc%" before "disc") so exact/prefix matching
//    hits the tightest alias before a shorter one.
// ─────────────────────────────────────────────────────────────

const COLUMN_ALIASES = {
  lineNumber: [
    "s.no", "sr.no", "sl.no", "line no", "line #", "item no", "item #",
    "line#", "s no", "sl no", "sno", "sr", "sl", "ln", "no", "#",
  ],
  sku: [
    "item code", "product code", "part number", "part no", "part#",
    "material code", "material no", "article no",
    "sku", "code", "article", "material", "reference", "ref no", "ref",
  ],
  description: [
    "item description", "product description", "service description",
    "item name", "product name",
    "description", "item", "product", "particulars", "details",
    "service", "narration", "goods", "name",
  ],
  quantity: [
    "no of units", "qty.", "quantity", "pieces", "count",
    "qty", "units", "pcs", "nos",
  ],
  unit: ["unit of measure", "uom", "u/m", "measure", "unit"],
  unitPrice: [
    "unit price", "unit cost", "unit rate", "basic price", "basic rate",
    "list price", "price/unit", "cost/unit", "per unit",
    "rate", "price", "each",
  ],
  discount: [
    "discount%", "disc%", "disc.", "discount", "disc", "rebate",
  ],
  taxRate: [
    "tax rate", "tax%", "gst%", "vat%", "cgst%", "sgst%", "igst%",
    "tds%", "cess%", "tax", "gst", "vat", "cgst", "sgst", "igst",
  ],
  taxAmount: [
    "tax amount", "tax value", "gst amount", "vat amount",
    "cgst amount", "sgst amount", "igst amount", "tax total",
  ],
  total: [
    "line total", "extended price", "extended amount",
    "net amount", "line amount", "gross amount",
    "amount", "total", "net", "value", "gross",
  ],
};

const SUMMARY_KEYWORDS = [
  "subtotal", "sub total", "sub-total",
  "tax", "taxes",
  "vat", "cgst", "sgst", "igst", "gst",
  "freight", "shipping", "shipping & handling", "shipping and handling", "handling",
  "insurance",
  "service charge", "service tax",
  "environmental fee", "environmental charge",
  "bank charge", "bank charges",
  "volume discount", "total discount", "discount",
  "previous balance", "balance forward",
  "credit applied", "credit note", "credit",
  "round off", "rounding", "round-off",
  "grand total", "total due", "amount due", "balance due",
  "net payable", "net amount payable",
  "advance paid", "advance",
  "tds", "cess",
  "other charges", "misc", "miscellaneous",
];

const TABLE_TYPE_SIGNALS = {
  ITEM: {
    // Each signal is scored by substring match against normalised cell text.
    // Require >= 2 hits AND no SUMMARY-only signals dominate.
    positiveHeaders: [
      "qty", "quantity", "description", "unit price", "rate",
      "sku", "item code", "particulars", "product",
    ],
  },
  SUMMARY: {
    positiveHeaders: [
      "subtotal", "cgst", "sgst", "igst", "vat",
      "freight", "shipping", "grand total", "total due",
      "round off", "credit applied", "previous balance",
      "insurance", "environmental fee", "volume discount",
    ],
  },
  BANK: {
    positiveHeaders: [
      "bank", "iban", "swift", "account number", "routing number",
      "sort code", "bic", "beneficiary",
    ],
  },
  ADDRESS: {
    positiveHeaders: [
      "bill to", "ship to", "vendor", "customer",
      "address", "sold to", "deliver to", "consignee", "consignor",
    ],
  },
  PAYMENT: {
    positiveHeaders: [
      "payment terms", "due date", "payment method",
      "cheque", "upi", "wire transfer", "bank transfer",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// 2. PARSERS
// ─────────────────────────────────────────────────────────────

/**
 * Parses a currency string to a float.
 * Handles: $100.00  ₹1,250.50  EUR 125.00  -$15.00  (15.00)
 */
function parseCurrency(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "N/A" || s === "—") return null;

  // Handle parenthetical negatives: (15.00) → -15.00
  const isParenNegative = /^\(.*\)$/.test(s);
  let cleaned = s
    .replace(/\(([^)]+)\)/, "-$1")  // (15.00) → -15.00
    .replace(/[^0-9.,\-]/g, "")     // strip currency symbols and letters
    .trim();

  if (!cleaned || cleaned === "-") return null;

  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount   = (cleaned.match(/\./g) || []).length;

  if (commaCount === 1 && dotCount === 0) {
    // "1,000" (thousands) or "1,50" (EU decimal) — disambiguate by fractional digits
    const parts = cleaned.split(",");
    cleaned = (parts[1].length <= 2)
      ? cleaned.replace(",", ".")  // treat as decimal separator
      : cleaned.replace(",", "");  // treat as thousands separator
  } else if (commaCount > 1 && dotCount === 0) {
    cleaned = cleaned.replace(/,/g, "");         // 1,000,000 → 1000000
  } else if (commaCount >= 1 && dotCount === 1) {
    if (cleaned.indexOf(",") < cleaned.indexOf(".")) {
      cleaned = cleaned.replace(/,/g, "");       // 1,250.50 → standard
    } else {
      cleaned = cleaned.replace(/\./g, "").replace(",", "."); // 1.250,50 → EU
    }
  } else if (commaCount === 0 && dotCount > 1) {
    cleaned = cleaned.replace(/\./g, "");        // 1.250.000 → EU thousands
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : (isParenNegative && value > 0 ? -value : value);
}

/**
 * Parses a percentage string.
 * Handles: 5%  12.5 %  18  0.18
 */
function parsePercentage(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s+/g, "");
  if (s === "" || s === "-") return null;

  const withPercent = s.endsWith("%");
  const numStr = s.replace("%", "").replace(/[^0-9.]/g, "");
  const value = parseFloat(numStr);
  if (isNaN(value)) return null;

  // If no percent sign and value is 0–1, treat as a rate and convert
  if (!withPercent && value > 0 && value <= 1) return value * 100;
  return value;
}

/**
 * Parses a quantity string.
 * Handles: 10  10.5  2 PCS  "2.00 EA"
 * Returns { value, unit }
 */
function parseQuantity(raw) {
  if (raw === null || raw === undefined) return { value: null, unit: null };
  const s = String(raw).trim();
  if (s === "" || s === "-") return { value: null, unit: null };

  const match = s.match(/^([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+)?$/);
  if (!match) return { value: null, unit: null };

  const value = parseFloat(match[1].replace(",", "."));
  const unit  = match[2] ? match[2].toUpperCase() : null;
  return { value: isNaN(value) ? null : value, unit };
}

// ─────────────────────────────────────────────────────────────
// 3. TEXT UTILITIES
// ─────────────────────────────────────────────────────────────

/**
 * Normalise text for alias comparison.
 * Collapses spaces before "%" so "Tax %" and "tax%" both become "tax%".
 * Keeps "%", "#", "/" as meaningful characters.
 */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s*%/g, "%")           // "Tax %" → "tax%", "Disc %" → "disc%"
    .replace(/[^a-z0-9%#\/]/g, " ")  // strip everything else
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(s) {
  return String(s || "").trim();
}

/** True if a cell is empty / whitespace / dash */
function isEmpty(s) {
  return /^[\s\-–—]*$/.test(String(s || ""));
}

// ─────────────────────────────────────────────────────────────
// 4. HEADER SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Score a single header cell against one logical column's alias list.
 * Aliases are checked in order — put more specific aliases first.
 * Returns 0–1.
 */
function scoreAlias(cellNorm, aliases) {
  if (!cellNorm) return 0;
  for (const alias of aliases) {
    const aNorm = normalizeText(alias);
    if (cellNorm === aNorm)                                         return 1.0; // exact
    if (cellNorm.startsWith(aNorm) || aNorm.startsWith(cellNorm))  return 0.8; // prefix
    if (cellNorm.includes(aNorm)   || aNorm.includes(cellNorm))    return 0.6; // substring
  }
  return 0;
}

/**
 * Find the best matching column index in a header row for a logical column.
 * Returns { colIndex, score }.
 */
function scoreHeader(headerRow, logicalColumn) {
  const aliases = COLUMN_ALIASES[logicalColumn];
  let best = { colIndex: -1, score: 0 };
  headerRow.forEach((cell, i) => {
    const score = scoreAlias(normalizeText(cell), aliases);
    if (score > best.score) best = { colIndex: i, score };
  });
  return best;
}

/**
 * Given a header row, produce a column mapping: { description: 2, quantity: 3, … }
 * Columns are assigned in priority order to avoid conflicts.
 * Only includes mappings with score > 0.
 */
function detectColumns(headerRow) {
  const mapping     = {};
  const usedIndices = new Set();

  // Priority order: claim the most specific/anchoring columns first
  const priority = [
    "sku", "description", "total", "unitPrice",
    "quantity", "unit", "discount", "taxRate", "taxAmount", "lineNumber",
  ];

  for (const col of priority) {
    const { colIndex, score } = scoreHeader(headerRow, col);
    if (score > 0 && !usedIndices.has(colIndex)) {
      mapping[col] = colIndex;
      usedIndices.add(colIndex);
    }
  }
  return mapping;
}

// ─────────────────────────────────────────────────────────────
// 5. TABLE CLASSIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * Collect all normalised cell texts from a 2-D table.
 */
function tableCellSet(table) {
  const cells = new Set();
  table.forEach(row =>
    row.forEach(cell => {
      const t = normalizeText(cell);
      if (t) cells.add(t);
    })
  );
  return cells;
}

/**
 * How many signal phrases from the given list appear in the cell set.
 */
function countSignalHits(cellSet, signals) {
  let hits = 0;
  for (const signal of signals) {
    const sNorm = normalizeText(signal);
    for (const cell of cellSet) {
      if (cell.includes(sNorm)) { hits++; break; }
    }
  }
  return hits;
}

/**
 * Classify a table as ITEM | SUMMARY | BANK | ADDRESS | PAYMENT | UNKNOWN.
 *
 * Decision rules:
 *  - A table that has ≥2 ITEM signals AND strictly more ITEM than SUMMARY hits → ITEM
 *  - A table that has ≥1 SUMMARY signal that beats ITEM → SUMMARY
 *  - Otherwise fall through to other types or UNKNOWN
 */
function classifyTable(table) {
  const cellSet = tableCellSet(table);

  const itemScore    = countSignalHits(cellSet, TABLE_TYPE_SIGNALS.ITEM.positiveHeaders);
  const summaryScore = countSignalHits(cellSet, TABLE_TYPE_SIGNALS.SUMMARY.positiveHeaders);

  // SUMMARY wins on any tie or if it scores higher; ITEM needs a clear majority
  if (itemScore >= 2 && itemScore > summaryScore) return "ITEM";
  if (summaryScore >= 1)                          return "SUMMARY";

  // Check remaining types
  for (const typeKey of ["BANK", "ADDRESS", "PAYMENT"]) {
    const score = countSignalHits(cellSet, TABLE_TYPE_SIGNALS[typeKey].positiveHeaders);
    if (score >= 1) return typeKey;
  }

  // Last resort: if it looks like an item table but summary score is 0
  if (itemScore >= 2) return "ITEM";

  return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────
// 6. ROW CLASSIFICATION
// ─────────────────────────────────────────────────────────────

/**
 * True if this row is a summary/totals row that must never become a line item.
 */
function isSummaryRow(row) {
  const joined = row.map(c => normalizeText(c)).join(" ");
  return SUMMARY_KEYWORDS.some(kw => {
    const kwNorm = normalizeText(kw);
    // Whole-word match to avoid false positives (e.g. "discount" inside "product description")
    return new RegExp(
      `(^|\\s)${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`
    ).test(joined);
  });
}

/**
 * True if this row looks like a repeated column header.
 */
function isHeaderRow(row) {
  const allAliasesFlat = Object.values(COLUMN_ALIASES)
    .flat()
    .map(a => normalizeText(a));

  let headerLike = 0;
  let nonEmpty   = 0;

  row.forEach(cell => {
    const t = normalizeText(cell);
    if (!t) return;
    nonEmpty++;
    if (allAliasesFlat.includes(t)) headerLike++;
  });

  return nonEmpty > 0 && headerLike / nonEmpty >= 0.5;
}

/**
 * True if the row looks like a continuation of the previous item
 * (has some description-column text but no quantity and no total).
 */
function isContinuationRow(row, colMap) {
  const qtyIdx   = colMap.quantity    ?? -1;
  const totalIdx = colMap.total       ?? -1;
  const descIdx  = colMap.description ?? -1;

  const hasQty   = qtyIdx   >= 0 && !isEmpty(row[qtyIdx]);
  const hasTotal = totalIdx >= 0 && !isEmpty(row[totalIdx]);
  const hasDesc  = descIdx  >= 0 && !isEmpty(row[descIdx]);

  if (!hasQty && !hasTotal && hasDesc) return true;

  // Row with only one non-empty cell and no anchoring numeric values
  const nonEmpty = row.filter(c => !isEmpty(c));
  if (nonEmpty.length === 1 && !hasQty && !hasTotal) return true;

  return false;
}

/** True if every cell in the row is empty. */
function isBlankRow(row) {
  return row.every(cell => isEmpty(cell));
}

// ─────────────────────────────────────────────────────────────
// 7. ROW NORMALISATION
// ─────────────────────────────────────────────────────────────

/**
 * Camelot sometimes merges two adjacent cells into one when it can't determine
 * the column boundary, joining them with a newline.  The most common pattern
 * in invoice tables is the Description column being empty while the Quantity
 * column contains:
 *
 *   "Industrial component assembly revision A with extended warranty\n2"
 *    ───────────────────────── description ────────────────────────  qty
 *
 * This function detects that pattern and returns a corrected copy of the row.
 * It only fires when:
 *   • the description cell IS empty, AND
 *   • another cell in the same row contains a newline, AND
 *   • the text after the last newline in that cell looks like a bare number
 *     (i.e. it would be a valid quantity on its own)
 *
 * We also handle the symmetric case: qty cell is empty and description cell
 * contains the merged value (rare, but seen with some PDF generators).
 */
function repairMergedCells(row, colMap) {
  const descIdx = colMap.description ?? -1;
  const qtyIdx  = colMap.quantity    ?? -1;

  if (descIdx < 0 || qtyIdx < 0) return row;   // nothing to repair

  const descCell = cellText(row[descIdx] ?? "");
  const qtyCell  = cellText(row[qtyIdx]  ?? "");

  // Case 1: description empty, qty contains "\n<number>" suffix
  if (isEmpty(descCell) && qtyCell.includes("\n")) {
    const lastNl    = qtyCell.lastIndexOf("\n");
    const afterNl   = qtyCell.slice(lastNl + 1).trim();
    const beforeNl  = qtyCell.slice(0, lastNl).trim();
    // afterNl must look like a standalone number (possibly with a unit suffix)
    if (/^[0-9]+(?:[.,][0-9]+)?(\s*[A-Za-z]+)?$/.test(afterNl) && beforeNl) {
      const repaired = [...row];
      repaired[descIdx] = beforeNl;
      repaired[qtyIdx]  = afterNl;
      return repaired;
    }
  }

  // Case 2: qty empty, description contains "\n<number>" suffix (symmetric)
  if (isEmpty(qtyCell) && descCell.includes("\n")) {
    const lastNl   = descCell.lastIndexOf("\n");
    const afterNl  = descCell.slice(lastNl + 1).trim();
    const beforeNl = descCell.slice(0, lastNl).trim();
    if (/^[0-9]+(?:[.,][0-9]+)?(\s*[A-Za-z]+)?$/.test(afterNl) && beforeNl) {
      const repaired = [...row];
      repaired[descIdx] = beforeNl;
      repaired[qtyIdx]  = afterNl;
      return repaired;
    }
  }

  return row;  // no merge detected — return original
}

/**
 * Extract a structured item object from one data row using the column map.
 * Applies cell-merge repair before reading any values.
 */
function normalizeRow(row, colMap) {
  row = repairMergedCells(row, colMap);   // ← fix Camelot merge artefacts first

  const get = (key) =>
    colMap[key] !== undefined ? cellText(row[colMap[key]] ?? "") : "";

  const rawQty = get("quantity");
  const { value: qtyVal, unit: qtyUnit } = parseQuantity(rawQty);

  const rawUnit    = get("unit");
  const unit       = rawUnit || qtyUnit || undefined;

  const rawDiscount = get("discount");
  // Discounts may be expressed as currency amounts OR percentages
  const discountNum = parseCurrency(rawDiscount) ?? parsePercentage(rawDiscount);

  const rawTaxRate   = get("taxRate");
  const taxRateNum   = parsePercentage(rawTaxRate);

  const rawTaxAmount = get("taxAmount");
  const taxAmountNum = parseCurrency(rawTaxAmount);

  return {
    lineNumber: get("lineNumber") || undefined,
    quantity:   qtyVal            ?? undefined,
    unit:       unit              || undefined,
    sku:        get("sku")        || undefined,
    description:get("description")|| undefined,
    unitPrice:  parseCurrency(get("unitPrice")) ?? undefined,
    discount:   discountNum       ?? undefined,
    taxRate:    taxRateNum        ?? undefined,
    taxAmount:  taxAmountNum      ?? undefined,
    total:      parseCurrency(get("total")) ?? undefined,
  };
}

/**
 * Remove every key whose value is undefined, null, or empty string.
 */
function cleanObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

// ─────────────────────────────────────────────────────────────
// 8. FIND HEADER ROW IN AN ITEM TABLE
// ─────────────────────────────────────────────────────────────

/**
 * Find the best header row index within the first few rows of a table.
 * Returns { headerRowIndex, colMap } or null.
 */
function findHeaderRow(table) {
  let bestScore  = 0;
  let bestResult = null;

  // Headers always appear near the top; don't scan the whole table
  const scanLimit = Math.min(table.length, 6);

  for (let i = 0; i < scanLimit; i++) {
    const row    = table[i];
    const colMap = detectColumns(row);
    const count  = Object.keys(colMap).length;

    // Require at least description AND one numeric column (price or total or qty)
    const hasNumeric = ["total", "unitPrice", "quantity"].some(k => colMap[k] !== undefined);
    if (count >= 2 && colMap.description !== undefined && hasNumeric) {
      if (count > bestScore) {
        bestScore  = count;
        bestResult = { headerRowIndex: i, colMap };
      }
    }
  }

  return bestResult;
}

// ─────────────────────────────────────────────────────────────
// 9. PARSE ONE ITEM TABLE
// ─────────────────────────────────────────────────────────────

/**
 * Parse an ITEM table into structured line items.
 *
 * @param {string[][]} table
 * @param {object|null} inheritedColMap  — column map from a previous ITEM table on a prior page
 * @returns {{ items: object[], colMap: object|null }}
 */
function parseItemTable(table, inheritedColMap) {
  const headerResult = findHeaderRow(table);

  let colMap;
  let dataStartRow;

  if (headerResult) {
    colMap       = headerResult.colMap;
    dataStartRow = headerResult.headerRowIndex + 1;
  } else if (inheritedColMap && Object.keys(inheritedColMap).length >= 2) {
    // Continuation page — no header, inherit previous mapping
    colMap       = inheritedColMap;
    dataStartRow = 0;
  } else {
    return { items: [], colMap: null };
  }

  const items  = [];
  let lastItem = null;

  for (let i = dataStartRow; i < table.length; i++) {
    const row = table[i];

    if (isBlankRow(row))       continue;
    if (isSummaryRow(row))     continue;
    if (isHeaderRow(row))      continue;  // repeated header on continuation page

    if (isContinuationRow(row, colMap)) {
      // Append extra text to the previous item's description
      if (lastItem) {
        const extra = row
          .map(c => cellText(c))
          .filter(c => !isEmpty(c))
          .join(" ")
          .trim();
        if (extra) {
          lastItem.description = lastItem.description
            ? `${lastItem.description}\n${extra}`
            : extra;
        }
      }
      continue;
    }

    const item = cleanObject(normalizeRow(row, colMap));

    // Discard rows with no meaningful data
    const meaningfulKeys = ["description", "total", "quantity", "unitPrice", "sku"];
    if (!meaningfulKeys.some(k => item[k] !== undefined)) continue;

    items.push(item);
    lastItem = item;
  }

  return { items, colMap };
}

// ─────────────────────────────────────────────────────────────
// 10. MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

/**
 * Extract line items from Camelot-style table output.
 *
 * @param {string[][][]} tables
 *   Array of tables; each table is a 2-D array of strings.
 * @returns {object[]}
 *   Array of line item objects, one per invoice line.
 */
function extractLineItems(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return [];

  const allItems     = [];
  let lastItemColMap = null;

  for (const table of tables) {
    if (!Array.isArray(table) || table.length === 0) continue;

    const tableType = classifyTable(table);

    if (tableType !== "ITEM") {
      // Non-ITEM tables break the continuation chain
      lastItemColMap = null;
      continue;
    }

    const { items, colMap } = parseItemTable(table, lastItemColMap);

    if (items.length > 0) allItems.push(...items);
    if (colMap)           lastItemColMap = colMap;
  }

  // Assign sequential line numbers where missing
  let counter = 1;
  for (const item of allItems) {
    if (!item.lineNumber) item.lineNumber = String(counter);
    counter++;
  }

  return allItems;
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  extractLineItems,
  // helpers — exported for unit testing
  classifyTable,
  detectColumns,
  scoreHeader,
  parseCurrency,
  parsePercentage,
  parseQuantity,
  repairMergedCells,
  normalizeRow,
  isSummaryRow,
  isContinuationRow,
  cleanObject,
  findHeaderRow,
  parseItemTable,
};
