#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const read = (path) => readFile(new URL(path, `file://${root}/`), 'utf8');

const requireSyntheticMode = () => {
  if (process.argv.length !== 3 || process.argv[2] !== '--synthetic') {
    throw new Error('usage: node e2e/p148-wechat-mobile-login.mjs --synthetic');
  }
};

class SyntheticTransaction {
  constructor({ browserCookie, tabBinding }) {
    this.authorizedUser = null;
    this.browserCookie = browserCookie;
    this.confirmedSwitch = false;
    this.issuedSession = null;
    this.state = 'pending';
    this.tabBinding = tabBinding;
  }

  authorize(user) {
    assert.equal(this.state, 'pending');
    this.authorizedUser = user;
    this.state = 'authorized';
  }

  consume({ browserCookie, confirmAccountSwitch, currentUser, tabBinding }) {
    assert.equal(browserCookie, this.browserCookie, 'browser cookie proof must match');
    assert.equal(tabBinding, this.tabBinding, 'tab proof must match');
    if (currentUser && currentUser !== this.authorizedUser && !confirmAccountSwitch) {
      return { state: 'account-switch-required' };
    }
    if (this.state === 'consumed') {
      return { session: this.issuedSession, state: 'recovered' };
    }
    assert.equal(this.state, 'authorized');
    this.confirmedSwitch = confirmAccountSwitch;
    this.issuedSession = 'better-auth-session-1';
    this.state = 'consumed';
    return { session: this.issuedSession, state: 'consumed' };
  }
}

const verifySourceBoundary = async () => {
  const signIn = await read('src/app/[variants]/(auth)/signin/useSignIn.ts');
  const plugin = await read('src/libs/better-auth/plugins/wechat-mobile-login/index.ts');
  const store = await read('src/libs/better-auth/plugins/wechat-mobile-login/transaction-store.ts');
  const bridge = await read('apps/wechat-login-bridge/controllers/login-controller.js');
  const bridgePage = await read('apps/wechat-login-bridge/pages/login/index.js');

  assert.match(signIn, /phase: 'prepared'/);
  assert.match(signIn, /window\.location\.assign\(target\)/);
  assert.ok(
    signIn.indexOf("phase: 'prepared'") < signIn.indexOf('window.location.assign(target)'),
    'the explicit open action must occur after transaction preparation',
  );
  assert.match(signIn, /sessionStorage\.setItem/);
  assert.doesNotMatch(signIn, /localStorage\.setItem\([\s\S]*openTarget/);
  assert.match(signIn, /addEventListener\('focus'/);
  assert.match(signIn, /addEventListener\('visibilitychange'/);
  assert.match(signIn, /kind: 'consume'/);
  assert.match(signIn, /retryWechatMobileLogin/);

  assert.match(plugin, /x-askcore-wechat-tab-binding/i);
  assert.match(plugin, /confirmAccountSwitch/);
  assert.match(plugin, /runWithTransaction/);
  assert.match(plugin, /setSessionCookie/);
  assert.match(
    plugin,
    /browserBindingMaxAge = options\.transactionTtlSeconds \+ options\.recoverySeconds/,
  );
  assert.match(plugin, /maxAge: browserBindingMaxAge/);
  assert.match(plugin, /WECHAT_IDENTITY_MAINTENANCE/);
  assert.match(plugin, /transaction\.state === 'authorizing' \? 'pending'/);
  assert.doesNotMatch(plugin, /openid[\s\S]*allowCreate/);

  assert.match(store, /WECHAT_MOBILE_TRANSACTION_TTL_SECONDS = 300/);
  assert.match(store, /issuedSessionId/);
  assert.match(store, /state: 'consumed'/);
  assert.match(store, /recoveryUntil/);

  assert.match(bridge, /wxApi\.login/);
  assert.match(bridgePage, /controller\.authorize\(wx, launch\)/);
  assert.match(bridge, /\[429, 502, 503\]/);
  assert.doesNotMatch(bridge, /AppSecret|session_key|access_token|refresh_token/i);
};

const verifyStateJourney = () => {
  const firstTab = {
    browserCookie: 'browser-cookie-a',
    tabBinding: 'tab-binding-a',
  };
  const transaction = new SyntheticTransaction(firstTab);

  transaction.authorize('account-b');

  assert.throws(
    () =>
      transaction.consume({
        ...firstTab,
        confirmAccountSwitch: false,
        currentUser: null,
        tabBinding: 'tab-binding-from-second-tab',
      }),
    /tab proof must match/,
  );

  assert.deepEqual(
    transaction.consume({
      ...firstTab,
      confirmAccountSwitch: false,
      currentUser: 'account-a',
    }),
    { state: 'account-switch-required' },
  );

  const committed = transaction.consume({
    ...firstTab,
    confirmAccountSwitch: true,
    currentUser: 'account-a',
  });
  assert.deepEqual(committed, {
    session: 'better-auth-session-1',
    state: 'consumed',
  });

  const lostResponseRecovery = transaction.consume({
    ...firstTab,
    confirmAccountSwitch: true,
    currentUser: 'account-a',
  });
  assert.deepEqual(lostResponseRecovery, {
    session: 'better-auth-session-1',
    state: 'recovered',
  });
};

requireSyntheticMode();
await verifySourceBoundary();
verifyStateJourney();
process.stdout.write('P148_WECHAT_MOBILE_LOGIN_SYNTHETIC_OK\n');
