function isLikelyCompany(text) {
    const str = text.trim();

    if (!str) {
        return false;
    }

    if (!/[a-z]/i.test(str)) {
        return false;
    }

    if (/^[\d\s./,:-]+$/.test(str)) {
        return false;
    }

    const NON_COMPANY_PATTERNS =
        /\b(invoice|tax invoice|proforma|quotation|quote|receipt|statement|purchase order|bill|complex multi-page invoice)\b/i;

    if (NON_COMPANY_PATTERNS.test(str)) {
        return false;
    }

    return true;
}

function looksLikeCompanyHeader(text) {
    const letters = text.replace(/[^A-Za-z]/g, '');

    if (letters.length < 4) {
        return false;
    }

    const uppercaseLetters =
        letters
            .split('')
            .filter(ch => ch === ch.toUpperCase())
            .length;

    return (uppercaseLetters / letters.length) > 0.8;
}

function extractCompanyName(pdfData) {
    if (!pdfData?.items || !Array.isArray(pdfData.items)) {
        console.log("COMPANY NAME : NO DATA - items is not an array");
        return null;
    }

    const companyKeywords =
        /(ltd|limited|corp(?:oration)?s?|inc(?:orporated)?|llc|plc|co|compan(?:y|ies)|groups?|holdings?|enterprises?|industr(?:y|ies)|technolog(?:y|ies)|solutions?|private\s*limited|pvt\.?\s*ltd)/i;

    // PASS 1
    const keywordMatches = pdfData.items.filter(item => {
        const transform = item.transform;
        const text = item.str?.trim();

        return (
            transform &&
            transform.length >= 6 &&
            transform[3] > 10 &&
            text &&
            isLikelyCompany(text) &&
            companyKeywords.test(text)
        );
    });

    if (keywordMatches.length > 0) {
        keywordMatches.sort((a, b) => {

            const aHeader = looksLikeCompanyHeader(a.str);
            const bHeader = looksLikeCompanyHeader(b.str);

            if (aHeader !== bHeader) {
                return bHeader - aHeader;
            }

            if (b.transform[3] !== a.transform[3]) {
                return b.transform[3] - a.transform[3];
            }

            return b.transform[5] - a.transform[5];
        });

        console.log(`COMPANY NAME : ${keywordMatches[0].str}`);
        return keywordMatches[0].str;
    }

    // PASS 2
    const candidates = pdfData.items.filter(item => {
        const transform = item.transform;
        const text = item.str?.trim();

        return (
            transform &&
            transform.length >= 6 &&
            transform[5] >= 650 &&
            transform[3] > 10 &&
            text &&
            isLikelyCompany(text)
        );
    });

    if (candidates.length === 0) {
        console.log("COMPANY NAME : NO DATA - candidate length is 0");
        return null;
    }

    candidates.sort((a, b) => {

        const aHeader = looksLikeCompanyHeader(a.str);
        const bHeader = looksLikeCompanyHeader(b.str);

        if (aHeader !== bHeader) {
            return bHeader - aHeader;
        }

        if (b.transform[3] !== a.transform[3]) {
            return b.transform[3] - a.transform[3];
        }

        if (b.transform[5] !== a.transform[5]) {
            return b.transform[5] - a.transform[5];
        }

        return a.transform[4] - b.transform[4];
    });

    console.log(`COMPANY NAME : ${candidates[0].str}`);
    return candidates[0].str;
}

module.exports = extractCompanyName;