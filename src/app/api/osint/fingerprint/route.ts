import { scanUsername, isValidUsername } from '@/lib/sherlock';

export const maxDuration = 60;

/**
 * Streaming username sweep (NDJSON) for the Fingerprint tool: one `result`
 * line per site as it answers, then a calibrated `done` line. Provisional
 * positives are replaced by the calibrated verdicts in `done`.
 */
export async function GET(req: Request) {
  const username = (new URL(req.url).searchParams.get('username') || '').trim().replace(/^@/, '');
  if (!username || !isValidUsername(username)) {
    return Response.json({ error: 'A valid username is required' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        const scan = await scanUsername(username, {
          concurrency: 12,
          timeoutMs: 8000,
          onResult: (r, total) => send({ type: 'result', site: r.site, url: r.url, status: r.status, http_status: r.http_status, reason: r.reason, total }),
        });
        send({ type: 'done', ...scan });
      } catch (e: any) {
        send({ type: 'error', error: e?.message || 'Search failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
