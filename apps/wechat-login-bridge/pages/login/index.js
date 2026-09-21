/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */

const controller = require('../../controllers/login-controller');

let launch = null;
let handledLaunchVersion = 0;
let manualGeneration = 0;

Page({
  data: {
    actionText: '确认登录',
    busy: false,
    detail: '请先在 Safari 或 Chrome 打开 askcore.cn，按网站提示发起微信登录或身份验证，再在这里确认。',
    invalid: false,
    manualCode: '',
    manualValid: false,
    status: 'welcome',
    title: 'AskCore 微信登录助手',
  },

  applyLaunchOptions(options) {
    manualGeneration += 1;
    this.setData({ manualCode: '', manualValid: false });
    const hasTransaction = options && ['p', 't', 'c'].some((key) =>
      Object.prototype.hasOwnProperty.call(options, key),
    );
    if (!hasTransaction) {
      launch = null;
      this.setData({
        busy: false,
        detail: '请先在 Safari 或 Chrome 打开 askcore.cn，按网站提示发起微信登录或身份验证，再在这里确认。',
        invalid: false,
        status: 'welcome',
        title: 'AskCore 微信登录助手',
      });
      return;
    }
    try {
      launch = controller.parseLaunchOptions(options);
      if (launch.purpose === 'rebind') {
        this.setData({
          actionText: '确认验证',
          busy: false,
          detail: '这只会提交身份验证，账号关联由 AskCore 审核后处理。',
          invalid: false,
          status: 'ready',
          title: '验证 AskCore 微信身份',
        });
      } else {
        this.setData({
          actionText: '确认登录',
          busy: false,
          detail: '确认后，请使用系统导航返回原浏览器。',
          invalid: false,
          status: 'ready',
          title: '登录 AskCore',
        });
      }
    } catch {
      launch = null;
      this.setData({
        busy: false,
        detail: '请返回 AskCore，重新点击微信登录。',
        invalid: true,
        status: 'failed',
        title: '链接已失效',
      });
    }
  },

  onLoad(options) {
    const pending = getApp().globalData.wechatLaunch;
    handledLaunchVersion = (pending && pending.version) || 0;
    this.applyLaunchOptions(options);
    if (pending) pending.options = null;
  },

  onShow() {
    const pending = getApp().globalData.wechatLaunch;
    if (!pending || !pending.options || pending.version <= handledLaunchVersion) return;
    handledLaunchVersion = pending.version;
    this.applyLaunchOptions(pending.options);
    pending.options = null;
  },

  onCopyWebsite() {
    wx.setClipboardData({
      data: 'https://askcore.cn',
      fail: () => wx.showToast({ icon: 'none', title: '请在浏览器输入 askcore.cn' }),
      success: () => wx.showToast({ icon: 'none', title: '已复制，请在浏览器中打开' }),
    });
  },

  onManualInput(event) {
    if (this.data.busy || this.data.status !== 'welcome') return;
    const manualCode = String(event.detail.value || '').slice(0, 40);
    this.setData({ manualCode, manualValid: Boolean(controller.normalizeManualCode(manualCode)) });
  },

  clearManualInput() {
    manualGeneration += 1;
    this.setData({ manualCode: '', manualValid: false });
    if (this.data.status === 'proof_authorizing') {
      this.setData({ busy: false, status: 'welcome', detail: '已离开验证页。请返回原浏览器检查结果；重试时需重新输入未过期口令。' });
    }
  },

  onHide() { this.clearManualInput(); },
  onUnload() { this.clearManualInput(); },

  async onManualProof() {
    if (this.data.busy || this.data.status !== 'welcome' || !this.data.manualValid) return;
    let input = this.data.manualCode;
    const current = ++manualGeneration;
    this.setData({ busy: true, manualCode: '', manualValid: false, status: 'proof_authorizing' });
    try {
      const completion = controller.provePrepublication(wx, input, () => current === manualGeneration);
      input = '';
      await completion;
      if (current !== manualGeneration) return;
      this.setData({
        busy: false,
        detail: '请通过系统导航返回原浏览器确认结果。未创建登录会话、账号关联或迁移凭据，也未证明历史身份匹配。',
        status: 'proof_ready',
        title: '授权验证已提交',
      });
    } catch (error) {
      input = '';
      if (current !== manualGeneration) return;
      const retryable = ['askcore_unavailable', 'wx_login_failed'].includes(error.message);
      this.setData({
        busy: false,
        detail: retryable
          ? '暂时无法连接，请先返回原浏览器检查状态；如仍待验证，可重新输入未过期口令重试。'
          : '本次验证未完成，请返回原浏览器检查状态或重新开始。',
        status: 'welcome',
        title: '授权验证未完成',
      });
    }
  },

  async onAuthorize() {
    if (!launch || this.data.busy || this.data.status !== 'ready') return;
    const currentLaunch = launch;
    this.setData({ busy: true, status: 'authorizing' });
    try {
      await controller.authorize(wx, currentLaunch);
      if (launch !== currentLaunch) return;
      launch = null;
      this.setData({
        busy: false,
        detail: currentLaunch.purpose === 'rebind'
          ? '身份验证已提交。请返回原浏览器继续确认；此操作不会自动合并或关联账号。'
          : '微信授权已完成。请使用系统导航返回原 Safari 或 Chrome，完成网站登录。',
        status: 'authorized',
        title: currentLaunch.purpose === 'rebind' ? '身份验证已提交' : '微信授权已完成',
      });
    } catch (error) {
      if (launch !== currentLaunch) return;
      const retryable = ['askcore_unavailable', 'wx_login_failed'].includes(error.message);
      if (!retryable) launch = null;
      this.setData({
        busy: false,
        detail: retryable
          ? '暂时无法连接，请稍后重试。'
          : error.message === 'maintenance'
            ? '微信身份服务维护中，请稍后返回 AskCore 重新开始。'
            : '验证失败，请返回 AskCore 重新开始。',
        invalid: !retryable,
        status: retryable ? 'ready' : 'failed',
        title: retryable ? '暂时无法完成验证' : '本次验证未完成',
      });
    }
  },
});
