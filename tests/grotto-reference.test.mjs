import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceUrl, verifyReference } from '../lib/grotto-reference.ts';
import { buildStudioWorkflow } from '../lib/grotto-civitai.ts';
process.env.MUSE_ARTIST_SESSION_SECRET = 'isolated-test-secret-at-least-16';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'example.test';
process.env.CIVITAI_STUDIO_PONY_DIFFUSER_AIR = 'urn:air:sdxl:checkpoint:civitai:372465@914390';
test('reference links are scoped to one image and expire', () => {
 const url = new URL(referenceUrl('image-one'));
 const expires = url.searchParams.get('expires'), signature = url.searchParams.get('signature');
 assert.equal(verifyReference('image-one', expires, signature), true);
 assert.equal(verifyReference('image-two', expires, signature), false);
 assert.equal(verifyReference('image-one', '1', signature), false);
 assert.equal(verifyReference('image-one', expires, 'x'.repeat(64)), false);
 assert.equal(verifyReference('image-one', String(Number(expires) + 1000), signature), false);
});
test('Pony remix uses the documented source-image field and denoise wire spelling', () => {
 const input = { prompt: 'garden', negativePrompt: '', quantity: 1, format: 'Portrait', referenceId: 'image-one', strength: 0.35 };
 const remix = buildStudioWorkflow(input, 'https://example.test/reference').body.steps[0].input;
 assert.equal(remix.sourceImage, 'https://example.test/reference');
 assert.equal(remix.sourceImageDenoiseStrenght, 0.35);
 const plain = buildStudioWorkflow(input).body.steps[0].input;
 assert.equal('sourceImage' in plain, false);
 assert.equal('sourceImageDenoiseStrenght' in plain, false);
});
