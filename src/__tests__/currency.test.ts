import { detectCurrency, formatMoney } from '../lib/currency';

describe('formatMoney', () => {
  it('uses the right symbol and groups thousands', () => {
    expect(formatMoney(16000, 'USD')).toBe('$16,000');
    expect(formatMoney(16000, 'EUR')).toBe('€16,000');
    expect(formatMoney(2000000000, 'USD')).toBe('$2,000,000,000');
  });

  it('rounds to whole units and defaults to USD', () => {
    expect(formatMoney(1234.6, 'EUR')).toBe('€1,235');
    expect(formatMoney(500)).toBe('$500');
  });
});

describe('detectCurrency', () => {
  it('returns a supported currency', () => {
    expect(['USD', 'EUR']).toContain(detectCurrency());
  });
});
