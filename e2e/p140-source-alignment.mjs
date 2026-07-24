import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, request as playwrightRequest } from '@playwright/test';
import axe from 'axe-core';

import { renderHandoffFailureDocument } from '../src/app/(backend)/api/askcore/school/handoff/document.ts';

const baseURL = (process.env.P140_BASE_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
const screenshotPath = process.env.P140_GUARD_SCREENSHOT || '';
const vitalsObserver = () => {
  globalThis.__p140Vitals = { cls: 0, interactions: [], lcp: 0 };
  if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries.at(-1);
      if (last) globalThis.__p140Vitals.lcp = last.startTime;
    }).observe({ buffered: true, type: 'largest-contentful-paint' });
  }
  if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) globalThis.__p140Vitals.cls += entry.value;
      }
    }).observe({ buffered: true, type: 'layout-shift' });
  }
  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId > 0) globalThis.__p140Vitals.interactions.push(entry.duration);
      }
    }).observe({ buffered: true, durationThreshold: 16, type: 'event' });
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const control = async (api, payload) => {
  const response = await api.post(`${baseURL}/__p140/control`, { data: payload });
  assert(response.ok(), `control ${payload.action} returned ${response.status()}`);
  return response.json();
};

const createPage = async (browser, viewport = { height: 900, width: 1440 }) => {
  const context = await browser.newContext({ viewport });
  return { context, page: await context.newPage() };
};

const openSource = async (page, source, role = 'student') => {
  await page.goto(
    `${baseURL}/__p140/start?source=${source}&fixture-role=${role}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.locator('#handoff').click();
  await page.waitForURL(`**/__p140/source/${source}?fixture-role=${role}`);
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('askcore-session-ready'),
  );
  const state = await page.locator('#source-content').evaluate((node) => ({
    account: node.getAttribute('data-account'),
    ariaHidden: node.getAttribute('aria-hidden'),
    inert: node.hasAttribute('inert'),
  }));
  assert(state.account === role, `${source} source session did not align to ${role}`);
  assert(state.ariaHidden === null && !state.inert, `${source} content stayed covered`);
  assert((await page.locator('#source-action').getAttribute('aria-label')) === null, 'unexpected label');
  assert((await page.locator('#source-action').textContent()) === 'Source action', 'missing control name');
};

const assertCovered = async (page, message) => {
  await page.waitForFunction(() => {
    const content = document.querySelector('#source-content');
    return content?.hasAttribute('inert') && content.getAttribute('aria-hidden') === 'true';
  });
  const covered = await page.locator('#source-content').evaluate((node) => ({
    ariaHidden: node.getAttribute('aria-hidden'),
    inert: node.hasAttribute('inert'),
  }));
  assert(covered.inert && covered.ariaHidden === 'true', message);
};

const waitForClosedSource = async (page, source, api) => {
  await page.waitForURL('**/school?fixture-return=1');
  const deadline = Date.now() + 3000;
  while (Date.now() <= deadline) {
    const state = await api.get(`${baseURL}/__p140/state`).then((response) => response.json());
    if (state.source_sessions[source] === null) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${source} stale source session survived`);
};

const triggerRevalidation = async (page, trigger) => {
  if (trigger === 'focus') {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    return;
  }
  if (trigger === 'visibility') {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    return;
  }
  if (trigger === 'broadcast') {
    await page.evaluate(() => {
      const channel = new BroadcastChannel('askcore-school-session-v1');
      channel.postMessage({ reason: 'account-changed' });
      channel.close();
    });
    return;
  }
  throw new Error(`unknown trigger ${trigger}`);
};

const broadcastGeneration = async (page, generationHash, sessionState) => {
  await page.evaluate(({ value, state }) => {
    const channel = new BroadcastChannel('askcore-school-session-v1');
    channel.postMessage({
      generationHash: value,
      sessionState: state,
      type: 'generation-changed',
    });
    channel.close();
  }, { state: sessionState, value: generationHash });
};

const broadcastSchoolSessionMessage = async (page, message) => {
  await page.evaluate((value) => {
    const channel = new BroadcastChannel('askcore-school-session-v1');
    channel.postMessage(value);
    channel.close();
  }, message);
};

