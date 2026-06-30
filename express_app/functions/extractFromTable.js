const COLUMN_PATTERNS = {
  quantity: /^(qty|qty\.|quantity|count|units|units\.|no|no\.)$/i,

  itemCode:
    /\b(item\s*code|sku|product\s*code|part\s*(?:number|no\.?)|code)\b/i,

  description:
    /\b(description|desc|particulars|details?)\b/i,

  unitPrice:
    /\b(unit\s*price|rate|price\/unit|each|unit\s*cost|price)\b/i,

  discount:
    /\b(discount)\b/i,

  total:
    /\b(line\s*total|extended\s*price|amount|total)\b/i
};

const SUMMARY_ROW_PATTERN =
  /\b(sub\s*total|sales?\s*tax|total\s*due|previous\s*balance|balance|tax|shipping|discount|freight|grand\s*total|amount\s*due)\b/i;

function detectItemTableColumns(headers) {
  const map = {};

  headers.forEach((header, idx) => {
    const h = (header || '').trim().toLowerCase();

    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(h) && !(field in map)) {
        map[field] = idx;
      }
    }

    if (
      /\b(item|product)\b/i.test(h) &&
      !/item\s*code|product\s*code|sku/i.test(h) &&
      map.description === undefined
    ) {
      map.description = idx;
    }
  });

  if (
    map.itemCode !== undefined &&
    map.description !== undefined &&
    map.itemCode === map.description
  ) {
    delete map.itemCode;
  }

  if (
    map.description === undefined &&
    map.itemCode !== undefined
  ) {
    map.description = map.itemCode;
    delete map.itemCode;
  }

  const hasDescription = 'description' in map;
  const hasTotal = 'total' in map;

  if (!hasDescription && !hasTotal) {
    return null;
  }

  return map;
}

function isEmptyRow(row) {
  return row.every(cell => (cell || '').trim() === '');
}

function isSummaryRow(row) {
  const firstNonEmpty =
    row.find(cell => (cell || '').trim() !== '') || '';

  return SUMMARY_ROW_PATTERN.test(firstNonEmpty.trim());
}

function parseCurrency(value) {
  if (!value) return null;

  const cleaned = value.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);

  return Number.isNaN(num) ? null : num;
}

function parseQuantity(value) {
  if (!value) return null;

  const num = parseFloat(String(value).trim());

  return Number.isNaN(num) ? null : num;
}

function cleanObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => {
      if (value === null || value === undefined) return false;
      if (value === '') return false;
      return true;
    })
  );
}

function extractLineItems(tables) {
  const allItems = [];

  let previousHeader = null;

  for (const table of tables) {
    if (!table || table.length === 0) {
      continue;
    }

    let headerRow = table[0];
    let columnMap = detectItemTableColumns(headerRow);
    let startRow = 1;

    if (columnMap) {
      previousHeader = [...headerRow];
    }

    if (!columnMap && previousHeader) {
      table.unshift([...previousHeader]);

      headerRow = table[0];
      columnMap = detectItemTableColumns(headerRow);
      startRow = 1;
    }

    if (!columnMap) {
      continue;
    }

    for (let i = startRow; i < table.length; i++) {
      const row = table[i];

      if (isEmptyRow(row)) continue;
      if (isSummaryRow(row)) continue;

      const item = {};

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'quantity') &&
        Number.isInteger(columnMap.quantity) &&
        columnMap.quantity < row.length
      ) {
        const quantity = parseQuantity(row[columnMap.quantity]);

        if (quantity !== null) {
          item.quantity = quantity;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'itemCode') &&
        columnMap.itemCode < row.length
      ) {
        const value = (row[columnMap.itemCode] || '').trim();

        if (value) {
          item.itemCode = value;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'description') &&
        columnMap.description < row.length
      ) {
        const value = (row[columnMap.description] || '').trim();

        if (value) {
          item.description = value;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'unitPrice') &&
        columnMap.unitPrice < row.length
      ) {
        const value = parseCurrency(row[columnMap.unitPrice]);

        if (value !== null) {
          item.unitPrice = value;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'discount') &&
        columnMap.discount < row.length
      ) {
        const value = (row[columnMap.discount] || '').trim();

        if (value) {
          item.discount = value;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(columnMap, 'total') &&
        columnMap.total < row.length
      ) {
        const value = parseCurrency(row[columnMap.total]);

        if (value !== null) {
          item.total = value;
        }
      }

      const cleanedItem = cleanObject(item);

      if (Object.keys(cleanedItem).length === 0) {
        continue;
      }

      const onlyTotal =
        cleanedItem.total !== undefined &&
        cleanedItem.description === undefined &&
        cleanedItem.itemCode === undefined &&
        cleanedItem.quantity === undefined &&
        cleanedItem.unitPrice === undefined;

      if (onlyTotal) {
        continue;
      }

      allItems.push(cleanedItem);
    }
  }

  return allItems;
}
function extractOtherInformationTables(tables, result) {
  const otherInformation = [];

  let previousHeader = null;

  for (const table of tables) {
    if (!table || table.length === 0) {
      continue;
    }

    let headerRow = table[0];
    let columnMap = detectItemTableColumns(headerRow);

    // Skip item tables
    if (columnMap) {
      previousHeader = [...headerRow];
      continue;
    }

    // Skip continuation tables of an item table
    if (!columnMap && previousHeader) {
      const simulated = [previousHeader, ...table];

      if (detectItemTableColumns(simulated[0])) {
        continue;
      }
    }

    // Remove empty rows and trim cells
    const cleanedRows = table
      .map(row => row.map(cell => (cell || '').trim()))
      .filter(row => !isEmptyRow(row));

    if (cleanedRows.length === 0) {
      continue;
    }

    let headers = null;
    let rows = cleanedRows;

    // Heuristic: first row is a header if most cells are non-numeric
    const firstRow = cleanedRows[0];

    const nonEmptyCells = firstRow.filter(c => c !== '');

    const textCells = nonEmptyCells.filter(cell =>
      !/^[\d.,\-/%$€£₹]+$/.test(cell)
    );

    if (
      nonEmptyCells.length >= 2 &&
      textCells.length >= Math.ceil(nonEmptyCells.length / 2)
    ) {
      headers = firstRow;
      rows = cleanedRows.slice(1);
    }

    otherInformation.push({
      type: "generic_table",
      headers,
      rows
    });
  }

  result.other_information = otherInformation;

  return result;
}

module.exports = {
  extractLineItems,
  extractOtherInformationTables
};