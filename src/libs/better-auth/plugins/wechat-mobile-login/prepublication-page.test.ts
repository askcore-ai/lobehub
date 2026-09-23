// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initializeProofPage, prepublicationDocument } from './prepublication-page';

const code = 'ABCDEF0123ABCDEF0123';
const id = `wxm_${'x'.repeat(24)}`;
const tab = 't'.repeat(43);
const key = `askcore:wechat-prepublication:tab:${id}`;
const copy = Object.fromEntries(['pending', 'ready', 'completed', 'cancelled', 'expired', 'failed', 'retry'].map((value) => [value, value]));
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const flush = async () => { for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); };

async function setup() {
  vi.useFakeTimers();
  const response = prepublicationDocument('zh-CN');
  document.documentElement.innerHTML = await response.text();
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/start')) return Response.json({ manualCode: code, transactionId: id, tabBinding: tab, expiresAt: new Date(Date.now() + 300_000).toISOString() });
    return Response.json({ state: 'pending' });
  });
  vi.stubGlobal('fetch', fetcher);
  initializeProofPage(copy);
  return fetcher;
}

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isolated prepublication full document', () => {
  it('executes the actual serialized inline program without module-only captures', async () => {
    await setup();
    // Dispose the directly initialized instance before exercising the served script.
    window.dispatchEvent(new Event('pagehide'));
    const html = await prepublicationDocument('en').text();
    document.documentElement.innerHTML = html;
    const script = document.querySelector('script')!.textContent!;
    window.eval(script);
    button('start').click(); await flush();
    expect(document.getElementById('code')!.textContent).toBe('ABCDE F0123 ABCDE F0123');
  });

  it('shows a successful start despite a small positive server clock skew', async () => {
    const fetcher = await setup();
    window.dispatchEvent(new Event('pagehide'));
    const html = await prepublicationDocument('en').text();
    document.documentElement.innerHTML = html;
    const script = document.querySelector('script')!.textContent!;
    fetcher.mockResolvedValueOnce(Response.json({
      expiresAt: new Date(Date.now() + 302_000).toISOString(),
      manualCode: code,
      tabBinding: tab,
      transactionId: id,
    }));
    window.eval(script);
    button('start').click();
    await flush();
    expect(document.getElementById('code')!.textContent).toBe('ABCDE F0123 ABCDE F0123');
    expect(button('cancel').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(300_001);
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(document.getElementById('status')!.textContent).toContain('expired');
  });

  it('keeps a bounded local display when the server clock is behind', async () => {
    const fetcher = await setup();
    fetcher.mockResolvedValueOnce(Response.json({
      expiresAt: new Date(Date.now() + 298_000).toISOString(),
      manualCode: code,
      tabBinding: tab,
      transactionId: id,
    }));
    button('start').click();
    await flush();
    expect(document.getElementById('code')!.textContent).toBe('ABCDE F0123 ABCDE F0123');
    await vi.advanceTimersByTimeAsync(300_001);
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(document.getElementById('status')!.textContent).toBe('expired');
  });

  it('rejects a malformed server expiry without displaying a code', async () => {
    const fetcher = await setup();
    fetcher.mockResolvedValueOnce(Response.json({
      expiresAt: 'not-a-date',
      manualCode: code,
      tabBinding: tab,
      transactionId: id,
    }));
    button('start').click();
    await flush();
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(document.getElementById('status')!.textContent).toBe('failed');
    expect(sessionStorage.length).toBe(0);
  });

  it('has no external script/asset, a fresh nonce and matching enforced CSP', async () => {
    const first = prepublicationDocument('zh-CN');
    const second = prepublicationDocument('en');
    const html = await first.text();
    expect(html).toContain('预发布微信授权验证');
    expect(html).not.toMatch(/<script[^>]*src=|<link|<iframe|<img/);
    const nonce = html.match(/nonce="([^"]+)"/)![1];
    expect(first.headers.get('content-security-policy')).toContain(`'nonce-${nonce}'`);
    expect(first.headers.get('content-security-policy')).not.toBe(second.headers.get('content-security-policy'));
    expect(first.headers.get('cache-control')).toContain('no-store');
    expect(first.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('starts only on click, stores only tab binding and finalizes without a login redirect', async () => {
    const fetcher = await setup();
    expect(fetcher).not.toHaveBeenCalled();
    button('start').click();
    await flush();
    expect(document.getElementById('code')!.textContent).toBe('ABCDE F0123 ABCDE F0123');
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(key)).toBe(tab);
    fetcher.mockResolvedValueOnce(Response.json({ state: 'proof_ready' }));
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(button('finish').hidden).toBe(false);
    fetcher.mockResolvedValueOnce(Response.json({ state: 'completed' }));
    button('finish').click();
    await flush();
    expect(document.getElementById('status')!.textContent).toBe('completed');
    expect(sessionStorage.length).toBe(0);
    for (const [url, input] of fetcher.mock.calls) {
      expect(url).not.toContain('?');
      expect(JSON.stringify(input)).not.toContain(code);
    }
  });

  it('clears on expiry despite retries and on navigation despite an in-flight response', async () => {
    const fetcher = await setup();
    button('start').click(); await flush();
    fetcher.mockRejectedValue(new Error('synthetic unavailable'));
    await vi.advanceTimersByTimeAsync(300_001);
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(sessionStorage.length).toBe(0);
    expect(document.getElementById('status')!.textContent).toBe('expired');
    let resolve: (value: Response) => void = () => {};
    fetcher.mockImplementation(() => new Promise((done) => { resolve = done; }));
    button('start').click();
    window.dispatchEvent(new Event('pagehide'));
    resolve(Response.json({ manualCode: code, transactionId: id, tabBinding: tab, expiresAt: new Date(Date.now() + 300_000).toISOString() }));
    await flush();
    expect(sessionStorage.length).toBe(0);
    expect(document.getElementById('code')!.textContent).toBe('');
  });

  it('removes the displayed code immediately on cancel and retains binding only for bounded retry', async () => {
    const fetcher = await setup();
    button('start').click(); await flush();
    fetcher.mockRejectedValueOnce(new Error('synthetic unavailable'));
    button('cancel').click(); await flush();
    expect(document.getElementById('code')!.textContent).toBe('');
    expect(sessionStorage.getItem(key)).toBe(tab);
    fetcher.mockResolvedValueOnce(Response.json({ state: 'cancelled' }));
    button('retry').click(); await flush();
    expect(fetcher.mock.calls.at(-1)![0]).toContain('/cancel');
    expect(sessionStorage.length).toBe(0);
  });
});
