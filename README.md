# hono-ai-chatbot

Add the [Asyntai](https://asyntai.com) AI chat assistant to any Hono app. It
answers visitor questions from your own content, in more than 80 languages.

It is a Hono middleware. It works on every runtime Hono supports: Node.js, Bun,
Deno, Cloudflare Workers, Vercel and Netlify, on Hono 3 and Hono 4.

## Install

```bash
npm install hono-ai-chatbot
```

Then register the middleware before your routes:

```ts
import { Hono } from 'hono'
import { aiChatbot } from 'hono-ai-chatbot'

const app = new Hono()

app.use('*', aiChatbot({ widgetId: 'asyntai_1a2b3c4d5e6f' }))

app.get('/', (c) => c.html('<html><body><h1>Welcome</h1></body></html>'))

export default app
```

Every HTML page now has the chat bubble. That includes pages made with
`c.html()`, `hono/jsx`, `html` templates and static files.

Use `app.use('*', ...)` with the `'*'` path. On Hono 3, `app.use()` without a
path covers only some routes.

## Where the widget ID comes from

Open the Install page in your [Asyntai dashboard](https://asyntai.com/dashboard).
The widget ID is the value of `data-asyntai-id` in the snippet shown there. It
starts with `asyntai_`.

Creating an account is free, and the Free plan is enough to try the widget.

## Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `widgetId` | string | required | Your Asyntai widget ID |
| `skip` | `(c) => boolean` | none | Return `true` to keep the widget off a page, for example admin pages |
| `scriptUrl` | string | the Asyntai CDN | Advanced. Load the widget from another URL |

A missing or malformed `widgetId` stops the app at start-up with a message that
says how to fix it.

Keep the widget off some pages:

```ts
app.use('*', aiChatbot({
  widgetId: 'asyntai_1a2b3c4d5e6f',
  skip: (c) => c.req.path.startsWith('/admin'),
}))
```

Use it on one part of the site only:

```ts
app.use('/shop/*', aiChatbot({ widgetId: 'asyntai_1a2b3c4d5e6f' }))
```

## Placing the tag by hand

If you prefer to put the tag in your own layout, use `chatbotScript()`:

```tsx
import { raw } from 'hono/html'
import { chatbotScript } from 'hono-ai-chatbot'

const tag = chatbotScript({ widgetId: 'asyntai_1a2b3c4d5e6f' })

const Layout = (props) => (
  <html>
    <body>
      {props.children}
      {raw(tag)}
    </body>
  </html>
)
```

The middleware sees the tag and does not add a second one.

## What the middleware does

- It adds the Asyntai loader to every full HTML page, just before `</body>`.
- It changes only successful `GET` responses with the type `text/html`. JSON,
  images, redirects and error pages pass through untouched.
- HTML fragments without a `<body>` or `<html>` tag, for example htmx
  partials, stay as they are.
- A page that already has the Asyntai snippet keeps it and gets no second one.
- The loader waits for the page's `load` event, so your page always renders
  first.
- It keeps your status code, cookies and headers. It removes `Content-Length`
  and `ETag`, because the page changed.

With `compress()`, register `compress()` first, then `aiChatbot()`:

```ts
app.use('*', compress())
app.use('*', aiChatbot({ widgetId: 'asyntai_1a2b3c4d5e6f' }))
```

## Answering from your content

Asyntai reads your published pages. Add your site URL in the dashboard, and the
assistant answers from the same pages the widget sits on. You can also add extra
documents and question and answer pairs.

## Removing it

Delete the `aiChatbot(...)` line and deploy again. The widget is gone.

## Support

Email [hello@asyntai.com](mailto:hello@asyntai.com), or read the
[Hono guide](https://asyntai.com/documentation/integrations/hono/).

## Licence

MIT. See [LICENSE](LICENSE).
