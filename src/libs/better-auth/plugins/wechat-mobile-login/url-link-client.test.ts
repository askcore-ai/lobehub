import { describe, expect, it, vi } from 'vitest';

import {
  createWechatUrlLinkGenerator,
  isOfficialWechatUrlLink,
  WechatUrlLinkError,
} from './url-link-client';

const expiresAt = new Date('2026-09-27T08:05:00.000Z');
const now = () => new Date('2026-09-27T08:00:00.000Z').getTime();

describe('WeChat URL Link client', () => {
  it('caches a stable token and generates release links with transaction expiry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'server-token', expires_in: 7200 }))
      .mockResolvedValueOnce(Response.json({ url_link: 'https://wxmpurl.cn/opaque-one' }))
      .mockResolvedValueOnce(Response.json({ url_link: 'https://wxaurl.cn/opaque-two' }));
    const generate = createWechatUrlLinkGenerator({
      appId: 'wx-mini',
      appSecret: 'server-secret',
      fetcher,
      now,
    });

    await expect(generate({ expiresAt, query: 'c=cap&p=signin&t=tx' })).resolves.toBe(
      'https://wxmpurl.cn/opaque-one',
    );
    await expect(generate({ expiresAt, query: 'c=cap&p=rebind&t=tx' })).resolves.toBe(
      'https://wxaurl.cn/opaque-two',
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    const tokenRequest = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(tokenRequest).toEqual({
      appid: 'wx-mini',
      force_refresh: false,
      grant_type: 'client_credential',
      secret: 'server-secret',
    });
    const linkRequest = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(linkRequest).toEqual({
      env_version: 'release',
      expire_time: Math.floor(expiresAt.getTime() / 1000),
      expire_type: 0,
      path: 'pages/login/index',
      query: 'c=cap&p=signin&t=tx',
    });
  });

  it('forces one stable-token refresh after an invalid access token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'stale', expires_in: 7200 }))
      .mockResolvedValueOnce(Response.json({ errcode: 42001 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'fresh', expires_in: 7200 }))
      .mockResolvedValueOnce(Response.json({ url_link: 'https://wxaurl.cn/refreshed' }));
    const generate = createWechatUrlLinkGenerator({
      appId: 'wx-mini',
      appSecret: 'server-secret',
      fetcher,
      now,
    });

    await expect(generate({ expiresAt, query: 'c=cap&p=signin&t=tx' })).resolves.toBe(
      'https://wxaurl.cn/refreshed',
    );
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toMatchObject({
      force_refresh: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('rejects non-official targets and invalid transaction lifetimes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: 'server-token', expires_in: 7200 }))
      .mockResolvedValueOnce(Response.json({ url_link: 'https://example.com/not-wechat' }));
    const generate = createWechatUrlLinkGenerator({
      appId: 'wx-mini',
      appSecret: 'server-secret',
      fetcher,
      now,
    });

    await expect(generate({ expiresAt, query: 'c=cap&p=signin&t=tx' })).rejects.toEqual(
      new WechatUrlLinkError('malformed'),
    );
    await expect(
      generate({ expiresAt: new Date(now() + 60_000), query: 'c=cap&p=signin&t=tx' }),
    ).rejects.toEqual(new WechatUrlLinkError('malformed'));
    expect(isOfficialWechatUrlLink('https://wxmpurl.cn/opaque')).toBe(true);
    expect(isOfficialWechatUrlLink('weixin://dl/business/')).toBe(false);
  });

  it('redacts provider and transport failures behind stable error kinds', async () => {
    const providerFailure = createWechatUrlLinkGenerator({
      appId: 'wx-mini',
      appSecret: 'server-secret',
      fetcher: vi.fn().mockResolvedValue(Response.json({ errcode: 45009, errmsg: 'sensitive' })),
      now,
    });
    const transportFailure = createWechatUrlLinkGenerator({
      appId: 'wx-mini',
      appSecret: 'server-secret',
      fetcher: vi.fn().mockRejectedValue(new Error('sensitive transport detail')),
      now,
    });

    await expect(providerFailure({ expiresAt, query: 'c=cap&p=signin&t=tx' })).rejects.toEqual(
      new WechatUrlLinkError('unavailable'),
    );
    await expect(transportFailure({ expiresAt, query: 'c=cap&p=signin&t=tx' })).rejects.toEqual(
      new WechatUrlLinkError('unavailable'),
    );
  });
});