const exerciseRevocation = async ({
  api,
  browser,
  mutation,
  screenshot = false,
  source,
  trigger,
}) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  await openSource(page, source);
  await control(api, { action: 'set_verification_delay', milliseconds: 800 });
  await control(api, mutation);
  await triggerRevalidation(page, trigger);
  await assertCovered(page, `${source} ${mutation.action} exposed stale content`);
  if (screenshot && screenshotPath) {
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
  }
  await waitForClosedSource(page, source, api);
  await context.close();
};

const exerciseDelayedAccountSwitch = async (api, browser) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  await openSource(page, 'moodle');
  await control(api, { action: 'set_stale_verification_delay', milliseconds: 800 });
  await triggerRevalidation(page, 'focus');
  await page.waitForTimeout(100);
  await control(api, { action: 'set_verification_delay', milliseconds: 1500 });
  await control(api, { action: 'switch', account: 'teacher' });
  await triggerRevalidation(page, 'broadcast');
  await page.waitForTimeout(900);
  await assertCovered(page, 'delayed student proof exposed the old page after switching to teacher');
  const ready = await page.evaluate(() =>
    document.documentElement.classList.contains('askcore-session-ready'),
  );
  assert(!ready, 'delayed student proof marked the old page ready after switching to teacher');
  await waitForClosedSource(page, 'moodle', api);
  await context.close();
};

const exerciseRefetchInvalidation = async (api, browser) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  try {
    await openSource(page, 'moodle');
    await control(api, { action: 'set_stale_verification_delay', milliseconds: 800 });
    await triggerRevalidation(page, 'focus');
    await page.waitForTimeout(100);
    await broadcastGeneration(page, null, 'unstable');
    await assertCovered(page, 'Better Auth refetch did not immediately cover Account A');
    await broadcastSchoolSessionMessage(page, {
      generationHash: 'legacy-generation',
      type: 'generation-changed',
    });
    await broadcastSchoolSessionMessage(page, {
      generationHash: 'unknown-generation',
      sessionState: 'unknown',
      type: 'generation-changed',
    });
    await triggerRevalidation(page, 'focus');
    await triggerRevalidation(page, 'visibility');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.waitForTimeout(900);
    const staleState = await page.locator('#source-content').evaluate(() => ({
      pending: document.documentElement.classList.contains('askcore-session-pending'),
      ready: document.documentElement.classList.contains('askcore-session-ready'),
    }));
    assert(
      staleState.pending && !staleState.ready,
      'Account A proof revealed source DOM while Better Auth was refetching',
    );
    await control(api, { action: 'switch', account: 'teacher' });
    await broadcastGeneration(page, 'stable-account-b', 'stable');
    await waitForClosedSource(page, 'moodle', api);
  } finally {
    await context.close();
  }
};

const exerciseSignedOutBroadcast = async (api, browser) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  try {
    await openSource(page, 'gibbon');
    await page.route('**/school?fixture-return=1', async (route) => {
      await route.fulfill({
        body: '<!doctype html><html><body><main>Signed out of school source</main></body></html>',
        contentType: 'text/html',
        status: 200,
      });
    });
    const coverObservation = new Promise((resolve) => {
      page.on('console', (message) => {
        if (message.text().startsWith('P140_SIGNED_OUT_COVER ')) resolve(message.text());
      });
    });
    await page.evaluate(() => {
      const report = () => {
        const content = document.querySelector('#source-content');
        if (
          document.documentElement.classList.contains('askcore-session-pending') &&
          content?.hasAttribute('inert') &&
          content.getAttribute('aria-hidden') === 'true'
        ) {
          console.log('P140_SIGNED_OUT_COVER true');
        }
      };
      new MutationObserver(report).observe(document.documentElement, {
        attributeFilter: ['class'],
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
    await control(api, { action: 'set_verification_delay', milliseconds: 1500 });
    await control(api, { action: 'logout' });
    const signedOutStartedAt = Date.now();
    const fallbackNavigation = page.waitForURL('**/school?fixture-return=1');
    await broadcastGeneration(page, null, 'signed-out');
    await broadcastGeneration(page, null, 'unstable');
    await broadcastSchoolSessionMessage(page, {
      generationHash: 'legacy-after-sign-out',
      type: 'generation-changed',
    });
    await broadcastGeneration(page, 'stable-after-sign-out', 'stable');
    const observed = await Promise.race([
      coverObservation,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('signed-out cover observation timed out')), 5000),
      ),
    ]);
    assert(observed === 'P140_SIGNED_OUT_COVER true', `unexpected signed-out cover: ${observed}`);
    await fallbackNavigation;
    assert(
      Date.now() - signedOutStartedAt <= 1300,
      'signed-out navigation waited beyond the bounded source cleanup',
    );
    await waitForClosedSource(page, 'gibbon', api);
  } finally {
    await context.close();
  }
};

