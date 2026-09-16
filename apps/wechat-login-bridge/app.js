/* global App */

App({
  globalData: {
    wechatLaunch: null,
  },

  onShow(options) {
    const query = options && options.query;
    if (!query || Object.keys(query).length === 0) return;
    const key = JSON.stringify([query.p || null, query.t || null, query.c || null]);
    if (this.globalData.wechatLaunch && this.globalData.wechatLaunch.key === key) return;
    this.globalData.wechatLaunch = {
      key,
      options: { c: query.c, p: query.p, t: query.t },
      version: (this.globalData.wechatLaunch && this.globalData.wechatLaunch.version + 1) || 1,
    };
  },
});
