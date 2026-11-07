# Free AI in the panel — the one-file way

You downloaded only the HTML. That file cannot think on its own — it is a skin.
It needs one thing to talk to, and a page sitting in your Downloads folder has nothing.

`badr-ai-app.js` **is** that thing: one Cloudflare Worker that serves the whole
panel **and** the AI from the same address. No endpoint field, no token, no CORS,
no key, nothing to paste.

---

## The three steps

**1. Create the worker**
Cloudflare dashboard → **Workers & Pages** → **Create** → **Worker** → **Deploy**

**2. Replace the code**
Click **Edit code** → select everything (Ctrl+A) → delete → paste the entire
contents of **`badr-ai-app.js`** → **Deploy**

**3. Give it Workers AI**
Worker → **Settings** → **Bindings** → **Add** → **Workers AI**
Variable name: **`AI`** (exactly that, capital letters)

Then open your worker address, e.g. `https://badr-ai.<you>.workers.dev`.

The panel loads with the AI already connected. The chip is green: **ready · 6 models**.
Type in the box at the bottom right. Done.

> Check it any time by opening `<worker>/api/health`.
> You should see `{"ok":true,"backend":"binding","models":6,...}`.
> If it says `"backend":"none"`, the binding from step 3 is missing.

---

## Which file does what

| file | what it is | when you need it |
|---|---|---|
| **`badr-ai-app.js`** | panel + AI in one worker | **use this one** |
| `BADR-UI-v1.6-single.html` | the panel alone, no AI | only for looking at the design |
| `badr-assist-worker.js` | AI only, no page | if you ever host the page somewhere else and paste its address into **Endpt** |

Opening the HTML from your disk will now say plainly: *"Nothing was sent, because this
page has no server to talk to."* That was the error you hit — it used to blame CORS,
which was wrong.

---

## The six models

| model | good at |
|---|---|
| Llama 3.3 70B | all-round — default |
| GPT-OSS 120B | OpenAI's open-weight model |
| Qwen 2.5 Coder 32B | code |
| DeepSeek R1 32B | reasoning |
| Mistral Small 3.1 24B | short fast answers |
| Llama 3.1 8B | fastest |

**GPT-4 is not in there, and cannot be, on the free tier.** Workers AI runs
open-weight models only. GPT-OSS 120B is the OpenAI-family one. Real GPT-4 and Claude
need paid keys from OpenAI/Anthropic, which the same worker can hold later if you want —
as secrets, never in the page.

---

## Keeping it private

You said you will be the only one with the link, so you can skip this.

If the address ever leaks: add a secret named **`BADR_KEY`** with any long random string,
and put the same string in the panel's **Key** field. Everything without that header
gets a 401. No redeploy of the page needed.

---

## What was verified, and what was not

Verified here, in Node, against the real worker code:

- `GET /` returns the panel byte-for-byte identical to the HTML file
- `GET /api/models` → the 6 models
- `POST /api/chat` → honours the model you pick
- an unknown model id falls back to Llama 3.3 instead of erroring
- empty reply → 502 with the reason; model exception → 502 with the message
- missing binding → 503 `No AI configured...`
- `BADR_KEY` set → 401 without the header, 200 with it
- the panel against that worker in jsdom: connects, loads 6 models, sends with the
  chosen model, renders the reply, 0 JS errors
- opened from `file://` → makes **zero** network calls and says so honestly

**Not verified:** a live call to Workers AI. This sandbox cannot reach
`api.cloudflare.com`. The first real message on your worker will be the true test —
and if the binding is wrong, it will say `No AI configured` rather than pretend.
