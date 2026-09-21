import { randomBytes } from 'node:crypto';

import zh from '../../../../../locales/zh-CN/auth.json';

import en from '@/locales/default/auth';

type Copy = Record<string, string>;

// Serialized into a nonce-bound standalone document. Keep this function self-contained:
// no imported runtime, Next layout, analytics, external assets or captured bindings.
export function initializeProofPage(copy: Copy) {
  const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const code = element('code');
  const status = element('status');
  const start = element<HTMLButtonElement>('start');
  const finish = element<HTMLButtonElement>('finish');
  const cancel = element<HTMLButtonElement>('cancel');
  const retry = element<HTMLButtonElement>('retry');
  const prefix = 'askcore:wechat-prepublication:tab:';
  let transaction: { expires: number; id: string } | undefined;
  let generation = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let busy = false;
  let cancelling = false;
  let disposed = false;

  const stop = (message: string) => {
    generation += 1;
    controller?.abort();
    clearTimeout(pollTimer);
    clearTimeout(expiryTimer);
    code.textContent = '';
    if (transaction) {
      try { sessionStorage.removeItem(prefix + transaction.id); } catch { /* No alternate storage. */ }
    }
    transaction = undefined;
    status.textContent = message;
    finish.hidden = cancel.hidden = retry.hidden = true;
    start.disabled = false;
    busy = false;
  };
  const expired = () => {
    if (!transaction || Date.now() < transaction.expires) return false;
    stop(copy.expired);
    return true;
  };
  const request = async (action: string) => {
    const activeGeneration = generation;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (transaction) {
      const tab = sessionStorage.getItem(prefix + transaction.id);
      if (!tab) throw new Error('binding_missing');
      headers['X-AskCore-WeChat-Tab-Binding'] = tab;
    }
    controller = new AbortController();
    const current = controller;
    const timeout = setTimeout(() => current.abort(), 8000);
    try {
      const response = await fetch(`/api/auth/wechat-prepublication/${action}`, {
        body: JSON.stringify(transaction ? { transactionId: transaction.id } : {}),
        cache: 'no-store', credentials: 'same-origin', headers, method: 'POST', signal: current.signal,
      });
      if (disposed || activeGeneration !== generation || expired()) return;
      if ([400, 401, 403, 404, 409, 410, 423].includes(response.status)) {
        stop(response.status === 410 ? copy.expired : copy.failed);
        return;
      }
      if (!response.ok) throw new Error('unavailable');
      const payload = await response.json();
      if (disposed || activeGeneration !== generation || expired()) return;
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };
  const update = (state: unknown) => {
    if (state === 'completed' || state === 'cancelled' || state === 'failed' || state === 'expired') {
      stop(copy[state]);
    } else if (state === 'proof_ready') {
      code.textContent = '';
      status.textContent = copy.ready;
      finish.hidden = false;
      retry.hidden = true;
    } else if (state === 'pending') {
      status.textContent = copy.pending;
      retry.hidden = true;
    } else {
      stop(copy.failed);
    }
  };
  const check = async (action = 'status') => {
    if (disposed || busy || !transaction || expired()) return;
    clearTimeout(pollTimer);
    busy = true;
    const activeGeneration = generation;
    finish.disabled = cancel.disabled = retry.disabled = true;
    try {
      const result = await request(action);
      if (result) update(result.state);
    } catch {
      if (!disposed && activeGeneration === generation && !expired()) {
        status.textContent = copy.retry;
        retry.hidden = false;
      }
    } finally {
      if (activeGeneration === generation) {
        busy = false;
        finish.disabled = cancel.disabled = retry.disabled = false;
        if (transaction && !cancelling) pollTimer = setTimeout(() => void check(), 1200);
      }
    }
  };
  start.onclick = async () => {
    if (disposed || busy || transaction) return;
    generation += 1;
    const activeGeneration = generation;
    busy = start.disabled = true;
    cancelling = false;
    try {
      const result = await request('start');
      if (!result) return;
      const expires = Date.parse(result.expiresAt);
      if (!/^[A-F0-9]{20}$/.test(result.manualCode) ||
          !/^wxm_[\w-]{16,96}$/.test(result.transactionId) ||
          !/^[\w-]{43}$/.test(result.tabBinding) ||
          !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 300_000) {
        stop(copy.failed);
        return;
      }
      transaction = { expires, id: result.transactionId };
      sessionStorage.setItem(prefix + transaction.id, result.tabBinding);
      code.textContent = result.manualCode.match(/.{5}/g).join(' ');
      status.textContent = copy.pending;
      cancel.hidden = false;
      cancel.disabled = false;
      expiryTimer = setTimeout(() => stop(copy.expired), expires - Date.now());
      pollTimer = setTimeout(() => void check(), 1200);
    } catch {
      if (!disposed && activeGeneration === generation) stop(copy.failed);
    } finally {
      if (activeGeneration === generation) {
        busy = false;
        start.disabled = Boolean(transaction);
      }
    }
  };
  finish.onclick = () => { void check('finish'); };
  cancel.onclick = () => {
    if (busy) return;
    code.textContent = '';
    finish.hidden = true;
    cancelling = true;
    void check('cancel');
  };
  retry.onclick = () => { void check(cancelling ? 'cancel' : 'status'); };
  const resume = () => {
    if (!disposed && !expired() && !document.hidden) void check(cancelling ? 'cancel' : 'status');
  };
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', () => {
    disposed = true;
    stop('');
    start.disabled = true;
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  }, { once: true });
}

export function prepublicationDocument(language: string) {
  const translated = /^zh\b/i.test(language);
  const dictionary = translated ? zh : en;
  const copy = Object.fromEntries(Object.entries(dictionary)
    .filter(([key]) => key.startsWith('betterAuth.wechatProof.'))
    .map(([key, value]) => [key.slice('betterAuth.wechatProof.'.length), value]));
  const escape = (text: string) => text.replace(/[&<>"']/g, (character) => ({
    '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;',
  })[character]!);
  const nonce = randomBytes(24).toString('base64');
  const serialized = JSON.stringify(copy).replace(/</g, '\\u003c');
  const html = `<!doctype html><html lang="${translated ? 'zh-CN' : 'en'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(copy.title)}</title><style nonce="${nonce}">
body{font:16px/1.6 system-ui,sans-serif;color:#20242a;background:#f5f6fa;margin:0;padding:24px}
main{max-width:640px;margin:24px auto;padding:24px;background:white;border-radius:16px}
h1{font-size:24px}button{font:inherit;padding:10px 16px;margin:8px 8px 8px 0;cursor:pointer}
#code{display:block;font:600 22px/2 monospace;overflow-wrap:anywhere;user-select:none}
button:disabled{cursor:default;opacity:.5}[hidden]{display:none!important}a{color:#185acb}
</style></head><body><main><h1>${escape(copy.title)}</h1>
<p>${escape(copy.explanation)}</p><p>${escape(copy.instructions)}</p>
<output id="code" aria-label="${escape(copy.start)}"></output>
<p id="status" role="status" aria-live="polite"></p>
<button id="start" type="button">${escape(copy.start)}</button>
<button id="finish" type="button" hidden>${escape(copy.finish)}</button>
<button id="cancel" type="button" hidden>${escape(copy.cancel)}</button>
<button id="retry" type="button" hidden>${escape(copy.retryAction)}</button>
<p><a href="/wechat-rebind">${escape(copy.back)}</a></p></main>
<script nonce="${nonce}">(${initializeProofPage.toString()})(${serialized});</script></body></html>`;
  return new Response(html, { headers: {
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Content-Type': 'text/html; charset=utf-8',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  } });
}
