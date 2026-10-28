// Offline tests for hono-ai-chatbot. They run real Hono apps through
// app.request(), so no server or network is needed.
//
//   node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import { stream } from 'hono/streaming';

import aiChatbotDefault, {
  aiChatbot,
  chatbotScript,
  validateOptions,
  buildLoader,
  injectIntoHtml,
  DEFAULT_SCRIPT_URL,
} from '../src/index.js';

const ID = 'asyntai_1a2b3c4d5e6f';
const PAGE = '<!doctype html><html><head><title>t</title></head><body><h1>Hi</h1></body></html>';

function appWith(options = { widgetId: ID }) {
  const app = new Hono();
  app.use('*', aiChatbot(options));
  return app;
}

function countLoaders(text) {
  return text.split('data-asyntai-loader').length - 1;
}

// ---------- options ----------

test('default export is the middleware factory', () => {
  assert.equal(aiChatbotDefault, aiChatbot);
});

test('widgetId is required', () => {
  assert.throws(() => aiChatbot(), /"widgetId" is required/);
  assert.throws(() => aiChatbot({}), /"widgetId" is required/);
  assert.throws(() => aiChatbot({ widgetId: '   ' }), /"widgetId" is required/);
});

test('a wrong widgetId is refused with a clear message', () => {
  assert.throws(() => aiChatbot({ widgetId: '1a2b3c' }), /does not look like a widget ID/);
  assert.throws(() => aiChatbot({ widgetId: 'asyntai_<script>' }), /does not look like a widget ID/);
});

test('widgetId is trimmed and scriptUrl has a default', () => {
  const s = validateOptions({ widgetId: '  ' + ID + ' ' });
  assert.equal(s.widgetId, ID);
  assert.equal(s.scriptUrl, DEFAULT_SCRIPT_URL);
  assert.equal(s.skip, null);
});

test('skip must be a function', () => {
  assert.throws(() => aiChatbot({ widgetId: ID, skip: true }), /"skip" must be a function/);
});

// ---------- loader ----------

test('loader waits for the load event and checks for an existing widget', () => {
  const js = buildLoader(ID, DEFAULT_SCRIPT_URL);
  assert.match(js, /addEventListener\("load"/);
  assert.match(js, /document\.readyState==="complete"/);
  assert.match(js, /script\[data-asyntai-id\]/);
  assert.ok(js.includes(JSON.stringify(ID)));
});

test('loader escapes "<" so a script URL cannot close the tag', () => {
  const js = buildLoader(ID, 'https://x.test/</script><b>');
  assert.ok(!js.includes('</script>'));
  assert.ok(js.includes('\\u003c/script>'));
});

test('chatbotScript returns one complete script tag', () => {
  const tag = chatbotScript({ widgetId: ID });
  assert.ok(tag.startsWith('<script data-asyntai-loader>'));
  assert.ok(tag.endsWith('</script>'));
  assert.equal(countLoaders(tag), 1);
});

// ---------- injectIntoHtml ----------

test('injects before the last </body>', () => {
  const out = injectIntoHtml('<body><p>a</p></body><!-- </body> --></body>', '<X>');
  assert.equal(out, '<body><p>a</p></body><!-- </body> --><X></body>');
});

test('falls back to </html> and is case-insensitive', () => {
  assert.equal(injectIntoHtml('<HTML><P>x</P></HTML>', '<X>'), '<HTML><P>x</P><X></HTML>');
  assert.equal(injectIntoHtml('<BODY>x</BODY>', '<X>'), '<BODY>x<X></BODY>');
});

test('leaves fragments and pages with a snippet alone', () => {
  assert.equal(injectIntoHtml('<div>partial</div>', '<X>'), '<div>partial</div>');
  const own = '<body><script data-asyntai-id="asyntai_x" src="y"></script></body>';
  assert.equal(injectIntoHtml(own, '<X>'), own);
  const loader = '<body><script data-asyntai-loader>1</script></body>';
  assert.equal(injectIntoHtml(loader, '<X>'), loader);
});

// ---------- middleware on real Hono apps ----------

test('adds the widget to a c.html() page', async () => {
  const app = appWith();
  app.get('/', (c) => c.html(PAGE));
  const res = await app.request('/');
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.equal(countLoaders(text), 1);
  assert.ok(text.indexOf('data-asyntai-loader') < text.indexOf('</body>'));
  assert.ok(text.includes(ID));
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('adds the widget to an html`` template page', async () => {
  const app = appWith();
  app.get('/', (c) =>
    c.html(html`<!doctype html><html><body><p>${'<escaped>'}</p>${raw('<b>raw</b>')}</body></html>`),
  );
  const text = await (await app.request('/')).text();
  assert.equal(countLoaders(text), 1);
  assert.ok(text.includes('&lt;escaped&gt;'));
});

test('adds the widget to a streamed HTML page', async () => {
  const app = appWith();
  app.get('/', (c) => {
    c.header('Content-Type', 'text/html; charset=UTF-8');
    return stream(c, async (s) => {
      await s.write('<html><body><p>part one</p>');
      await s.write('<p>part two</p></body></html>');
    });
  });
  const text = await (await app.request('/')).text();
  assert.equal(countLoaders(text), 1);
  assert.ok(text.includes('part one') && text.includes('part two'));
});

test('JSON, plain text and binary responses pass through untouched', async () => {
  const app = appWith();
  app.get('/json', (c) => c.json({ body: '</body>' }));
  app.get('/text', (c) => c.text('</body>'));
  app.get('/bin', () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }));
  assert.deepEqual(await (await app.request('/json')).json(), { body: '</body>' });
  assert.equal(await (await app.request('/text')).text(), '</body>');
  const bin = new Uint8Array(await (await app.request('/bin')).arrayBuffer());
  assert.deepEqual([...bin], [1, 2, 3]);
});

test('error pages, redirects and non-GET requests are left alone', async () => {
  const app = appWith();
  app.get('/missing', (c) => c.html(PAGE, 404));
  app.get('/boom', () => {
    throw new Error('boom');
  });
  app.onError((err, c) => c.html('<html><body>error</body></html>', 500));
  app.get('/go', (c) => c.redirect('/'));
  app.post('/form', (c) => c.html(PAGE));
  for (const [path, init] of [['/missing'], ['/boom'], ['/form', { method: 'POST' }]]) {
    const text = await (await app.request(path, init)).text();
    assert.equal(countLoaders(text), 0, path);
  }
  const go = await app.request('/go');
  assert.equal(go.status, 302);
  assert.equal(go.headers.get('location'), '/');
});

test('a page that already has the Asyntai snippet gets no second copy', async () => {
  const app = appWith();
  const own = '<html><body><script async data-asyntai-id="' + ID + '" src="' + DEFAULT_SCRIPT_URL + '"></script></body></html>';
  app.get('/', (c) => c.html(own));
  const text = await (await app.request('/')).text();
  assert.equal(text, own);
});

test('a fragment (htmx partial) is returned unchanged and still readable', async () => {
  const app = appWith();
  app.get('/partial', (c) => c.html('<li>item</li>'));
  const res = await app.request('/partial');
  assert.equal(await res.text(), '<li>item</li>');
});

test('status, cookies and custom headers are kept; length and etag are dropped', async () => {
  const app = appWith();
  app.get('/', (c) => {
    c.header('X-Custom', 'yes');
    c.header('Set-Cookie', 'a=1; Path=/', { append: true });
    c.header('Set-Cookie', 'b=2; Path=/', { append: true });
    c.header('Content-Length', String(PAGE.length));
    c.header('ETag', '"old"');
    return c.html(PAGE, 201);
  });
  const res = await app.request('/');
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('x-custom'), 'yes');
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  assert.equal(cookies.join('|'), 'a=1; Path=/|b=2; Path=/');
  assert.equal(res.headers.get('content-length'), null);
  assert.equal(res.headers.get('etag'), null);
  assert.equal(countLoaders(await res.text()), 1);
});

