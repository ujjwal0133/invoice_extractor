function extractAmounts(fullText, result) {
    const lines = fullText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const parseAmount = (value) => {
        if (!value) return 0;

        const num = Number(
            value
                .replace(/[₹$€£,\s]/g, '')
                .replace(/[^\d.-]/g, '')
        );

        return Number.isFinite(num) ? num : 0;
    };

    const findAmount = (patterns) => {
        for (const line of lines) {
            for (const pattern of patterns) {
                const match = line.match(pattern);

                if (match) {
                    return parseAmount(match[1]);
                }
            }
        }

        return 0;
    };

    result.subtotal = findAmount([
        /^\s*subtotal\s+(.+)$/i,
        /^\s*sub\s*total\s+(.+)$/i,
        /^\s*net\s*amount\s+(.+)$/i
    ]);

    result.discount = findAmount([
        /^\s*discount\s+(.+)$/i
    ]);

    result.shipping_charge = findAmount([
        /^\s*shipping(?:\s*&\s*handling)?\s+(.+)$/i,
        /^\s*shipping\s*charge\s+(.+)$/i,
        /^\s*delivery\s*charge\s+(.+)$/i,
        /^\s*freight\s+(.+)$/i
    ]);

    result.handling_charge = findAmount([
        /^\s*handling\s*charge\s+(.+)$/i
    ]);

    result.insurance_charge = findAmount([
        /^\s*insurance\s+(.+)$/i
    ]);

    result.service_charge = findAmount([
        /^\s*service\s*charge\s+(.+)$/i
    ]);

    result.surcharge = findAmount([
        /^\s*surcharge\s+(.+)$/i
    ]);

    result.environmental_fee = findAmount([
        /^\s*environmental\s*fee\s+(.+)$/i
    ]);

    result.round_off = findAmount([
        /^\s*round(?:ed)?\s*off\s+(.+)$/i
    ]);

    result.previous_balance = findAmount([
        /^\s*previous\s*balance\s+(.+)$/i,
        /^\s*opening\s*balance\s+(.+)$/i
    ]);

    result.advance_paid = findAmount([
        /^\s*advance\s*paid\s+(.+)$/i
    ]);

    result.tax = findAmount([
        /^\s*sales\s*tax(?:\s*\([^)]+\))?\s+(.+)$/i,
        /^\s*tax\s+(.+)$/i,
        /^\s*gst\s+(.+)$/i,
        /^\s*vat\s+(.+)$/i,
        /^\s*cgst\s+(.+)$/i,
        /^\s*sgst\s+(.+)$/i,
        /^\s*igst\s+(.+)$/i,
        /^\s*utgst\s+(.+)$/i,
        /^\s*withholding\s*tax\s+(.+)$/i,
        /^\s*tds\s+(.+)$/i
    ]);

    result.amount_paid = findAmount([
        /^\s*amount\s*paid\s+(.+)$/i,
        /^\s*paid\s+(.+)$/i
    ]);

    result.amount_due = findAmount([
        /^\s*amount\s*due\s+(.+)$/i,
        /^\s*balance\s*due\s+(.+)$/i,
        /^\s*total\s*due\s+(.+)$/i
    ]);

    result.total = findAmount([
        /^\s*total\s+(.+)$/i,
        /^\s*grand\s*total\s+(.+)$/i,
        /^\s*invoice\s*total\s+(.+)$/i,
        /^\s*total\s*amount\s+(.+)$/i,
        /^\s*amount\s*payable\s+(.+)$/i
    ]);

    return result;
}

module.exports = extractAmounts;