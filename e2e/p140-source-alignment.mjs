import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, request as playwrightRequest } from '@playwright/test';
import axe from 'axe-core';
import sharp from 'sharp';

import { renderHandoffFailureDocument } from '../src/app/(backend)/api/askcore/school/handoff/document.ts';

const baseURL = (process.env.P140_BASE_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
const bridgeScreenshotDir = process.env.P140_BRIDGE_SCREENSHOT_DIR || '';
const screenshotPath = process.env.P140_GUARD_SCREENSHOT || '';
const sourceMobileNavVisualContract = JSON.parse(
  await fs.readFile(
    path.resolve(
      import.meta.dirname,
      '../../aitutor/spec/lms_sis/source_mobile_nav_visual_contract.json',
    ),
    'utf8',
  ),
);
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

const toComputedRgb = (hex) => {
  const value = hex.replace('#', '');
  return `rgb(${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(
    value.slice(2, 4),
    16,
  )}, ${Number.parseInt(value.slice(4, 6), 16)})`;
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

const returnBridgeState = (host) => {
  const shadow = host.shadowRoot;
  const actionLink = shadow?.querySelector('.row > a');
  const backIcon = shadow?.querySelector('.back');
  const homeIcon = shadow?.querySelector('.home');
  const label = shadow?.querySelector('.label');
  const mobileTabContainer = shadow?.querySelector('.mobile-tabs');
  const mobileTabs = [...(shadow?.querySelectorAll('.mobile-tabs a') || [])];
  const nav = shadow?.querySelector('nav');
  if (
    !shadow ||
    !actionLink ||
    !backIcon ||
    !homeIcon ||
    !label ||
    !mobileTabContainer ||
    !nav
  ) {
    return null;
  }
  const actionRect = actionLink.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const labelRect = label.getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();
  const mode = nav.classList.contains('settings-back') ? 'settings-back' : 'home';
  const mobileTabBar =
    mode === 'home' && getComputedStyle(mobileTabContainer).display !== 'none';
  const visibleIcon = mobileTabBar
    ? mobileTabs[1].querySelector('svg')
    : mode === 'settings-back'
      ? backIcon
      : homeIcon;
  const iconRect = visibleIcon.getBoundingClientRect();
  const labelStyle = getComputedStyle(label);
  const normalizeSvg = (svg) => ({
    attributes: {
      fill: svg.getAttribute('fill'),
      stroke: svg.getAttribute('stroke'),
      strokeLinecap: svg.getAttribute('stroke-linecap'),
      strokeLinejoin: svg.getAttribute('stroke-linejoin'),
      strokeWidth: Number(svg.getAttribute('stroke-width')),
      viewBox: svg.getAttribute('viewBox'),
    },
    nodes: [...svg.children].map((node) => ({
      attributes: Object.fromEntries(
        [...node.attributes]
          .filter(({ name }) => ['cx', 'cy', 'd', 'r'].includes(name))
          .map(({ name, value }) => [name, value]),
      ),
      tag: node.tagName.toLowerCase(),
    })),
  });
  return {
    action: actionRect.width,
    actionLabel: actionLink.getAttribute('aria-label'),
    ariaHidden: host.getAttribute('aria-hidden'),
    background: getComputedStyle(nav).backgroundColor,
    centeredTitleDelta: Math.abs(
      labelRect.left + labelRect.width / 2 - (navRect.left + navRect.width / 2),
    ),
    fixedBottom: window.innerHeight - hostRect.bottom,
    fixedTop: hostRect.top,
    fontSize: labelStyle.fontSize,
    fontWeight: labelStyle.fontWeight,
    height: hostRect.height,
    href: actionLink.getAttribute('href'),
    icon: iconRect.width,
    inert: host.hasAttribute('inert'),
    label: label.textContent,
    mobileTabs: mobileTabs.map((tab) => {
      const icon = tab.querySelector('svg');
      const tabLabel = tab.querySelector('span');
      const tabRect = tab.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const tabLabelRect = tabLabel.getBoundingClientRect();
      const tabStyle = getComputedStyle(tab);
      const tabLabelStyle = getComputedStyle(tabLabel);
      return {
        active: tab.getAttribute('aria-current'),
        actionLabel: tab.getAttribute('aria-label'),
        color: tabStyle.color,
        gap: tabStyle.gap,
        height: tabRect.height,
        href: tab.getAttribute('href'),
        iconFill: getComputedStyle(icon).fill,
        iconHeight: iconRect.height,
        iconWidth: iconRect.width,
        iconX: iconRect.x - navRect.x,
        iconY: iconRect.y - navRect.y,
        key: tab.getAttribute('data-tab'),
        label: tabLabel?.textContent,
        labelFontFeatureSettings: tabLabelStyle.fontFeatureSettings,
        labelFontFamily: tabLabelStyle.fontFamily,
        labelFontKerning: tabLabelStyle.fontKerning,
        labelFontSize: tabLabelStyle.fontSize,
        labelFontSynthesis: tabLabelStyle.fontSynthesis,
        labelHeight: tabLabelRect.height,
        labelLineHeight: tabLabelStyle.lineHeight,
        labelMarginBlockStart: tabLabelStyle.marginBlockStart,
        labelTextRendering: tabLabelStyle.textRendering,
        labelWebkitFontSmoothing: tabLabelStyle.webkitFontSmoothing,
        labelWidth: tabLabelRect.width,
        labelX: tabLabelRect.x - navRect.x,
        labelY: tabLabelRect.y - navRect.y,
        svg: normalizeSvg(icon),
        width: tabRect.width,
        x: tabRect.x - navRect.x,
        y: tabRect.y - navRect.y,
      };
    }),
    mobileTabsBackground: getComputedStyle(nav).backgroundColor,
    mobileTabsBorderColor: getComputedStyle(nav).borderTopColor,
    mobileTabsBorderWidth: getComputedStyle(nav).borderTopWidth,
    mode,
    navigationLabel: nav.getAttribute('aria-label'),
    presentation: mobileTabBar ? 'mobile-tabs' : mode,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
  };
};

const assertReturnBridge = async (page, source, message = 'source return bridge') => {
  await page.waitForFunction(() => document.querySelector('#askcore-source-return-bridge')?.shadowRoot);
  assert(
    (await page.locator('#askcore-source-return-bridge').count()) === 1,
    `${message} is not unique`,
  );
  const state = await page.locator('#askcore-source-return-bridge').evaluate(returnBridgeState);
  assert(state, `${message} shadow content is incomplete`);
  const mobile = (page.viewportSize()?.width || 1440) <= 767;
  const gibbon = source === 'gibbon';
  const mobileSchool = mobile && !gibbon;
  if (mobileSchool) {
    const contract = sourceMobileNavVisualContract;
    const { layout } = contract;
    assert(state.presentation === 'mobile-tabs', `${message} did not retain the mobile tab bar`);
    assert(
      state.fixedBottom === 0 && state.height === layout.barHeight,
      `${message} is not fixed at the exact contract height`,
    );
    assert(state.icon === layout.iconSize, `${message} mobile tab icon token drifted`);
    assert(
      state.mobileTabs.every(
        (tab) => tab.width === layout.itemSize && tab.height === layout.itemSize,
      ),
      `${message} mobile tab action geometry drifted`,
    );
    assert(
      state.mobileTabs.every((tab) => tab.gap === `${layout.itemGap}px`),
      `${message} mobile tab gap drifted`,
    );
    assert(
      state.mobileTabs.every((tab) => tab.labelFontSize === `${layout.labelFontSize}px`),
      `${message} mobile tab label size drifted`,
    );
    assert(
      state.mobileTabs.every(
        (tab) =>
          tab.labelFontFamily === layout.labelFontFamily &&
          tab.labelFontFeatureSettings === layout.labelFontFeatureSettings &&
          tab.labelFontKerning === layout.labelFontKerning &&
          tab.labelFontSynthesis === layout.labelFontSynthesis &&
          tab.labelTextRendering === layout.labelTextRendering &&
          tab.labelWebkitFontSmoothing === layout.labelWebkitFontSmoothing,
      ),
      `${message} mobile tab font rendering drifted`,
    );
    assert(
      state.mobileTabs.every(
        (tab) =>
          tab.labelLineHeight === `${layout.labelFontSize * layout.labelLineHeightEm}px`,
      ),
      `${message} mobile tab label line height drifted`,
    );
    assert(
      state.mobileTabs.every(
        (tab) =>
          tab.labelMarginBlockStart ===
          `${layout.labelFontSize * layout.labelMarginBlockStartEm}px`,
      ),
      `${message} mobile tab label offset drifted`,
    );
    assert(
      JSON.stringify(state.mobileTabs.map(({ svg }) => svg)) ===
        JSON.stringify(
          contract.items.map((item) => ({
            attributes: contract.svg,
            nodes: item.nodes,
          })),
        ),
      `${message} Lucide SVG geometry drifted`,
    );
    const palette = state.prefersDark ? contract.theme.dark : contract.theme.light;
    assert(
      state.mobileTabsBackground === toComputedRgb(palette.background),
      `${message} mobile background token drifted: ${state.mobileTabsBackground}`,
    );
    assert(
      state.mobileTabsBorderColor === palette.border,
      `${message} mobile border token drifted: ${state.mobileTabsBorderColor}`,
    );
    assert(state.mobileTabsBorderWidth === '1px', `${message} mobile border width drifted`);
    const activeTab = state.mobileTabs.find(({ active }) => active === 'page');
    const inactiveTab = state.mobileTabs.find(({ active }) => active === null);
    assert(
      activeTab?.color === toComputedRgb(palette.active),
      `${message} mobile active token drifted: ${activeTab?.color}`,
    );
    assert(
      inactiveTab?.color === toComputedRgb(palette.inactive),
      `${message} mobile inactive token drifted: ${inactiveTab?.color}`,
    );
    assert(
      activeTab?.iconFill !== inactiveTab?.iconFill &&
        inactiveTab?.iconFill === 'rgba(0, 0, 0, 0)',
      `${message} mobile active icon fill drifted`,
    );
    assert(
      JSON.stringify(
        state.mobileTabs.map(({ active, actionLabel, href, key, label }) => ({
          active,
          actionLabel,
          href,
          key,
          label,
        })),
      ) ===
        JSON.stringify([
          {
            active: null,
            actionLabel: '会话',
            href: '/agent',
            key: 'chat',
            label: '会话',
          },
          {
            active: 'page',
            actionLabel: '学校',
            href: '/school',
            key: 'school',
            label: '学校',
          },
          {
            active: null,
            actionLabel: '我',
            href: '/me',
            key: 'me',
            label: '我',
          },
        ]),
      `${message} mobile navigation drifted`,
    );
  } else {
    assert(state.presentation === (gibbon ? 'settings-back' : 'home'), `${message} mode drifted`);
    assert(state.fixedTop === 0 && state.height === 44, `${message} is not fixed at the source top`);
    assert(state.action === (mobile ? 36 : 28), `${message} action token drifted`);
    assert(state.icon === (mobile ? 22 : 16), `${message} icon token drifted`);
  }
  const expectedHref = gibbon ? (mobile ? '/me/settings' : '/settings') : '/';
  if (!mobileSchool) {
    assert(state.href === expectedHref, `${message} destination drifted: ${state.href}`);
  }
  assert(state.mode === (gibbon ? 'settings-back' : 'home'), `${message} mode drifted`);
  assert(
    state.label === (gibbon ? 'School Affairs' : 'School / Learning Space'),
    `${message} label drifted`,
  );
  assert(
    state.navigationLabel === (gibbon ? 'School Affairs' : 'AskCore navigation'),
    `${message} navigation has no name`,
  );
  assert(
    state.actionLabel === (gibbon ? 'Back' : 'Return to AskCore home'),
    `${message} action has no name`,
  );
  assert(!state.inert && state.ariaHidden === null, `${message} was covered by source guard`);
  if (!mobileSchool) {
    assert(state.fontSize === (gibbon ? '16px' : '12px'), `${message} type token drifted`);
  }
  if (gibbon) {
    assert(state.fontWeight === '500', `${message} desktop title weight drifted`);
    if (mobile) {
      assert(state.centeredTitleDelta <= 1, `${message} mobile title is not centered`);
    }
  }
  const focusSelector = mobileSchool ? '[data-tab="school"]' : '.row > a';
  await page.locator('#askcore-source-return-bridge').evaluate((host, selector) => {
    host.shadowRoot.querySelector(selector).focus();
  }, focusSelector);
  assert(
    await page.locator('#askcore-source-return-bridge').evaluate(
      (host, selector) => host.shadowRoot.activeElement === host.shadowRoot.querySelector(selector),
      focusSelector,
    ),
    `${message} return action is not keyboard focusable`,
  );
  return state;
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
    ariaHidden:
      node.closest('[inert][aria-hidden="true"]')?.getAttribute('aria-hidden') ?? null,
    inert: Boolean(node.closest('[inert][aria-hidden="true"]')),
  }));
  assert(state.account === role, `${source} source session did not align to ${role}`);
  assert(state.ariaHidden === null && !state.inert, `${source} content stayed covered`);
  assert((await page.locator('#source-action').getAttribute('aria-label')) === null, 'unexpected label');
  assert((await page.locator('#source-action').textContent()) === 'Source action', 'missing control name');
  await assertReturnBridge(page, source, `${source} return bridge`);
};

