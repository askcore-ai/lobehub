'use client';

import { Flexbox, Text } from '@lobehub/ui';
import { memo } from 'react';

import type { GlobalComplianceConfig } from '@/types/serverConfig';

const ICP_RECORD_URL = 'https://beian.miit.gov.cn/';

interface ComplianceLinksProps {
  align?: 'center' | 'start';
  compliance?: GlobalComplianceConfig;
}

const ComplianceLinks = memo<ComplianceLinksProps>(({ align = 'center', compliance }) => {
  const icpRecordText = compliance?.icpRecordText?.trim();
  const icpRecordUrl = compliance?.icpRecordUrl || ICP_RECORD_URL;
  const publicSecurityRecordText = compliance?.publicSecurityRecordText?.trim();

  if (!icpRecordText && !publicSecurityRecordText) return null;

  const justify = align === 'center' ? 'center' : 'flex-start';

  return (
    <Flexbox
      horizontal
      align={'center'}
      data-testid="askcore-compliance-links"
      gap={8}
      justify={justify}
      style={{ flexWrap: 'wrap', fontSize: 12, lineHeight: '20px', maxWidth: '100%' }}
    >
      {icpRecordText && (
        <a
          aria-label="ICP备案信息"
          href={icpRecordUrl}
          rel="noreferrer"
          style={{ color: 'inherit' }}
          target="_blank"
        >
          <Text type={'secondary'}>{icpRecordText}</Text>
        </a>
      )}
      {publicSecurityRecordText &&
        (compliance?.publicSecurityRecordUrl ? (
          <a
            aria-label="公安备案信息"
            href={compliance.publicSecurityRecordUrl}
            rel="noreferrer"
            style={{ color: 'inherit' }}
            target="_blank"
          >
            <Text type={'secondary'}>{publicSecurityRecordText}</Text>
          </a>
        ) : (
          <Text type={'secondary'}>{publicSecurityRecordText}</Text>
        ))}
    </Flexbox>
  );
});

export default ComplianceLinks;
