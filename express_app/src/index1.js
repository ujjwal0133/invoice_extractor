const express = require('express');
const path = require('path');
const multer = require('multer');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const extractAmounts = require('../functions/totalsNtaxes')
// const regexfunc = require('../functions/regexForArray');
const regexfunc2 = require('../functions/regexForString');
const extractCompanyName = require('../functions/companyName');
const extractAddressBlocks = require('../functions/addresses');
// const extractInvoiceNumber = require('../functions/invoicenumber');
const extractTables = require('../functions/callingcamelot');
const extractItems = require('../functions/itemsfromtable');
const { extractLineItems, extractOtherInformationTables } = require('../functions/extractFromTable');
const cleanObject = require('../functions/resultFormat')

const app = express();
const PORT = 8000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const upload = multer({ storage: multer.memoryStorage() });

app.post('/ocr/image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let worker;

  try {
      const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(req.file.buffer),
      useSystemFonts: true,
    }).promise;

    const text2 = await pdf.getPage(1).then(page => page.getTextContent());

    let pageText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const textContent = await pdf
        .getPage(pageNum)
        .then(page => page.getTextContent());
    
      pageText += textContent.items.reduce((acc, item) => {
        return acc + item.str + (item.hasEOL ? '\n' : ' ');
      }, '');
    
      pageText += '\n\n';
    }

    let result = regexfunc2(pageText);

    console.log('==================page text====================')
    console.log(pageText);
    console.log('==================page text====================')


    // result.invoice_number = extractInvoiceNumber(text2.items);
    result.company_name = extractCompanyName(text2);
    result.vendor_name = result.company_name;
    result = extractAddressBlocks(text2.items, result);
    result = extractAmounts(pageText, result);

    //   console.log(
    //     pageText.match(/invoice[\s\S]{0,100}/i)
    // );


    const { tables : rawTables } = await extractTables(req.file);
    const itemsTable = mergeSplitTables(rawTables);

    // console.log("CAMELOT TABLES:", JSON.stringify(rawTables, null, 2));

    result.items = extractLineItems(itemsTable);
    extractOtherInformationTables(rawTables,result)
    

    // console.log(itemsTable);

    return res.json(cleanObject(result));
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process file',
      details: error.message,
    });
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
});

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

function mergeSplitTables(tables) {
  const merged = [];
  let previous = null;

  const SUMMARY_PATTERN =
    /\b(subtotal|grand\s*total|total\s*due|amount\s*due|previous\s*balance|balance|shipping|handling|insurance|service|freight|discount|tax|cgst|sgst|igst|utgst|credit|round\s*off)\b/i;

  function classifyTable(table) {
    if (!table || table.length === 0) return "UNKNOWN";

    const text = table
      .slice(0, 4)
      .flat()
      .join(" ")
      .toLowerCase();

    if (
      /qty|quantity|description|sku|unit\s*price|price|rate|line\s*total/.test(
        text
      )
    ) {
      return "ITEM";
    }

    if (
      /subtotal|grand\s*total|tax|cgst|sgst|igst|balance|amount\s*due/.test(
        text
      )
    ) {
      return "SUMMARY";
    }

    if (/bank|iban|swift|account/.test(text)) {
      return "BANK";
    }

    if (/bill\s*to|ship\s*to|customer|vendor|address/.test(text)) {
      return "ADDRESS";
    }

    return "UNKNOWN";
  }

  function looksLikeHeader(row) {
    const text = row.join(" ").toLowerCase();

    return (
      /qty|quantity/.test(text) &&
      /description|item/.test(text) &&
      /price|rate/.test(text)
    );
  }

  function firstLineNumber(table) {
    for (let i = 1; i < table.length; i++) {
      const first = (table[i][0] || "").trim();

      if (/^\d+$/.test(first)) {
        return Number(first);
      }
    }

    return null;
  }

  function lastLineNumber(table) {
    for (let i = table.length - 1; i >= 1; i--) {
      const first = (table[i][0] || "").trim();

      if (/^\d+$/.test(first)) {
        return Number(first);
      }
    }

    return null;
  }

  for (const table of tables) {
    if (!table || table.length === 0) continue;

    const type = classifyTable(table);

    if (!previous) {
      merged.push(table);

      previous = {
        type,
        table
      };

      continue;
    }

    if (type !== "ITEM" || previous.type !== "ITEM") {
      merged.push(table);

      previous = {
        type,
        table
      };

      continue;
    }

    const currentHeader = looksLikeHeader(table[0]);

    const prevLast = lastLineNumber(previous.table);
    const currFirst = firstLineNumber(table);

    const numberingContinues =
      prevLast !== null &&
      currFirst !== null &&
      currFirst === prevLast + 1;

    const summaryFound = table.some(row =>
      SUMMARY_PATTERN.test(row.join(" "))
    );

    if (summaryFound) {
      merged.push(table);

      previous = {
        type,
        table
      };

      continue;
    }

    if (currentHeader) {
      if (numberingContinues) {
        previous.table.push(...table.slice(1));
      } else {
        merged.push(table);

        previous = {
          type,
          table
        };
      }
    } else {
      if (numberingContinues) {
        previous.table.push(...table);
      } else {
        merged.push(table);

        previous = {
          type,
          table
        };
      }
    }
  }

  return merged;
}