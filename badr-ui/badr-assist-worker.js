/*
 * badr-assist-worker.js — free, multi-model AI for the BADR panel.
 *
 * Six models, all on Cloudflare Workers AI's free allowance:
 *   Llama 3.3 70B · GPT-OSS 120B · Qwen 2.5 Coder 32B
 *   DeepSeek R1 32B · Mistral Small 3.1 24B · Llama 3.1 8B
 *
 * ── Deploy (about 2 minutes, NO API token needed) ───────────────────────
 *  1. Cloudflare dashboard → Workers & Pages → Create → Worker → Deploy.
 *  2. Edit code → delete what is there → paste this whole file → Deploy.
 *  3. Worker → Settings → Bindings → Add → Workers AI
 *        Variable name:  AI
 *     That binding is the only thing it needs. No account id, no token.
 *  4. Open  https://<worker>.workers.dev/api/health  in a tab.
 *        You should see {"ok":true,...}. If yes, it works.
 *  5. Paste that worker address into the panel's Endpt field, press Test.
 *
 *  If you would rather use a REST token than a binding, set these as secrets
 *  instead:  CF_ACCOUNT_ID  and  CF_AI_TOKEN  (Workers AI permission).
 *
 * ── Endpoints ───────────────────────────────────────────────────────────
 *   GET  /api/health  → { ok, models, backend, auth }
 *   GET  /api/models  → { models:[{id,label}], backend }
 *   POST /api/chat    → { reply, model, backend, ms }
 *        body: { messages:[{role,content}] , model?, message? }
 *   OPTIONS *         → CORS preflight
 *
 * ── Security ────────────────────────────────────────────────────────────
 *  CORS is "*" so a page opened from a file:// (origin "null") can call it.
 *  Set a secret BADR_KEY and every request must carry  x-badr-key: <key>.
 *  Without BADR_KEY the worker is open to anyone who knows the URL, and every
 *  call burns your free quota — set the key if the address will be public.
 */

const MODELS = [
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',    label: 'Llama 3.3 70B — best all-round' },
  { id: '@cf/openai/gpt-oss-120b',                     label: 'GPT-OSS 120B — OpenAI open model' },
  { id: '@cf/qwen/qwen2.5-coder-32b-instruct',         label: 'Qwen 2.5 Coder 32B — code' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',label: 'DeepSeek R1 32B — reasoning' },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct',label: 'Mistral Small 3.1 24B' },
  { id: '@cf/meta/llama-3.1-8b-instruct',              label: 'Llama 3.1 8B — fastest' },
];

const DEFAULT_MODEL = MODELS[0].id;
const MAX_MESSAGES = 12;
const MAX_CHARS = 4000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-badr-key',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_MESSAGES)
    .map((m) => {
      const o = m && typeof m === 'object' ? m : {};
      const role = o.role === 'assistant' || o.role === 'system' ? o.role : 'user';
      const content = typeof o.content === 'string' ? o.content.slice(0, MAX_CHARS) : '';
      return { role, content };
    })
    .filter((m) => m.content.length > 0);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const backend = env.AI ? 'binding' : env.CF_AI_TOKEN ? 'rest' : 'none';
    const auth = env.BADR_KEY ? 'key required' : 'open';

    if (url.pathname === '/api/health') {
      return json({ ok: true, backend, auth, models: MODELS.length, default: DEFAULT_MODEL });
    }

    if (url.pathname === '/api/models') {
      return json({ models: MODELS, backend });
    }

    if (url.pathname !== '/api/chat') {
      return json({ error: 'Not found. Use GET /api/health, GET /api/models or POST /api/chat.' }, 404);
    }

    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    // ── optional shared key ──────────────────────────────────────────────
    if (env.BADR_KEY) {
      const sent = request.headers.get('x-badr-key') || url.searchParams.get('key');
      if (sent !== env.BADR_KEY) return json({ error: 'Bad or missing x-badr-key header.' }, 401);
    }

    // ── body ─────────────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Body was not valid JSON.' }, 400);
    }

    let messages = cleanMessages(body && body.messages);
    if (messages.length === 0 && body && typeof body.message === 'string' && body.message.trim()) {
      messages = [{ role: 'user', content: body.message.slice(0, MAX_CHARS) }];
    }
    if (messages.length === 0) {
      return json({ error: 'No messages. Send { messages:[...] } or { message:"..." }.' }, 400);
    }

    // model must be one we know; anything else falls back to the default
    const asked = typeof (body && body.model) === 'string' ? body.model : '';
    const model = MODELS.some((m) => m.id === asked) ? asked : DEFAULT_MODEL;

    const started = Date.now();

    // ── 1st choice: Workers AI binding (no token at all) ─────────────────
    if (env.AI) {
      try {
        const out = await env.AI.run(model, { messages, max_tokens: 512, temperature: 0.3 });
        const reply =
          (out && (out.response || out.result?.response || out.choices?.[0]?.message?.content)) || '';
        if (!String(reply).trim()) {
          return json({ error: 'The model returned an empty reply.', model, backend, raw: out }, 502);
        }
        return json({ reply: String(reply).trim(), model, backend, ms: Date.now() - started });
      } catch (err) {
        return json(
          {
            error: 'Workers AI binding failed: ' + (err && err.message ? err.message : String(err)),
            model,
            backend,
          },
          502,
        );
      }
    }

    // ── 2nd choice: REST with a token ────────────────────────────────────
    const account = env.CF_ACCOUNT_ID;
    const token = env.CF_AI_TOKEN;
    if (!account || !token) {
      return json(
        {
          error:
            'Not configured. Add a Workers AI binding named AI (no token needed), ' +
            'or set CF_ACCOUNT_ID and CF_AI_TOKEN secrets.',
          backend: 'none',
        },
        503,
      );
    }

    let res;
    try {
      res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ model, messages, stream: false, max_tokens: 512, temperature: 0.3 }),
        },
      );
    } catch (err) {
      return json({ error: 'Network: ' + (err && err.message ? err.message : String(err)), model }, 502);
    }

    const text = await res.text();
    if (!res.ok) {
      return json({ error: 'Cloudflare said ' + res.status, detail: text.slice(0, 500), model }, res.status);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: 'Cloudflare returned non-JSON.', detail: text.slice(0, 400), model }, 502);
    }

    const reply = data?.choices?.[0]?.message?.content || data?.result?.response || '';
    if (!String(reply).trim()) {
      return json({ error: 'Empty reply.', detail: text.slice(0, 400), model }, 502);
    }

    return json({ reply: String(reply).trim(), model, backend, ms: Date.now() - started });
  },
};
