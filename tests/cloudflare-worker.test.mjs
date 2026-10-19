import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

test('Cloudflare worker serves API JSON and SPA assets', async () => {
  const assets = {
    fetch: async () => new Response('<html>app</html>', {
      headers: {'Content-Type': 'text/html'},
    }),
  };
  const env = {ASSETS: assets};

  const apiResponse = await worker.fetch(
    new Request('https://example.test/api/student/exam/questions'),
    env,
  );
  assert.equal(apiResponse.status, 200);
  assert.equal(apiResponse.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal((await apiResponse.json()).questions.length, 10);

  const appResponse = await worker.fetch(new Request('https://example.test/exam'), env);
  assert.equal(appResponse.status, 200);
  assert.match(await appResponse.text(), /<html>app<\/html>/);
});

test('Cloudflare worker reports mock recording upload byte size', async () => {
  const response = await worker.fetch(new Request(
    'https://example.test/api/mock-recording/session/1',
    {method: 'PUT', body: new Uint8Array([1, 2, 3])},
  ), {ASSETS: {fetch: async () => new Response()}});

  assert.deepEqual(await response.json(), {ok: true, mock: true, byteSize: 3});
});
