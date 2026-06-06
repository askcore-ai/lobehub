// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthServerConfigProvider } from './AuthServerConfigProvider';
import AuthContainer from './index';

vi.mock('@lobechat/business-const', () => ({
  COPYRIGHT_FULL: 'Copyright AskCore AI',
}));

vi.mock('@lobehub/ui', () => ({
  Center: ({ children }: any) => <div>{children}</div>,
  Flexbox: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('antd', () => ({
  Divider: () => <span />,
}));

vi.mock('antd-style', () => ({
  cx: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/Branding', () => ({
  ProductLogo: () => <span>AskCore</span>,
}));

vi.mock('@/hooks/useIsDark', () => ({
  useIsDark: () => false,
}));

vi.mock('./AuthLangButton', () => ({
  default: () => <button type="button">lang</button>,
}));

vi.mock('./AuthThemeButton', () => ({
  default: () => <button type="button">theme</button>,
}));

vi.mock('./style', () => ({
  styles: {
    divider: 'divider',
    innerContainerDark: 'inner-dark',
    innerContainerLight: 'inner-light',
    outerContainer: 'outer',
  },
}));

describe('AuthContainer compliance footer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders compliance links under the auth copyright footer', () => {
    render(
      <AuthServerConfigProvider
        serverConfig={{
          aiProvider: {},
          compliance: {
            icpRecordText: '京ICP备00000000号-1',
            icpRecordUrl: 'https://beian.miit.gov.cn/',
          },
          telemetry: {},
        }}
      >
        <AuthContainer>Sign in</AuthContainer>
      </AuthServerConfigProvider>,
    );

    expect(screen.getByText('Copyright AskCore AI')).toBeTruthy();
    expect(screen.getByText('京ICP备00000000号-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ICP备案信息' }).getAttribute('href')).toBe(
      'https://beian.miit.gov.cn/',
    );
  });

  it('keeps the footer unchanged when compliance is not configured', () => {
    render(
      <AuthServerConfigProvider serverConfig={{ aiProvider: {}, telemetry: {} }}>
        <AuthContainer>Sign in</AuthContainer>
      </AuthServerConfigProvider>,
    );

    expect(screen.getByText('Copyright AskCore AI')).toBeTruthy();
    expect(screen.queryByTestId('askcore-compliance-links')).toBeNull();
  });
});