const exerciseEarlyProof = async (browser) => {
  const { context, page } = await createPage(browser);
  await page.goto(`${baseURL}/__p140/early-guard`, { waitUntil: 'domcontentloaded' });
  const state = await page.locator('#source-content').evaluate((node) => ({
    ariaHidden: node.getAttribute('aria-hidden'),
    guardPresent: Boolean(document.querySelector('#askcore-session-guard')),
    inert: node.hasAttribute('inert'),
    pending: document.documentElement.classList.contains('askcore-session-pending'),
    ready: document.documentElement.classList.contains('askcore-session-ready'),
  }));
  assert(state.ready, 'proof completed before DOMContentLoaded but page was not marked ready');
  assert(!state.pending, 'DOMContentLoaded restored the pending guard after a successful proof');
  assert(!state.guardPresent, 'DOMContentLoaded recreated the guard after a successful proof');
  assert(!state.inert && state.ariaHidden === null, 'early proof left source content inaccessible');
  await context.close();
};

const exerciseLeaseDeadline = async (api, browser) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  try {
    await openSource(page, 'moodle');
    const initialState = await api.get(`${baseURL}/__p140/state`).then((response) => response.json());
    const initialRequests = initialState.verification_requests.moodle;
    const startedAt = Date.now();
    let elapsed = 0;
    while (elapsed <= 25_500) {
      await page.waitForTimeout(100);
      const state = await api.get(`${baseURL}/__p140/state`).then((response) => response.json());
      elapsed = Date.now() - startedAt;
      if (state.verification_requests.moodle > initialRequests) break;
    }
    assert(elapsed <= 25_500, `alignment lease renewed after ${elapsed}ms`);
  } finally {
    await context.close();
  }
};

const exerciseBFCache = async (api, browser) => {
  await control(api, { action: 'reset' });
  const { context, page } = await createPage(browser);
  await openSource(page, 'moodle');
  const observation = new Promise((resolve) => {
    page.on('console', (message) => {
      if (message.text().startsWith('P140_BFCACHE_GUARD ')) resolve(message.text());
    });
  });
  await page.evaluate(() => {
    addEventListener('pageshow', (event) => {
      queueMicrotask(() => {
        const content = document.querySelector('#source-content');
        console.log(
          `P140_BFCACHE_GUARD ${event.persisted} ${content?.hasAttribute('inert')} ${
            content?.getAttribute('aria-hidden') === 'true'
          }`,
        );
      });
    });
  });
  await page.goto(`${baseURL}/__p140/away`);
  await control(api, { action: 'switch', account: 'teacher' });
  await control(api, { action: 'set_verification_delay', milliseconds: 800 });
  await page.goBack({ waitUntil: 'commit' });
  const result = await Promise.race([
    observation,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('BFCache pageshow observation timed out')), 5000),
    ),
  ]);
  assert(
    result === 'P140_BFCACHE_GUARD true true true',
    `BFCache restored unguarded source DOM: ${result}`,
  );
  await waitForClosedSource(page, 'moodle', api);
  await context.close();
};

