import {mockResponse} from '../mock-api.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8'},
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/mock-recording/') && request.method === 'PUT') {
      const body = await request.arrayBuffer();
      return json({ok: true, mock: true, byteSize: body.byteLength});
    }

    if (url.pathname.startsWith('/api/')) {
      let body;
      if (request.method !== 'GET' && request.headers.get('content-type')?.includes('application/json')) {
        try {
          body = await request.json();
        } catch {
          return json({ok: false, error: 'Invalid JSON request body'}, 400);
        }
      }
      const result = mockResponse(request.method, url.pathname, body, () => {});
      return json(result.body, result.status);
    }

    return env.ASSETS.fetch(request);
  },
};
