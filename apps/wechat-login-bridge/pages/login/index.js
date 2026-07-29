/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */

const controller = require('../../lib/login-controller');

let launch = null;

Page({
  data: {
    actionText: '确认登录',
    busy: false,
    detail: '确认后，请使用系统导航返回原浏览器。',
    invalid: false,
    status: 'ready',
    title: '登录 AskCore',
  },

  onLoad(options) {
    try {
      launch = controller.parseLaunchOptions(options);
      if (launch.purpose === 'rebind') {
        this.setData({
          actionText: '确认验证',
          detail: '这只会提交身份验证，账号关联由 AskCore 审核后处理。',
          title: '验证 AskCore 微信身份',
        });
      }
    } catch {
      launch = null;
      this.setData({
        detail: '请返回 AskCore，重新点击微信登录。',
        invalid: true,
        status: 'failed',
        title: '链接已失效',
      });
    }
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
