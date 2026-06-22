import { Currency } from '../types';

// Game money is abstract: the same numbers are shown with the player's currency
// symbol — there's no exchange-rate conversion (that would unbalance prices).

const SYMBOL: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
};

// Eurozone country codes — players here default to euros; everyone else to USD.
const EUROZONE = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

// The device/browser region (e.g. "DE"), best-effort across web and native.
function regionCode(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    // Prefer a proper region from the locale; fall back to the tag's suffix.
    try {
      const region = new Intl.Locale(locale).maximize().region;
      if (region) return region.toUpperCase();
    } catch {
      /* Intl.Locale unsupported — fall through to parsing the tag */
    }
    const parts = locale.split('-');
    return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}

// The currency to use when the player hasn't chosen one: euros in the eurozone,
// dollars everywhere else.
export function detectCurrency(): Currency {
  const region = regionCode();
  return region && EUROZONE.has(region) ? 'EUR' : 'USD';
}

// Format an amount of game money with the given currency symbol, e.g. "$16,000".
export function formatMoney(amount: number, currency: Currency = 'USD'): string {
  return `${SYMBOL[currency]}${Math.round(amount).toLocaleString('en-US')}`;
}
