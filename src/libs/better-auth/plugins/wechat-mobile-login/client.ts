import type { BetterAuthClientPlugin } from 'better-auth';

import type { wechatMobileLogin } from './index';

export const wechatMobileLoginClient = (): BetterAuthClientPlugin => ({
  $InferServerPlugin: {} as ReturnType<typeof wechatMobileLogin>,
  id: 'wechat-mobile-login',
  pathMethods: {
    '/wechat-rebind/callback': 'GET',
    '/wechat-mobile/status': 'GET',
  },
});
