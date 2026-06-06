import { describe, expect, it, vi } from 'vitest';

const loadComplianceConfig = async (appEnv: Record<string, string | undefined>) => {
  vi.resetModules();
  vi.doMock('@/envs/app', () => ({ appEnv }));

  return import('./compliance');
};

describe('getServerComplianceConfig', () => {
  it('returns undefined when no compliance text is configured', async () => {
    const { getServerComplianceConfig } = await loadComplianceConfig({});

    expect(getServerComplianceConfig()).toBeUndefined();
  });

  it('normalizes configured ICP and public-security registration values', async () => {
    const { ICP_RECORD_URL, getServerComplianceConfig } = await loadComplianceConfig({
      ASKCORE_ICP_RECORD_TEXT: '  京ICP备00000000号-1  ',
      ASKCORE_PUBLIC_SECURITY_RECORD_TEXT: '  京公网安备00000000000000号  ',
      ASKCORE_PUBLIC_SECURITY_RECORD_URL: '  https://www.beian.gov.cn/portal/registerSystemInfo  ',
    });

    expect(getServerComplianceConfig()).toEqual({
      icpRecordText: '京ICP备00000000号-1',
      icpRecordUrl: ICP_RECORD_URL,
      publicSecurityRecordText: '京公网安备00000000000000号',
      publicSecurityRecordUrl: 'https://www.beian.gov.cn/portal/registerSystemInfo',
    });
  });

  it('keeps public-security text without a link when no URL is configured', async () => {
    const { getServerComplianceConfig } = await loadComplianceConfig({
      ASKCORE_PUBLIC_SECURITY_RECORD_TEXT: '京公网安备00000000000000号',
      ASKCORE_PUBLIC_SECURITY_RECORD_URL: '',
    });

    expect(getServerComplianceConfig()).toEqual({
      publicSecurityRecordText: '京公网安备00000000000000号',
      publicSecurityRecordUrl: undefined,
    });
  });
});
