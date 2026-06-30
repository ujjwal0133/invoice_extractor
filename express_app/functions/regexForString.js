// const { company_name } = require("../InvoiceSchemas/invoiceSchema1");

function regexFromText(fullText) {

    const result = {
        // Document Info
        invoice_number: '',
        invoice_date: '',
        due_date: '',
        // purchase_order_number: '',
        quote_number: '',
        reference_number: '',
        order_number: '',
        currency: '',
        // payment_terms: '',
        notes: '',
    
        // Vendor / Seller
        vendor_name: '',
        vendor_email: '',
        vendor_phone: '',
        vendor_website: '',
        vendor_tax_id: '',
        vendor_gstin: '',
        vendor_vat_number: '',
        vendor_pan: '',
        vendor_bank_name: '',
        vendor_bank_account: '',
        vendor_ifsc: '',
        vendor_address: [],
    
        // Company (if you distinguish from vendor)
        // company_name: '',
        company_address: [],
    
        // Customer / Buyer
        customer_id: '',
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        customer_tax_id: '',
        customer_gstin: '',
        customer_vat_number: '',
        billing_address: [],
        shipping_address: [],
    
        // Shipment
        ship_to_name: '',
        shipment_date: '',
        delivery_date: '',
        tracking_number: '',
        carrier: '',
    
        // Tax Breakdown
        cgst: 0,
        sgst: 0,
        igst: 0,
        utgst: 0,
        vat: 0,
        gst: 0,
        sales_tax: 0,
        withholding_tax: 0,
        tax: 0,
    
        // Charges / Adjustments
        subtotal: 0,
        discount: 0,
        shipping_charge: 0,
        handling_charge: 0,
        freight_charge: 0,
        insurance_charge: 0,
        service_charge: 0,
        round_off: 0,
        surcharge: 0,
        previous_balance: 0,
        advance_paid: 0,
    
        // Totals
        total: 0,
        amount_paid: 0,
        amount_due: 0,
    
        // Banking / Payment
        payment_method: '',
        bank_name: '',
        account_number: '',
        iban: '',
        upi_id: '',
    
        // Metadata
        salesperson: '',
        department: '',
        project_code: '',
        contract_number: '',
    
        // Line Items
        other_information : [],
        items: [
            {
                line_number: '',
                sku: '',
                item_code: '',
                description: '',
                hs_code: '',
                quantity: 0,
                unit: '',
                unit_price: 0,
                discount: 0,
                tax_rate: 0,
                tax_amount: 0,
                amount: 0,
                total: 0
            }
        ],
    };

    const extract = (patterns) => {
        for (const pattern of patterns) {
            const match = fullText.match(pattern);
            if (match) return match[1].trim();
        }
        return null;
    };

    result.invoice_number = extract([
        /invoice\s*number\s*[:\-]?\s*([A-Z0-9\-\/#]+)/i,
        /invoice\s*no\.?\s*[:\-]?\s*([A-Z0-9\-\/#]+)/i,
        /invoice\s*#\s*[:\-]?\s*([A-Z0-9\-\/#]+)/i
    ]) || '';

    // result.invoice_date = extract([
    //     /(?<!\b(?:date|invoice\s*date)\s*[:\-]?\s*)\b(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})\b/im,
    //     /(?<!\b(?:date|invoice\s*date)\s*[:\-]?\s*\n)\b(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})\b/im
    // ]) || '';

    result.invoice_date = extract([
        /^\s*date\s*[:\-]?\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*date\s*[:\-]?\s*\n\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*invoice\s*date\s*[:\-]?\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*invoice\s*date\s*[:\-]?\s*\n\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
    
        // Standalone date (no key required)
        /\b(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})\b/
    ]) || '';

    result.customer_id = extract([
        /^\s*customer\s*id\s*[:\-]?\s*([A-Za-z0-9\/_-]+)/im,
        /^\s*customer\s*id\s*[:\-]?\s*\n\s*([A-Za-z0-9\/_-]+)/im,
        /^\s*customer\s*(?:id|number|no\.?)\s*[:\-]?\s*([A-Za-z0-9\/_-]+)/im,
        /^\s*customer\s*(?:id|number|no\.?)\s*[:\-]?\s*\n\s*([A-Za-z0-9\/_-]+)/im
      ]) || '';

    result.due_date = extract([
        /^\s*due[- ]?date\s*[:\-]?\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*due[- ]?date\s*[:\-]?\s*\n\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*payment\s*due\s*[:\-]?\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im,
        /^\s*payment\s*due\s*[:\-]?\s*\n\s*(\d{1,2}[\/.-](?:\d{1,2}|[A-Za-z]{3,})[\/.-]\d{2,4})/im
    ]) || '';

    result.customer_name = extract([
        /customer\s*name\s*[:\-]?\s*([^\n\r]+)/i,
        /client\s*name\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    result.vendor_name = extract([
        /vendor\s*name\s*[:\-]?\s*([^\n\r]+)/i,
        /supplier\s*[:\-]?\s*([^\n\r]+)/i,
        /from\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    // Document references
    // result.purchase_order_number = extract([
    //     /\b(?:purchase\s*order|po)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i
    // ]) || '';

    result.quote_number = extract([
        /\b(?:quote|quotation)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i
    ]) || '';

    result.reference_number = extract([
        /\b(?:reference|ref)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i
    ]) || '';

    result.order_number = extract([
        /\border\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-\/]+)/i
    ]) || '';


    // Currency
    result.currency = extract([
        /\bcurrency\s*[:\-]?\s*([A-Z]{3})\b/i,
        /\b(USD|EUR|GBP|INR|AUD|CAD|JPY|CNY|SGD|AED)\b/i
    ]) || '';


    // Payment terms
    // result.payment_terms = extract([
    //     /\bpayment\s*terms\s*[:\-]?\s*([^\n\r]+)/i,
    //     /\bterms\s*[:\-]?\s*([^\n\r]+)/i
    // ]) || '';


    // Notes
    result.notes = extract([
        /\bnotes?\s*[:\-]?\s*([\s\S]{1,500}?)(?:\n\s*\n|$)/i,
        /\bremarks?\s*[:\-]?\s*([\s\S]{1,500}?)(?:\n\s*\n|$)/i
    ]) || '';


// Customer GST
result.customer_gstin = extract([
    /\b(?:gst|gstin|gst\s*in|gst\s*id|gst\s*no\.?|gst\s*number|gst\s*registration(?:\s*number)?|gst\s*reg(?:istration)?(?:\s*no\.?)?|goods\s*and\s*services\s*tax(?:\s*number)?|gstin\/uin)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';


// Customer VAT
result.customer_vat_number = extract([
    /\b(?:vat|vat\s*id|vat\s*no\.?|vat\s*number|vat\s*registration(?:\s*number)?|vat\s*reg(?:istration)?(?:\s*no\.?)?)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';


// Customer PAN
result.customer_pan = extract([
    /\b(?:pan|pan\s*number|permanent\s*account\s*number)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';


// Customer CIN
result.customer_cin = extract([
    /\b(?:cin|corporate\s*identity\s*number)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';


// Customer TAN
result.customer_tan = extract([
    /\b(?:tan|tax\s*deduction\s*account\s*number)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';


// Customer Tax ID
result.customer_tax_id = extract([
    /\b(?:tax\s*id|tax\s*number|tax\s*no\.?|tax\s*registration(?:\s*number)?)\b\s*[:\-]?\s*([^\n\r|]+)/i
])?.trim() || '';

    // Shipment
    result.ship_to_name = extract([
        /\bship\s*to\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    result.shipment_date = extract([
        /\bshipment\s*date\s*[:\-]?\s*([0-9\/.\-]+)/i,
        /\bshipped\s*on\s*[:\-]?\s*([0-9\/.\-]+)/i
    ]) || '';

    result.delivery_date = extract([
        /\bdelivery\s*date\s*[:\-]?\s*([0-9\/.\-]+)/i,
        /\bdelivered\s*on\s*[:\-]?\s*([0-9\/.\-]+)/i
    ]) || '';

    result.tracking_number = extract([
        /\btracking\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';

    result.carrier = extract([
        /\bcarrier\s*[:\-]?\s*([^\n\r]+)/i,
        /\bshipping\s*carrier\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';


    // Banking
    result.payment_method = extract([
        /\bpayment\s*method\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    result.bank_name = extract([
        /\bbank\s*name\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    result.account_number = extract([
        /\baccount\s*(?:number|no\.?)\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';

    result.iban = extract([
        /\biban\s*[:\-]?\s*([A-Z0-9 ]+)/i
    ]) || '';



    result.upi_id = extract([
        /\bupi\s*(?:id)?\s*[:\-]?\s*([a-zA-Z0-9._-]+@[a-zA-Z]+)/i
    ]) || '';


    // Metadata

    result.department = extract([
        /\bdepartment\s*[:\-]?\s*([^\n\r]+)/i
    ]) || '';

    result.project_code = extract([
        /\bproject\s*(?:code|id)?\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';

    result.contract_number = extract([
        /\bcontract\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';


    // Vendor details (excluding vendor name/address)
    result.vendor_email = extract([
        /\bemail\s*[:\-]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
    ]) || '';

    result.vendor_phone = extract([
        /\b(?:phone|telephone|tel|mobile)\s*[:\-]?\s*([+\d()\-\s]{7,})/i
    ]) || '';

    result.vendor_website = extract([
        /\b(?:website|web)\s*[:\-]?\s*(https?:\/\/[^\s]+)/i,
        /\b(www\.[^\s]+)/i
    ]) || '';

    result.vendor_tax_id = extract([
        /\btax\s*id\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';

    result.vendor_gstin = extract([
        /\bgstin\s*[:\-]?\s*([0-9A-Z]{15})/i
    ]) || '';

    result.vendor_vat_number = extract([
        /\bvat\s*(?:number|no\.?)?\s*[:\-]?\s*([A-Z0-9\-]+)/i
    ]) || '';

    result.vendor_pan = extract([
        /\bpan\s*[:\-]?\s*([A-Z]{5}[0-9]{4}[A-Z])/i
    ]) || '';

    result.vendor_bank_name = result.bank_name;
    result.vendor_bank_account = result.account_number;
    result.vendor_ifsc = extract([
        /\bifsc\s*[:\-]?\s*([A-Z]{4}0[A-Z0-9]{6})/i
    ]) || '';




    return result;
}

module.exports = regexFromText;