const assertCovered = async (page, source, message) => {
  await page.waitForFunction(() => {
    const content = document.querySelector('#source-content');
    return Boolean(content?.closest('[inert][aria-hidden="true"]'));
  });
  const covered = await page.locator('#source-content').evaluate((node) => ({
    ariaHidden:
      node.closest('[inert][aria-hidden="true"]')?.getAttribute('aria-hidden') ?? null,
    inert: Boolean(node.closest('[inert][aria-hidden="true"]')),
  }));
  assert(covered.inert && covered.ariaHidden === 'true', message);
  await assertReturnBridge(page, source, `${message} return bridge`);
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
    await broadcastSchoolSessionMessage(page, { reason: 'account-changed' });
    return;
  }
  throw new Error(`unknown trigger ${trigger}`);
};

const broadcastGeneration = async (page, generationHash, sessionState) => {
  await broadcastSchoolSessionMessage(page, {
    generationHash,
    sessionState,
    type: 'generation-changed',
  });
};

const broadcastSchoolSessionMessage = async (page, message) => {
  const sender = await page.context().newPage();
  try {
    await sender.goto(`${baseURL}/__p140/start`, { waitUntil: 'domcontentloaded' });
    await sender.evaluate(async (value) => {
      const channel = new BroadcastChannel('askcore-school-session-v1');
      channel.postMessage(value);
      await new Promise((resolve) => setTimeout(resolve, 50));
      channel.close();
    }, message);
  } finally {
    await sender.close();
  }
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
  await assertCovered(page, source, `${source} ${mutation.action} exposed stale content`);
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
  await assertCovered(
    page,
    'moodle',
    'delayed student proof exposed the old page after switching to teacher',
  );
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
    await assertCovered(page, 'moodle', 'Better Auth refetch did not immediately cover Account A');
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
        const protectedAncestor = content?.closest('[inert][aria-hidden="true"]');
        if (
          document.documentElement.classList.contains('askcore-session-pending') &&
          protectedAncestor
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
        const protectedAncestor = content?.closest('[inert][aria-hidden="true"]');
        console.log(
          `P140_BFCACHE_GUARD ${event.persisted} ${Boolean(protectedAncestor)} ${
            protectedAncestor?.getAttribute('aria-hidden') === 'true'
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

const exerciseReturnBridgeVisuals = async (api, browser) => {
  const cases = [
    {
      colorScheme: 'light',
      name: 'moodle-desktop-light',
      source: 'moodle',
      viewport: { height: 900, width: 1440 },
    },
    {
      colorScheme: 'dark',
      name: 'gibbon-desktop-dark',
      source: 'gibbon',
      viewport: { height: 900, width: 1440 },
    },
    {
      colorScheme: 'light',
      name: 'moodle-mobile-light',
      source: 'moodle',
      viewport: { height: 844, width: 390 },
    },
    {
      colorScheme: 'light',
      name: 'gibbon-mobile-light',
      source: 'gibbon',
      viewport: { height: 844, width: 390 },
    },
  ];
  for (const visual of cases) {
    await control(api, { action: 'reset' });
    const context = await browser.newContext({
      colorScheme: visual.colorScheme,
      viewport: visual.viewport,
    });
    const page = await context.newPage();
    try {
      await openSource(page, visual.source);
      await page.goto(`${baseURL}/__p140/source/${visual.source}/deep?fixture-role=student`);
      await page.waitForFunction(() =>
        document.documentElement.classList.contains('askcore-session-ready'),
      );
      const state = await assertReturnBridge(
        page,
        visual.source,
        `${visual.name} return bridge`,
      );
      if (visual.colorScheme === 'dark') {
        assert(
          state.background === 'rgb(31, 32, 36)',
          `dark return bridge background drifted: ${state.background}`,
        );
      }
      if (bridgeScreenshotDir) {
        await fs.mkdir(bridgeScreenshotDir, { recursive: true });
        await page.screenshot({
          path: path.join(bridgeScreenshotDir, `${visual.name}.png`),
        });
      }
      if (visual.name !== 'moodle-mobile-light') {
        await page.locator('#askcore-source-return-bridge .row > a').hover();
        const hoverBackground = await page
          .locator('#askcore-source-return-bridge')
          .evaluate((host) =>
            getComputedStyle(host.shadowRoot.querySelector('.row > a')).backgroundColor,
          );
        assert(
          hoverBackground ===
            (visual.colorScheme === 'dark' ? 'rgb(48, 50, 56)' : 'rgb(233, 234, 237)'),
          `${visual.name} hover state drifted: ${hoverBackground}`,
        );
        if (bridgeScreenshotDir) {
          await page.screenshot({
            path: path.join(bridgeScreenshotDir, `${visual.name}-hover.png`),
          });
        }
      }
      if (
        visual.name === 'moodle-desktop-light' ||
        visual.name === 'moodle-mobile-light' ||
        visual.name === 'gibbon-desktop-dark' ||
        visual.name === 'gibbon-mobile-light'
      ) {
        const mobileMoodle = visual.source === 'moodle' && visual.viewport.width <= 767;
        const expectedPath =
          mobileMoodle
            ? '/agent'
            : visual.source === 'moodle'
              ? '/'
            : visual.viewport.width <= 767
              ? '/me/settings'
              : '/settings';
        await page
          .locator(
            mobileMoodle
              ? '#askcore-source-return-bridge [data-tab="chat"]'
              : '#askcore-source-return-bridge .row > a',
          )
          .click();
        await page.waitForURL(
          (url) =>
            expectedPath === '/'
              ? url.href === `${baseURL}/`
              : url.pathname.startsWith(expectedPath),
        );
      }
    } finally {
      await context.close();
    }
  }

  const { context, page } = await createPage(browser);
  try {
    await page.goto(`${baseURL}/__p140/unbound-source`);
    assert(
      (await page.locator('#askcore-source-return-bridge').count()) === 0,
      'return bridge leaked onto an unbound source page',
    );
  } finally {
    await context.close();
  }
};

const exerciseMoodleMobileEndClearance = async (api, browser) => {
  for (const width of [320, 390, 767]) {
    await control(api, { action: 'reset' });
    const { context, page } = await createPage(browser, { height: 844, width });
    try {
      await openSource(page, 'moodle');
      const state = await page.evaluate(() => {
        const wrapper = document.querySelector('#page-wrapper');
        const end = document.querySelector('#source-end');
        const bridge = document.querySelector('#askcore-source-return-bridge');
        const spacer = document.querySelector('#askcore-source-mobile-content-spacer');
        if (!(wrapper instanceof HTMLElement) || !end || !bridge) return null;
        wrapper.scrollTop = wrapper.scrollHeight;
        const endRect = end.getBoundingClientRect();
        const bridgeRect = bridge.getBoundingClientRect();
        return {
          bridgeHeight: bridgeRect.height,
          clearance: bridgeRect.top - endRect.bottom,
          spacerCount: document.querySelectorAll(
            '#askcore-source-mobile-content-spacer',
          ).length,
          spacerHeight: spacer?.getBoundingClientRect().height || 0,
        };
      });
      assert(state, `Moodle end-clearance fixture missing at ${width}px`);
      assert(state.bridgeHeight === 48, `Moodle navigation height drifted at ${width}px`);
      assert(state.spacerCount === 1, `Moodle spacer count drifted at ${width}px`);
      assert(state.spacerHeight === 56, `Moodle spacer height drifted at ${width}px`);
      assert(state.clearance >= 8, `Moodle final content is covered at ${width}px`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() =>
        document.documentElement.classList.contains('askcore-session-ready'),
      );
      assert(
        (await page.locator('#askcore-source-mobile-content-spacer').count()) === 1,
        `Moodle reload duplicated its spacer at ${width}px`,
      );
      await page.goto(
        `${baseURL}/__p140/source/moodle?fixture-role=student&fixture-modal=1`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction(() =>
        document.documentElement.classList.contains('askcore-session-ready'),
      );
      const overlayState = await page.evaluate(() => {
        const bridge = document.querySelector('#askcore-source-return-bridge');
        const dialog = document.querySelector('.modal.show .modal-dialog');
        const body = document.querySelector('.modal.show .modal-body');
        const action = document.querySelector('.modal.show .modal-footer button');
        if (
          !(bridge instanceof HTMLElement) ||
          !(dialog instanceof HTMLElement) ||
          !(body instanceof HTMLElement) ||
          !(action instanceof HTMLElement)
        ) {
          return null;
        }
        body.scrollTop = body.scrollHeight;
        const bridgeRect = bridge.getBoundingClientRect();
        const dialogRect = dialog.getBoundingClientRect();
        const actionRect = action.getBoundingClientRect();
        return {
          actionClearance: bridgeRect.top - actionRect.bottom,
          bodyScrollable: body.scrollHeight > body.clientHeight,
          dialogClearance: bridgeRect.top - dialogRect.bottom,
        };
      });
      assert(overlayState, `Moodle activity chooser fixture missing at ${width}px`);
      assert(
        overlayState.bodyScrollable,
        `Moodle activity chooser body stopped scrolling at ${width}px`,
      );
      assert(
        overlayState.actionClearance >= 8,
        `Moodle activity chooser action is covered at ${width}px`,
      );
      assert(
        overlayState.dialogClearance >= 8,
        `Moodle activity chooser viewport is covered at ${width}px`,
      );
    } finally {
      await context.close();
    }
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
    const nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      const action = new URL(this.action, location.href);
      if (
        action.pathname === '/school/services/askcore/handoff.php' ||
        action.pathname === '/school/teaching/local/askcore/handoff.php'
      ) {
        const grant = new FormData(this).get('grant');
        globalThis.__p140SourceSubmit = {
          action: action.pathname,
          beforePath: location.pathname,
          grant,
        };
        return;
      }
      return nativeSubmit.call(this);
    };
  });
  await page.addInitScript(vitalsObserver);
  try {
    await page.goto(`${baseURL}${routePath}?fixture-role=administrator`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => Boolean(globalThis.__p140SourceSubmit));
    const submission = await page.evaluate(() => globalThis.__p140SourceSubmit);
    const expectedAction =
      routePath === '/settings/school-affairs'
        ? '/school/services/askcore/handoff.php'
        : '/school/teaching/local/askcore/handoff.php';
    assert(submission.action === expectedAction, `${routePath} selected the wrong source action`);
    assert(submission.beforePath === routePath, `${routePath} exposed a handoff intermediary`);
    assert(
      /^[\w-]+\.[\w-]+\.[\w-]+$/.test(submission.grant),
      `${routePath} did not prepare a bounded handoff grant`,
    );
    assert(page.url().includes(routePath), `${routePath} left the current UI before source submit`);
    assert(
      (await page.locator(`form[action="${expectedAction}"]`).count()) === 0,
      `${routePath} retained a transient grant form`,
    );
    assert(
      !(await page.locator('body').innerText()).includes(submission.grant),
      `${routePath} exposed the grant in visible or accessible text`,
    );
    const leaked = await page.evaluate((grant) => ({
      local: Object.values(localStorage).includes(grant),
      query: location.href.includes(grant),
      session: Object.values(sessionStorage).includes(grant),
    }), submission.grant);
    assert(
      !leaked.local && !leaked.query && !leaked.session,
      `${routePath} persisted or placed the grant in the URL`,
    );

    const status = page.getByRole('status');
    await status.waitFor();
    assert((await status.getAttribute('aria-live')) === 'polite', `${routePath} status is not live`);
    const statusBox = await status.boundingBox();
    assert(
      statusBox && statusBox.width <= 1 && statusBox.height <= 1,
      `${routePath} rendered a visible handoff intermediary`,
    );
    assert(
      (await page.getByRole('button', { name: /continue|继续|重试|retry/i }).count()) === 0,
      `${routePath} requires a visible handoff confirmation`,
    );

    const animation = await status.evaluate((node) => {
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
    const axeResult = await status.evaluate(async (node) => {
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
    assert(
      metrics.lcp === 0 || metrics.lcp <= 2500,
      `${routePath} LCP ${metrics.lcp}ms`,
    );
    assert(metrics.cls <= 0.1, `${routePath} CLS ${metrics.cls}`);
    assert(metrics.inp === null || metrics.inp <= 200, `${routePath} INP ${metrics.inp}ms`);
    return { axe: axeResult.length, ...metrics };
  } finally {
    await context.close();
  }
};

const exerciseBuiltSidebarActivation = async (browser) => {
  if (
    process.env.P140_CHECK_SPA !== '1' ||
    process.env.P140_SPA_VARIANT === 'mobile'
  ) {
    return;
  }
  const context = await browser.newContext({ viewport: { height: 900, width: 1440 } });
  const page = await context.newPage();
  let preparations = 0;
  await page.route('**/api/askcore/school/handoff', async (route) => {
    preparations += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.addInitScript(() => {
    const nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      const action = new URL(this.action, location.href);
      if (action.pathname === '/school/teaching/local/askcore/handoff.php') {
        globalThis.__p140SourceSubmit = {
          action: action.pathname,
          beforePath: location.pathname,
        };
        return;
      }
      return nativeSubmit.call(this);
    };
  });
  try {
    await page.goto(`${baseURL}/?fixture-role=student`, { waitUntil: 'domcontentloaded' });
    const schoolEntry = page.locator('a[href="/school"]:visible').first();
    await schoolEntry.waitFor();
    await schoolEntry.click();
    await schoolEntry.click();
    await page.waitForFunction(() => Boolean(globalThis.__p140SourceSubmit));
    const submission = await page.evaluate(() => globalThis.__p140SourceSubmit);
    assert(submission.beforePath === '/', 'sidebar activation displayed the /school intermediary');
    assert(page.url().includes('/?fixture-role=student'), 'sidebar activation replaced the AskCore UI');
    assert(preparations === 1, `repeated sidebar activation prepared ${preparations} handoffs`);
  } finally {
    await context.close();
  }
};

const builtMobileNavState = (footer) => {
  const inner = footer.firstElementChild;
  const tabs = [...(inner?.children || [])];
  const barRect = footer.getBoundingClientRect();
  const normalizeSvg = (svg) => ({
    attributes: {
      fill: svg.getAttribute('fill'),
      stroke: svg.getAttribute('stroke'),
      strokeLinecap: svg.getAttribute('stroke-linecap'),
      strokeLinejoin: svg.getAttribute('stroke-linejoin'),
      strokeWidth: Number(svg.getAttribute('stroke-width')),
      viewBox: svg.getAttribute('viewBox'),
    },
    nodes: [...svg.children].map((node) => ({
      attributes: Object.fromEntries(
        [...node.attributes]
          .filter(({ name }) => ['cx', 'cy', 'd', 'r'].includes(name))
          .map(({ name, value }) => [name, value]),
      ),
      tag: node.tagName.toLowerCase(),
    })),
  });
  return {
    background: getComputedStyle(footer).backgroundColor,
    borderColor: getComputedStyle(footer).borderTopColor,
    borderWidth: getComputedStyle(footer).borderTopWidth,
    height: barRect.height,
    tabs: tabs.map((tab) => {
      const icon = tab.querySelector('svg');
      const label = tab.lastElementChild;
      const tabRect = tab.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const tabStyle = getComputedStyle(tab);
      const labelStyle = getComputedStyle(label);
      return {
        color: tabStyle.color,
        gap: tabStyle.gap,
        height: tabRect.height,
        iconFill: getComputedStyle(icon).fill,
        iconHeight: iconRect.height,
        iconWidth: iconRect.width,
        iconX: iconRect.x - barRect.x,
        iconY: iconRect.y - barRect.y,
        label: label.textContent,
        labelFontFeatureSettings: labelStyle.fontFeatureSettings,
        labelFontFamily: labelStyle.fontFamily,
        labelFontKerning: labelStyle.fontKerning,
        labelFontSize: labelStyle.fontSize,
        labelFontSynthesis: labelStyle.fontSynthesis,
        labelHeight: labelRect.height,
        labelLineHeight: labelStyle.lineHeight,
        labelMarginBlockStart: labelStyle.marginBlockStart,
        labelTextRendering: labelStyle.textRendering,
        labelWebkitFontSmoothing: labelStyle.webkitFontSmoothing,
        labelWidth: labelRect.width,
        labelX: labelRect.x - barRect.x,
        labelY: labelRect.y - barRect.y,
        svg: normalizeSvg(icon),
        width: tabRect.width,
        x: tabRect.x - barRect.x,
        y: tabRect.y - barRect.y,
      };
    }),
    width: barRect.width,
  };
};

const assertClose = (actual, expected, message, tolerance = 0.25) => {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
};

const compareMobileNavGeometry = (actual, source, mode) => {
  assertClose(source.height, actual.height, `${mode} bar height`);
  assert(source.mobileTabsBackground === actual.background, `${mode} background drifted`);
  assert(source.mobileTabsBorderColor === actual.borderColor, `${mode} border color drifted`);
  assert(source.mobileTabsBorderWidth === actual.borderWidth, `${mode} border width drifted`);
  assert(actual.tabs.length === source.mobileTabs.length, `${mode} tab count drifted`);
  for (let index = 0; index < actual.tabs.length; index += 1) {
    const reference = actual.tabs[index];
    const candidate = source.mobileTabs[index];
    for (const key of [
      'height',
      'iconHeight',
      'iconWidth',
      'iconX',
      'iconY',
      'labelHeight',
      'labelWidth',
      'labelX',
      'labelY',
      'width',
      'x',
      'y',
    ]) {
      assertClose(candidate[key], reference[key], `${mode} tab ${index} ${key}`);
    }
    for (const key of [
      'gap',
      'label',
      'labelFontFeatureSettings',
      'labelFontFamily',
      'labelFontKerning',
      'labelFontSize',
      'labelFontSynthesis',
      'labelLineHeight',
      'labelMarginBlockStart',
      'labelTextRendering',
      'labelWebkitFontSmoothing',
    ]) {
      assert(
        candidate[key] === reference[key],
        `${mode} tab ${index} ${key}: ${candidate[key]} != ${reference[key]}`,
      );
    }
    assert(
      JSON.stringify(candidate.svg) === JSON.stringify(reference.svg),
      `${mode} tab ${index} SVG drifted`,
    );
  }
  for (let index = 0; index < actual.tabs.length; index += 1) {
    assert(
      source.mobileTabs[index].color === actual.tabs[index].color,
      `${mode} tab ${index} color drifted`,
    );
    assert(
      source.mobileTabs[index].iconFill === actual.tabs[index].iconFill,
      `${mode} tab ${index} fill drifted`,
    );
  }
};

const screenshotDifferenceRatio = async (reference, candidate) => {
  const [referenceImage, candidateImage] = await Promise.all([
    sharp(reference).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(candidate).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  assert(
    referenceImage.info.width === candidateImage.info.width &&
      referenceImage.info.height === candidateImage.info.height,
    'mobile navigation screenshots have different dimensions',
  );
  let differentPixels = 0;
  const { data: referencePixels } = referenceImage;
  const { data: candidatePixels } = candidateImage;
  for (let offset = 0; offset < referencePixels.length; offset += 4) {
    let different = false;
    for (let channel = 0; channel < 4; channel += 1) {
      if (Math.abs(referencePixels[offset + channel] - candidatePixels[offset + channel]) > 8) {
        different = true;
        break;
      }
    }
    if (different) differentPixels += 1;
  }
  return differentPixels / (referenceImage.info.width * referenceImage.info.height);
};

const exerciseMobileNavVisualParity = async (api, browser) => {
  if (
    process.env.P140_CHECK_SPA !== '1' ||
    process.env.P140_SPA_VARIANT !== 'mobile'
  ) {
    return [];
  }
  const results = [];
  for (const colorScheme of ['light', 'dark']) {
    await control(api, { action: 'reset' });
    const context = await browser.newContext({
      colorScheme,
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ' +
        'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 ' +
        'Mobile/15E148 Safari/604.1',
      viewport: { height: 844, width: 390 },
    });
    try {
      const appPage = await context.newPage();
      await appPage.goto(`${baseURL}/me?fixture-role=student`, {
        waitUntil: 'domcontentloaded',
      });
      const footer = appPage.locator('footer').last();
      await footer.waitFor();
      await appPage.evaluate(() => document.fonts.ready);
      const actual = await footer.evaluate(builtMobileNavState);
      const actualScreenshot = await footer.screenshot();

      const sourcePage = await context.newPage();
      await openSource(sourcePage, 'moodle');
      const sourceHost = sourcePage.locator('#askcore-source-return-bridge');
      await sourceHost.evaluate((host) => {
        const tabs = host.shadowRoot.querySelectorAll('.mobile-tabs a');
        tabs.forEach((tab) => tab.removeAttribute('aria-current'));
        host.shadowRoot.querySelector('[data-tab="me"]').setAttribute('aria-current', 'page');
        host.shadowRoot.activeElement?.blur();
      });
      await sourcePage.evaluate(() => document.fonts.ready);
      const source = await sourceHost.evaluate(returnBridgeState);
      compareMobileNavGeometry(actual, source, colorScheme);
      const sourceScreenshot = await sourceHost.screenshot();
      const differenceRatio = await screenshotDifferenceRatio(
        actualScreenshot,
        sourceScreenshot,
      );
      assert(
        differenceRatio <= sourceMobileNavVisualContract.screenshotMaxDifferentPixelRatio,
        `${colorScheme} mobile navigation screenshot difference ${differenceRatio}`,
      );
      if (bridgeScreenshotDir) {
        await fs.mkdir(bridgeScreenshotDir, { recursive: true });
        await Promise.all([
          fs.writeFile(
            path.join(bridgeScreenshotDir, `lobehub-mobile-${colorScheme}.png`),
            actualScreenshot,
          ),
          fs.writeFile(
            path.join(bridgeScreenshotDir, `moodle-mobile-${colorScheme}-parity.png`),
            sourceScreenshot,
          ),
        ]);
      }
      results.push({ colorScheme, differenceRatio });
    } finally {
      await context.close();
    }
  }
  return results;
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
    executablePath: process.env.P140_CHROMIUM_EXECUTABLE || chromium.executablePath(),
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
    await exerciseBuiltSidebarActivation(browser);
    const mobileNavParity = await exerciseMobileNavVisualParity(api, browser);
    await exerciseMatrix(api, browser);
    await exerciseReturnBridgeVisuals(api, browser);
    await exerciseMoodleMobileEndClearance(api, browser);
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
          'invisible-handoff',
          'serialized-repeated-activation',
          'source-return-bridge',
          'source-return-bridge-covered',
          'source-return-bridge-unbound-absent',
          'moodle-mobile-end-clearance',
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
        mobile_nav_parity: mobileNavParity,
        sources: ['moodle', 'gibbon'],
        source_return_bridges: 2,
        status: 'passed',
        visible_handoff_intermediaries: 0,
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
