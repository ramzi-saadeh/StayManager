export interface Currency {
    code: string;
    label: string;
    symbol: string;
}

export const CURRENCIES: ReadonlyArray<Currency> = [
    // Global and Major
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'EUR', label: 'Euro', symbol: '€' },
    { code: 'GBP', label: 'British Pound', symbol: '£' },
    { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
    { code: 'CHF', label: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
    { code: 'NZD', label: 'New Zealand Dollar', symbol: 'NZ$' },

    // Middle East and North Africa (MENA)
    { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
    { code: 'SAR', label: 'Saudi Riyal', symbol: 'ر.س' },
    { code: 'QAR', label: 'Qatari Riyal', symbol: 'ر.ق / QR' },
    { code: 'KWD', label: 'Kuwaiti Dinar', symbol: 'د.ك' },
    { code: 'BHD', label: 'Bahraini Dinar', symbol: '.د.ب' },
    { code: 'OMR', label: 'Omani Rial', symbol: 'ر.ع.' },
    { code: 'JOD', label: 'Jordanian Dinar', symbol: 'JD' },
    { code: 'LBP', label: 'Lebanese Pound', symbol: 'ل.ل' },
    { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£' },
    { code: 'MAD', label: 'Moroccan Dirham', symbol: 'MAD' },
    { code: 'DZD', label: 'Algerian Dinar', symbol: 'DZD' },
    { code: 'TND', label: 'Tunisian Dinar', symbol: 'DT' },
    { code: 'IQD', label: 'Iraqi Dinar', symbol: 'ع.د' },
    { code: 'SYP', label: 'Syrian Lira', symbol: 'ل.س' },
    { code: 'YER', label: 'Yemeni Rial', symbol: '﷼' },

] as const;

export const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

const CURRENCY_MAP = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Returns the Currency object for a given code, or undefined if not found. */
export function getCurrency(code: string): Currency | undefined {
    return CURRENCY_MAP.get(code);
}

/** Returns the symbol for a given currency code (e.g. 'LBP' → 'ل.ل'). Falls back to the code itself. */
export function getCurrencySymbol(code: string): string {
    return CURRENCY_MAP.get(code)?.symbol ?? code;
}

export function isCurrencyCode(code: unknown): code is string {
    return typeof code === 'string' && CURRENCY_CODES.has(code);
}

export function normalizeCurrencyCodes(input: unknown): string[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const unique: string[] = [];
    for (const value of input) {
        if (!isCurrencyCode(value) || unique.includes(value)) {
            continue;
        }
        unique.push(value);
    }

    return unique;
}
