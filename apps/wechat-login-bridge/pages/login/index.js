/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */

const controller = require('../../controllers/login-controller');

let launch = null;
let handledLaunchVersion = 0;

const hasLaunchFields = (options) =>
  options &&
  ['p', 't', 'c'].some(
    (key) => Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined,
  );

Page({
  data: {
    actionText: '确认登录',
    busy: false,
    detail: '请返回 AskCore 重新登录。',
    invalid: true,
    status: 'failed',
    title: '登录链接已失效',
  },

  applyLaunchOptions(options) {
    if (!hasLaunchFields(options)) {
      launch = null;
      this.setData({
        busy: false,
        detail: '请返回 AskCore 重新登录。',
        invalid: true,
        status: 'failed',
        title: '登录链接已失效',
      });
      return;
    }
    try {
      launch = controller.parseLaunchOptions(options);
      if (launch.purpose === 'rebind') {
        this.setData({
          actionText: '确认验证',
          busy: false,
          detail: '点击确认后，请返回原浏览器查看结果。',
          invalid: false,
          status: 'ready',
          title: '确认微信身份',
        });
      } else {
        this.setData({
          actionText: '重新登录',
          busy: false,
          detail: '请稍候。',
          invalid: false,
          status: 'ready',
          title: '正在登录 AskCore',
        });
      }
    } catch {
      launch = null;
      this.setData({
        busy: false,
        detail: '请返回原浏览器，重新点击微信登录。',
        invalid: true,
        status: 'failed',
        title: '登录链接已失效',
      });
    }
  },

  onLoad(options) {
    const pending = getApp().globalData.wechatLaunch;
    handledLaunchVersion = (pending && pending.version) || 0;
    // A cold Scheme launch can reach App.onShow before Page.onLoad. Some
    // launch paths omit the query from Page options, so retain the App query.
    this.applyLaunchOptions(hasLaunchFields(options) ? options : pending?.options || options);
    if (pending) pending.options = null;
    if (launch && launch.purpose === 'signin') void this.onAuthorize();
  },

  onShow() {
    const pending = getApp().globalData.wechatLaunch;
    if (!pending || !pending.options || pending.version <= handledLaunchVersion) return;
    handledLaunchVersion = pending.version;
    this.applyLaunchOptions(pending.options);
    pending.options = null;
    if (launch && launch.purpose === 'signin') void this.onAuthorize();
  },

  async onAuthorize() {
    if (!launch || this.data.busy || this.data.status !== 'ready') return;
    const currentLaunch = launch;
    this.setData({ busy: true, status: 'authorizing' });
    try {
      const maxAttempts = currentLaunch.purpose === 'signin' ? 2 : 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          await controller.authorize(wx, currentLaunch);
          break;
        } catch (error) {
          if (launch !== currentLaunch) return;
          const retryable = ['askcore_unavailable', 'wx_login_failed'].includes(error.message);
          if (!retryable || attempt + 1 >= maxAttempts) throw error;
        }
      }
      if (launch !== currentLaunch) return;
      launch = null;
      const returnToWebView =
        currentLaunch.purpose === 'signin' && currentLaunch.returnToWebView;
      this.setData({
        busy: false,
        detail:
          currentLaunch.purpose === 'rebind'
            ? '请返回原浏览器查看结果。'
            : returnToWebView
              ? '正在返回 AskCore。'
              : '请返回原浏览器，继续使用 AskCore。',
        status: 'authorized',
        title: currentLaunch.purpose === 'rebind' ? '身份验证已提交' : 'AskCore 登录成功',
      });
      if (returnToWebView) {
        wx.navigateBack({
          delta: 1,
          fail: () => this.setData({ detail: '请返回 AskCore 首页继续使用。' }),
        });
      }
    } catch (error) {
      if (launch !== currentLaunch) return;
      const retryable = ['askcore_unavailable', 'wx_login_failed'].includes(error.message);
      if (!retryable) launch = null;
      const isRebind = currentLaunch.purpose === 'rebind';
      this.setData({
        actionText: retryable ? (isRebind ? '重新验证' : '重新登录') : this.data.actionText,
        busy: false,
        detail: retryable
          ? '请稍后重试；仍失败请返回原浏览器。'
          : error.message === 'maintenance'
            ? '请稍后返回原浏览器重试。'
            : '请返回原浏览器重新发起操作。',
        invalid: !retryable,
        status: retryable ? 'ready' : 'failed',
        title: isRebind ? '身份验证失败' : 'AskCore 登录失败',
      });
    }
  },
});
