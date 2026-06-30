function cleanObject(obj) {
    if (Array.isArray(obj)) {
        const cleaned = obj
            .map(cleanObject)
            .filter(item => {
                if (item == null) return false;
                if (Array.isArray(item) && item.length === 0) return false;
                if (typeof item === 'object' && Object.keys(item).length === 0) return false;
                return true;
            });

        return cleaned;
    }

    if (obj && typeof obj === 'object') {
        const cleaned = {};

        for (const [key, value] of Object.entries(obj)) {
            const cleanedValue = cleanObject(value);

            const shouldRemove =
                cleanedValue === '' ||
                cleanedValue === null ||
                cleanedValue === undefined ||
                cleanedValue === 0 ||
                (Array.isArray(cleanedValue) && cleanedValue.length === 0) ||
                (typeof cleanedValue === 'object' &&
                    !Array.isArray(cleanedValue) &&
                    Object.keys(cleanedValue).length === 0);

            if (!shouldRemove) {
                cleaned[key] = cleanedValue;
            }
        }

        return cleaned;
    }

    return obj;
}

module.exports = cleanObject;