const exerciseMatrix = async (api, browser) => {
  const roles = ['student', 'teacher', 'administrator', 'guardian'];
  const viewports = [
    { height: 568, width: 320 },
    { height: 844, width: 390 },
    { height: 1024, width: 768 },
    { height: 768, width: 1024 },
    { height: 900, width: 1440 },
  ];
  for (let index = 0; index < viewports.length; index += 1) {
    await control(api, { action: 'reset' });
    const { context, page } = await createPage(browser, viewports[index]);
    await openSource(page, index % 2 === 0 ? 'moodle' : 'gibbon', roles[index % roles.length]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert(overflow <= 0, `horizontal overflow at ${viewports[index].width}px`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('askcore-session-ready'),
    );
    await page.goto(
      `${baseURL}/__p140/start?source=moodle&fixture-role=${roles[index % roles.length]}`,
    );
    await page.keyboard.press('Tab');
    assert(await page.locator('#handoff').evaluate((node) => node === document.activeElement), 'bad tab order');
    await page.locator('#handoff').click();
    await page.waitForURL(
      `**/__p140/source/moodle?fixture-role=${roles[index % roles.length]}`,
    );
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('askcore-session-ready'),
    );
    await context.close();
  }
};

const exerciseFailures = async (api, browser) => {
  for (const failure of ['moodle', 'gibbon', 'identity', 'broker']) {
    await control(api, { action: 'reset' });
    const source = failure === 'gibbon' ? 'gibbon' : 'moodle';
    const { context, page } = await createPage(browser);
    await page.goto(
      `${baseURL}/__p140/start?source=${source}&fixture-failure=${failure}`,
    );
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/askcore/school/handoff'),
    );
    await page.locator('#handoff').click();
    const response = await responsePromise;
    assert(response.status() === 503, `${failure} did not fail closed`);
    assert((await page.locator('main').textContent()).includes('safely blocked'), `${failure} leaked through`);
    await context.close();
  }
};

const exerciseMissingPreprovisionedAccount = async (api, browser) => {
  await control(api, { action: 'reset' });
  await control(api, { action: 'set_source_account_ready', ready: false, source: 'moodle' });
  const { context, page } = await createPage(browser);
  try {
    await page.goto(`${baseURL}/__p140/start?source=moodle&fixture-role=student`);
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/askcore/school/handoff'),
    );
    await page.locator('#handoff').click();
    const response = await responsePromise;
    assert(response.status() === 403, 'missing Moodle account did not fail closed');
    assert(
      (await page.locator('main').textContent()).includes('not preprovisioned'),
      'missing Moodle account did not explain the safe denial',
    );
    const state = await api.get(`${baseURL}/__p140/state`).then((result) => result.json());
    assert(state.source_sessions.moodle === null, 'missing account created a source session');
  } finally {
    await context.close();
  }
};

const exerciseHandoffFailureDocuments = async (browser) => {
  const cases = [
    { locale: 'zh-CN', message: '请先登录', recoveryLabel: '重试', status: 401, title: '需要登录' },
    {
      locale: 'en-US',
      message: 'Access was denied.',
      recoveryLabel: 'Try again',
      status: 403,
      title: 'School connection unavailable',
    },
    {
      locale: 'ja-JP',
      message: 'Request too large.',
      recoveryLabel: '再試行',
      status: 413,
      title: 'School connection unavailable',
    },
    {
      locale: 'de-DE',
      message: 'Service unavailable.',
      recoveryLabel: 'Erneut versuchen',
      status: 503,
      title: 'School service unavailable',
    },
  ];
  const { context, page } = await createPage(browser);
  try {
    for (const failure of cases) {
      await page.setContent(
        renderHandoffFailureDocument({
          ...failure,
          recoveryHref: failure.status === 503 ? '/settings/school-affairs' : '/school',
        }),
      );
      const main = page.locator('main[data-askcore-handoff-error]');
      assert(
        (await main.getAttribute('data-status')) === String(failure.status),
        `handoff failure document lost status ${failure.status}`,
      );
      assert(
        (await page.locator('html').getAttribute('lang')) === failure.locale,
        `handoff failure document lost locale ${failure.locale}`,
      );
      const alert = main.getByRole('alert');
      assert((await alert.count()) === 1, `handoff failure ${failure.status} is not announced`);
      const recovery = main.getByRole('link');
      await page.keyboard.press('Tab');
      assert(
        await recovery.evaluate((node) => node === document.activeElement),
        `handoff failure ${failure.status} recovery link is not keyboard reachable`,
      );
      await page.addScriptTag({ content: axe.source });
      const severe = await main.evaluate(async (node) => {
        const result = await globalThis.axe.run(node, { resultTypes: ['violations'] });
        return result.violations.filter(
          ({ impact }) => impact === 'serious' || impact === 'critical',
        );
      });
      assert(
        severe.length === 0,
        `handoff failure ${failure.status} has serious/critical axe violations`,
      );
    }
  } finally {
    await context.close();
  }
};

