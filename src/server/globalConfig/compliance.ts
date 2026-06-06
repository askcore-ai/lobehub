import { appEnv } from '@/envs/app';
import type { GlobalComplianceConfig } from '@/types/serverConfig';

export const ICP_RECORD_URL = 'https://beian.miit.gov.cn/';

const normalize = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export const getServerComplianceConfig = (): GlobalComplianceConfig | undefined => {
  const icpRecordText = normalize(appEnv.ASKCORE_ICP_RECORD_TEXT);
  const publicSecurityRecordText = normalize(appEnv.ASKCORE_PUBLIC_SECURITY_RECORD_TEXT);

  if (!icpRecordText && !publicSecurityRecordText) return undefined;

  return {
    ...(icpRecordText ? { icpRecordText, icpRecordUrl: ICP_RECORD_URL } : undefined),
    ...(publicSecurityRecordText
      ? {
          publicSecurityRecordText,
          publicSecurityRecordUrl: normalize(appEnv.ASKCORE_PUBLIC_SECURITY_RECORD_URL),
        }
      : undefined),
  };
};
