function regexfunc(pdfTextContent) {
  const result = {
      invoice_number: '',
      invoice_date: '',
      company_address: [],
      due_date: '',
      vendor_name: '',
      customer_name: '',
      billing_address: [],
      shipping_address: [],
      subtotal: 0,
      tax: 0,
      previous_balance: 0,
      total: 0,
      items: []
  };

  const patterns = {

        invoice_number: [

            /^\s*invoice[ \t]*#[ \t]*([A-Z0-9\-\/]+)/im,
            /^\s*invoice[ \t]*(?:number|no|id|code|ref|reference)[ \t]*[:\-]?[ \t]*([A-Z0-9\-\/]+)/im,
            /^\s*inv(?:oice)?[ \t]+(?:number|no|id|code|ref)?[ \t]*[:\-#]?[ \t]*([A-Z0-9\-\/]+)/im,
            /^\s*invoice\s+(?:[a-z]+\s*){1,5}[:\-]\s*([A-Z0-9\-\/]+)/im
        ],

        invoice_date: [

            /^\s*date\s*[:\-]?\s*([0-9\/\-.]+)/im,
        
            /(?:invoice\s*date|date\s*issued|issued\s*date|bill\s*date|billing\s*date|document\s*date|posting\s*date|transaction\s*date)\s*[:\-]?\s*([0-9\/\-.]+)/i,
        
            /inv\s*date\s*[:\-]?\s*([0-9\/\-.]+)/i,
        
            /date\s+(?:[a-z]+\s*){0,4}[:\-]\s*([0-9\/\-.]+)/i
        ],

        due_date: [

            /(?:due\s*date|payment\s*due|pay\s*by|due|payment\s*deadline|payment\s*date|last\s*date\s*for\s*payment)\s*[:\-]?\s*([0-9\/\-.]+)/i,

            // catch-all
            /(?:due|payment)\s+(?:[a-z]+\s*){0,4}[:\-]\s*([0-9\/\-.]+)/i
        ],

        customer_name: [

            /(?:customer\s*name|customer|client\s*name|client|billed\s*to|bill\s*to|account\s*name|buyer|purchaser|recipient)\s*[:\-]?\s*(.+)$/i,

            // catch-all
            /(?:customer|client|buyer)\s+(?:[a-z]+\s*){0,3}[:\-]\s*(.+)$/i
        ],

        vendor_name: [

            /(?:vendor\s*name|vendor|supplier|seller|from|issued\s*by|company|company\s*name|service\s*provider|merchant|issuer)\s*[:\-]?\s*(.+)$/i,

            // catch-all
            /(?:vendor|supplier|seller|issuer)\s+(?:[a-z]+\s*){0,3}[:\-]\s*(.+)$/i
        ],

        subtotal: [

            /(?:subtotal|sub\s*total|amount\s*before\s*tax|net\s*amount|net\s*total|taxable\s*amount)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,

            // catch-all
            /(?:net|subtotal)\s+(?:[a-z]+\s*){0,3}[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
        ],

        tax: [

            /(?:tax|sales\s*tax|vat|gst|cgst|sgst|igst|service\s*tax|withholding\s*tax|tax\s*amount)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,

            // catch-all
            /tax\s+(?:[a-z]+\s*){0,3}[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
        ],

        previous_balance: [

            /(?:previous\s*balance|balance\s*forward|opening\s*balance|prior\s*balance|outstanding\s*balance|carried\s*forward)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,

            // catch-all
            /balance\s+(?:[a-z]+\s*){0,3}[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
        ],

        total: [

            /(?:total\s*due|grand\s*total|invoice\s*total|amount\s*due|total\s*amount|final\s*amount|balance\s*due|amount\s*payable|net\s*payable)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,

            /(?:total)\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,

            // catch-all
            /total\s+(?:[a-z]+\s*){0,4}[:\-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
        ]
    };

  for (const item of pdfTextContent.items) {
      const text = item.str.trim();

      if (!text) continue;

      for (const [field, regexList] of Object.entries(patterns)) {

          if (result[field] && result[field] !== 0) continue;

          for (const regex of regexList) {
              const match = text.match(regex);

              if (match) {
                  let value = match[1].trim();

                  if (
                      field === 'subtotal' ||
                      field === 'tax' ||
                      field === 'previous_balance' ||
                      field === 'total'
                  ) {
                      value = Number(
                          value.replace(/[$,]/g, '')
                      );
                  }

                  result[field] = value;
                  break;
              }
          }
      }
  }

  return result;
}

module.exports = regexfunc;