const auditBuiltSurface = async (browser, routePath) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const requestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.requestSubmit = function (...args) {
      if (new URL(this.action, location.href).pathname === '/api/askcore/school/handoff') {
        this.dataset.p140AutoSubmitObserved = 'true';
        return;
      }
      return requestSubmit.apply(this, args);
    };
  });
  await page.addInitScript(vitalsObserver);
  try {
    await page.goto(`${baseURL}${routePath}?fixture-role=administrator`, {
      waitUntil: 'domcontentloaded',
    });
    const main = page.locator('main');
    await main.waitFor();
    assert(
      (await main.locator('form').getAttribute('data-p140-auto-submit-observed')) === 'true',
      `${routePath} did not request the automatic source handoff`,
    );
    const status = main.getByRole('status');
    await status.waitFor();
    assert((await status.getAttribute('aria-live')) === 'polite', `${routePath} status is not live`);
    const button = main.getByRole('button');
    assert((await button.count()) === 1, `${routePath} handoff control is not unique`);
    assert(Boolean(await button.textContent()), `${routePath} handoff control has no name`);

    let reachedByKeyboard = false;
    for (let index = 0; index < 200; index += 1) {
      await page.keyboard.press('Tab');
      if (await button.evaluate((node) => node === document.activeElement)) {
        reachedByKeyboard = true;
        break;
      }
    }
    assert(reachedByKeyboard, `${routePath} handoff control is not keyboard reachable`);
    assert(
      await button.evaluate((node) => node.matches(':focus-visible')),
      `${routePath} handoff control has no visible keyboard focus`,
    );

    const animation = await main.locator('svg').first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { duration: style.animationDuration, name: style.animationName };
    });
    assert(
      animation.name === 'none' || animation.duration === '0s',
      `${routePath} ignores reduced motion`,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert(overflow <= 0, `${routePath} has horizontal overflow`);

    await page.addScriptTag({ content: axe.source });
    const axeResult = await main.evaluate(async (node) => {
      const result = await globalThis.axe.run(node, {
        resultTypes: ['violations'],
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      });
      return result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.length,
      }));
    });
    const severe = axeResult.filter(({ impact }) => impact === 'serious' || impact === 'critical');
    assert(
      severe.length === 0,
      `${routePath} serious/critical axe violations: ${JSON.stringify(severe)}`,
    );

    await page.waitForTimeout(750);
    const metrics = await page.evaluate(() => {
      const interactions = globalThis.__p140Vitals.interactions;
      return {
        cls: globalThis.__p140Vitals.cls,
        inp: interactions.length > 0 ? Math.max(...interactions) : null,
        lcp: globalThis.__p140Vitals.lcp,
      };
    });
    assert(metrics.lcp > 0 && metrics.lcp <= 2500, `${routePath} LCP ${metrics.lcp}ms`);
    assert(metrics.cls <= 0.1, `${routePath} CLS ${metrics.cls}`);
    assert(metrics.inp !== null && metrics.inp <= 200, `${routePath} INP ${metrics.inp}ms`);
    return { axe: axeResult.length, ...metrics };
  } finally {
    await context.close();
  }
};

