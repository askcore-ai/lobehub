/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */

const controller = require('../../controllers/login-controller');

let launch = null;
let handledLaunchVersion = 0;

Page({
  data: {
    actionText: '确认登录',
    busy: false,
    detail: '确认后，请使用系统导航返回原浏览器。',
    invalid: false,
    status: 'ready',
    title: '登录 AskCore',
  },

  applyLaunchOptions(options) {
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

  async onAuthorize() {
    if (!launch || this.data.busy) return;
    this.setData({ busy: true, status: 'authorizing' });
    try {
      await controller.authorize(wx, launch);
      launch = null;
      this.setData({
        busy: false,
        detail: '授权已完成。请使用系统导航返回原 Safari 或 Chrome。',
        status: 'authorized',
        title: '已完成',
      });
    } catch (error) {
      const retryable = ['askcore_unavailable', 'wx_login_failed'].includes(error.message);
      this.setData({
        busy: false,
        detail: retryable ? '暂时无法连接，请稍后重试。' : '验证失败，请返回 AskCore 重新开始。',
        status: retryable ? 'ready' : 'failed',
      });
    }
  },
});
