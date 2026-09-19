// Require the schema's mandatory prices and inspect every additional charge.
// Conditional overrides and unfamiliar metadata fail closed rather than hide costs.
export function isZeroCostModel(model) {
  const pricing = model?.pricing;
  if (!pricing || !Object.hasOwn(pricing, 'prompt') || !Object.hasOwn(pricing, 'completion')) return false;
  return Object.entries(pricing).every(([field, price]) => {
    if (field === 'discount') return typeof price === 'number' && price >= 0 && price <= 1;
    if (field === 'overrides') return Array.isArray(price) && price.length === 0;
    return (typeof price === 'number' || (typeof price === 'string' && price.trim() !== '')) && Number(price) === 0;
  });
}

const units = {
  prompt: 'input token', completion: 'output token', request: 'request',
  image: 'input image', image_output: 'output image', image_token: 'image token',
  audio: 'audio input token', audio_output: 'audio output token',
  input_audio_cache: 'cached audio token', input_cache_read: 'cache read token',
  input_cache_write: 'cache write token', input_cache_write_1h: '1h cache write token',
  internal_reasoning: 'reasoning token', web_search: 'web search'
};

export function pricingSummary(model) {
  const pricing = model?.pricing;
  if (!pricing || !Object.hasOwn(pricing, 'prompt') || !Object.hasOwn(pricing, 'completion')) {
    return 'Pricing unknown; this model may charge credits.';
  }
  return Object.entries(pricing).filter(([field]) => field !== 'discount').map(([field, value]) => {
    if (field === 'overrides') return Array.isArray(value) && !value.length ? '' : 'Conditional pricing may apply; review the model page.';
    if (!units[field]) return `${field}: pricing unknown`;
    if (value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return `${field}: pricing unknown`;
    return `$${value} / ${units[field]}`;
  }).filter(Boolean).join(' · ');
}

export const money = value => typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : 'Unknown';

export function spendSummary(status) {
  if (!status) return 'Spend status unavailable. Refresh status before paid use.';
  if (status.limit === 0) return 'Paid spend disabled — key limit $0';
  if (Number.isFinite(status.limit_remaining) && status.limit_remaining <= 0) return 'Key spend limit reached';
  if (status.limit === null) return 'This key has no per-key spend limit.';
  if (Number.isFinite(status.limit) && status.limit > 0) return `Key limit: ${money(status.limit)} · ${money(status.limit_remaining)} remaining`;
  return 'Spend status unavailable. Refresh status before paid use.';
}