test('skip() keeps the widget off chosen pages', async () => {
  const app = appWith({ widgetId: ID, skip: (c) => c.req.path.startsWith('/admin') });
  app.get('/admin/panel', (c) => c.html(PAGE));
  app.get('/shop', (c) => c.html(PAGE));
  assert.equal(countLoaders(await (await app.request('/admin/panel')).text()), 0);
  assert.equal(countLoaders(await (await app.request('/shop')).text()), 1);
});

test('works under a route prefix and on several pages', async () => {
  const app = new Hono();
  app.use('/site/*', aiChatbot({ widgetId: ID }));
  app.get('/site/a', (c) => c.html(PAGE));
  app.get('/site/b', (c) => c.html(PAGE));
  app.get('/other', (c) => c.html(PAGE));
  assert.equal(countLoaders(await (await app.request('/site/a')).text()), 1);
  assert.equal(countLoaders(await (await app.request('/site/b')).text()), 1);
  assert.equal(countLoaders(await (await app.request('/other')).text()), 0);
});

test('works with compress() registered first (outer) and gzips the changed page', async () => {
  const app = new Hono();
  app.use('*', compress());
  app.use('*', aiChatbot({ widgetId: ID }));
  app.get('/', (c) => c.html(PAGE + ' '.repeat(2048)));
  const res = await app.request('/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  assert.equal(countLoaders(text), 1);
});

test('a page compressed before the middleware runs is left alone, not broken', async () => {
  const app = new Hono();
  app.use('*', aiChatbot({ widgetId: ID }));
  app.use('*', compress());
  app.get('/', (c) => c.html(PAGE + ' '.repeat(2048)));
  const res = await app.request('/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  assert.ok(text.startsWith('<!doctype html>'));
  assert.equal(countLoaders(text), 0);
});

test('etag() registered first gets a tag for the changed page', async () => {
  const app = new Hono();
  app.use('*', etag());
  app.use('*', aiChatbot({ widgetId: ID }));
  app.get('/', (c) => c.html(PAGE));
  const first = await app.request('/');
  const tag = first.headers.get('etag');
  assert.ok(tag);
  assert.equal(countLoaders(await first.text()), 1);
  const again = await app.request('/', { headers: { 'If-None-Match': tag } });
  assert.equal(again.status, 304);
});

test('HEAD requests still work', async () => {
  const app = appWith();
  app.get('/', (c) => c.html(PAGE));
  const res = await app.request('/', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
});

test('a non-ASCII page keeps its characters', async () => {
  const app = appWith();
  const page = '<html><body><p>Žluťoučký kůň 日本語 🙂</p></body></html>';
  app.get('/', (c) => c.html(page));
  const text = await (await app.request('/')).text();
  assert.ok(text.includes('Žluťoučký kůň 日本語 🙂'));
  assert.equal(countLoaders(text), 1);
});

test('the same middleware instance serves many requests', async () => {
  const app = appWith();
  app.get('/', (c) => c.html(PAGE));
  const texts = await Promise.all(Array.from({ length: 20 }, () => app.request('/').then((r) => r.text())));
  assert.ok(texts.every((t) => countLoaders(t) === 1));
});
