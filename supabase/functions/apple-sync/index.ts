import { validateSnapshot, SnapshotValidationError } from './validate.mjs';
const reply = (status: number, body: object) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store'},
});
Deno.serve(async request => {
  if (request.method !== 'POST') return reply(405, {error:'Use POST'});
  const key = request.headers.get('X-Sync-Key') ?? '';
  if (!/^[a-f0-9]{64}$/.test(key)) return reply(401, {error:'Missing or invalid sync key'});
  if (Number(request.headers.get('Content-Length')) > 1_000_000) return reply(413, {error:'Payload too large'});
  try {
    // Bound the stream too: Content-Length may be absent or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, {error:'Missing body'});
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1_000_000) { await reader.cancel(); return reply(413,{error:'Payload too large'}); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset=0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
    let snapshot;
    try { snapshot = validateSnapshot(JSON.parse(new TextDecoder().decode(bytes))); }
    catch (error) {
      if (error instanceof SnapshotValidationError) return reply(400,{
        error:'Invalid snapshot', field:error.field, hint:error.message, actual_type:error.actual_type,
      });
      return reply(400,{error:'Invalid JSON',hint:'本文は有効なJSONにしてください。'});
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hash = Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')!}/rest/v1/rpc/receive_apple_snapshot`, {
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},
      body:JSON.stringify({p_hash:hash,p_captured_at:snapshot.captured_at,p_sources:snapshot.sources}),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return reply(error.code === '28000' ? 401 : 503, {error:error.code === '28000' ? 'Sync key expired or revoked' : 'Unable to save snapshot'});
    }
    return reply(200,{ok:true,counts:Object.fromEntries(Object.entries(snapshot.sources).map(([source,items])=>[source,(items as unknown[]).length]))});
  } catch { return reply(503,{error:'Sync service unavailable'}); }
});