const exerciseSPA = async (api, browser) => {
  if (process.env.P140_CHECK_SPA !== '1') return;
  await control(api, { action: 'reset' });
  let view = await createPage(browser);
  await view.page.goto(`${baseURL}/school?fixture-role=student`);
  await view.page.waitForURL('**/__p140/source/moodle?fixture-role=student');
  await view.page.waitForFunction(() =>
    document.documentElement.classList.contains('askcore-session-ready'),
  );
  assert(
    (await view.page.locator('#source-content').getAttribute('data-source')) === 'moodle',
    '/school did not hand off directly to Moodle',
  );
  await view.context.close();

  await control(api, { action: 'reset' });
  view = await createPage(browser);
  await view.page.goto(`${baseURL}/settings/school-affairs?fixture-role=administrator`);
  await view.page.waitForURL('**/__p140/source/gibbon?fixture-role=administrator');
  await view.page.waitForFunction(() =>
    document.documentElement.classList.contains('askcore-session-ready'),
  );
  assert(
    (await view.page.locator('#source-content').getAttribute('data-source')) === 'gibbon',
    'School Affairs did not hand off to Gibbon',
  );
  await view.context.close();
};

const main = async () => {
  const api = await playwrightRequest.newContext();
  const browserTemp = process.env.TMPDIR
    ? path.relative(process.cwd(), process.env.TMPDIR)
    : undefined;
  const browser = await chromium.launch({
    args: ['--headless=new'],
    env: browserTemp ? { ...process.env, TMPDIR: browserTemp } : process.env,
    executablePath: chromium.executablePath(),
    headless: false,
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  try {
    const baselines =
      process.env.P140_CHECK_SPA === '1'
        ? {
            school: await auditBuiltSurface(browser, '/school'),
            school_affairs: await auditBuiltSurface(browser, '/settings/school-affairs'),
          }
        : {};
    await exerciseMatrix(api, browser);
    await exerciseRevocation({
      api,
      browser,
      mutation: { action: 'switch', account: 'teacher' },
      screenshot: true,
      source: 'moodle',
      trigger: 'broadcast',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: { action: 'logout' },
      source: 'gibbon',
      trigger: 'focus',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: { action: 'set_source_enabled', enabled: false, source: 'moodle' },
      source: 'moodle',
      trigger: 'visibility',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: { action: 'set_role_enabled', enabled: false, source: 'gibbon' },
      source: 'gibbon',
      trigger: 'focus',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: {
        action: 'set_authorization_enabled',
        enabled: false,
        relationship: 'moodle_enrol_instance',
      },
      source: 'moodle',
      trigger: 'focus',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: {
        action: 'set_authorization_enabled',
        enabled: false,
        relationship: 'gibbon_course_class',
      },
      source: 'gibbon',
      trigger: 'visibility',
    });
    await exerciseRevocation({
      api,
      browser,
      mutation: {
        action: 'set_authorization_enabled',
        enabled: false,
        relationship: 'gibbon_staff',
      },
      source: 'gibbon',
      trigger: 'focus',
    });
    await exerciseDelayedAccountSwitch(api, browser);
    await exerciseRefetchInvalidation(api, browser);
    await exerciseSignedOutBroadcast(api, browser);
    await exerciseEarlyProof(browser);
    await exerciseLeaseDeadline(api, browser);
    await exerciseBFCache(api, browser);
    await exerciseHandoffFailureDocuments(browser);
    await exerciseFailures(api, browser);
    await exerciseMissingPreprovisionedAccount(api, browser);
    await exerciseSPA(api, browser);
    console.log(
      JSON.stringify({
        accounts: 4,
        accessibility: {
          axe_serious_critical: 0,
          audited_surfaces: Object.keys(baselines).length,
        },
        bfcache_guarded: true,
        failures: 4,
        lifecycle: [
          'refresh',
          'preserved-login-reentry',
          'account-switch',
          'logout',
          'visibility',
          'focus',
          'broadcast',
          'bfcache-pageshow',
          'source-disable',
          'role-revocation',
          'moodle-enrol-instance-disable',
          'gibbon-course-class-revocation',
          'gibbon-staff-revocation',
          'delayed-account-switch',
          'refetch-null-invalidation',
          'signed-out-broadcast',
          'proof-before-domcontentloaded',
          'lease-expiry-25s',
          'handoff-public-failures',
          'missing-preprovisioned-account',
        ],
        sources: ['moodle', 'gibbon'],
        status: 'passed',
        vitals: baselines,
        viewports: 5,
      }),
    );
  } finally {
    await browser.close();
    await api.dispose();
  }
};

await main();
