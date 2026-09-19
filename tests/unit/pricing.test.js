import { describe, expect, it } from 'vitest';
import { isZeroCostModel, spendSummary } from '../../src/utils/pricing';
import { createChallenge, randomSecret } from '../../src/utils/pkce';

describe('PKCE', () => {
  it('matches the RFC 7636 S256 test vector', async () => {
    expect(await createChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const secret = randomSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomSecret()).not.toBe(secret);
  });
});

describe('conservative model pricing', () => {
  it.each([undefined, {}, { prompt: '0' }, { prompt: '', completion: '0' }, { prompt: null, completion: '0' }, { prompt: false, completion: '0' }, { prompt: '-1', completion: '0' }, { prompt: 'unknown', completion: '0' }])('unknown pricing is potentially paid: %j', pricing => {
    expect(isZeroCostModel({ pricing })).toBe(false);
  });
  it.each(['image', 'image_output', 'audio', 'audio_output', 'request', 'web_search', 'input_cache_read', 'input_cache_write', 'internal_reasoning', 'future_modality'])('checks %s prices too', field => {
    expect(isZeroCostModel({ pricing: { prompt: '0', completion: '0', [field]: '0.001' } })).toBe(false);
  });
  it('permits explicit zero costs but rejects conditional overrides', () => {
    expect(isZeroCostModel({ pricing: { prompt: '0', completion: 0, image: '0.00', discount: 0, overrides: [] } })).toBe(true);
    expect(isZeroCostModel({ pricing: { prompt: '0', completion: '0', overrides: [{}] } })).toBe(false);
  });
  it('distinguishes zero, exhausted, capped, unlimited and unknown status', () => {
    expect(spendSummary({ limit: 0 })).toContain('disabled');
    expect(spendSummary({ limit: 5, limit_remaining: 0 })).toContain('reached');
    expect(spendSummary({ limit: 5, limit_remaining: 2 })).toContain('$2.00 remaining');
    expect(spendSummary({ limit: null })).toContain('no per-key spend limit');
    expect(spendSummary({})).toContain('unavailable');
  });
});
