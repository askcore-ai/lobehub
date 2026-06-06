// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ComplianceLinks from './index';

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, 'data-testid': testId }: any) => <div data-testid={testId}>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe('ComplianceLinks', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders ICP and public-security registration links', () => {
    render(
      <ComplianceLinks
        compliance={{
          icpRecordText: '京ICP备00000000号-1',
          publicSecurityRecordText: '京公网安备00000000000000号',
          publicSecurityRecordUrl: 'https://www.beian.gov.cn/portal/registerSystemInfo',
        }}
      />,
    );

    expect(screen.getByTestId('askcore-compliance-links')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ICP备案信息' }).getAttribute('href')).toBe(
      'https://beian.miit.gov.cn/',
    );
    expect(screen.getByRole('link', { name: '公安备案信息' }).getAttribute('href')).toBe(
      'https://www.beian.gov.cn/portal/registerSystemInfo',
    );
  });

  it('renders public-security text without a link when no URL is configured', () => {
    render(
      <ComplianceLinks
        compliance={{
          publicSecurityRecordText: '京公网安备00000000000000号',
        }}
      />,
    );

    expect(screen.getByText('京公网安备00000000000000号')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '公安备案信息' })).toBeNull();
  });

  it('renders nothing when no compliance text is configured', () => {
    const { container } = render(<ComplianceLinks compliance={{}} />);

    expect(container.firstChild).toBeNull();
  });
});
