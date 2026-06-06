// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import About from './About';

const mocks = vi.hoisted(() => ({
  serverState: {
    serverConfig: {
      aiProvider: {},
      telemetry: {},
    },
  } as any,
}));

vi.mock('@icons-pack/react-simple-icons', () => ({
  SiDiscord: () => null,
  SiGithub: () => null,
  SiRss: () => null,
  SiX: () => null,
  SiYoutube: () => null,
}));

vi.mock('@lobechat/business-const', () => ({
  BRANDING_EMAIL: {
    business: 'business@askcore.cn',
    support: 'support@askcore.cn',
  },
  BRANDING_NAME: 'AskCore',
  SOCIAL_URL: {
    discord: 'https://discord.example.com',
    github: 'https://github.example.com',
    x: 'https://x.example.com',
    youtube: 'https://youtube.example.com',
  },
}));

vi.mock('@lobehub/ui', () => ({
  Block: ({ children }: any) => <div>{children}</div>,
  Flexbox: ({ children }: any) => <div>{children}</div>,
  Form: {
    Group: ({ children, title }: any) => <section aria-label={title}>{children}</section>,
  },
  Grid: ({ children }: any) => <div>{children}</div>,
  Icon: () => null,
}));

vi.mock('antd', () => ({
  Divider: () => <hr />,
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({ title: 'title' }),
  cssVar: {
    colorText: '#111',
    colorTextDescription: '#777',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/store/serverConfig', () => ({
  useServerConfigStore: (selector: (state: typeof mocks.serverState) => unknown) =>
    selector(mocks.serverState),
}));

vi.mock('./Version', () => ({
  default: () => <span>version</span>,
}));

describe('About compliance legal links', () => {
  beforeEach(() => {
    mocks.serverState = {
      serverConfig: {
        aiProvider: {},
        telemetry: {},
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps legal items unchanged when compliance is not configured', () => {
    render(<About />);

    expect(screen.getByText('terms')).toBeTruthy();
    expect(screen.getByText('privacy')).toBeTruthy();
    expect(screen.queryByText('京ICP备00000000号-1')).toBeNull();
  });

  it('appends configured ICP and public-security records to legal items', () => {
    mocks.serverState = {
      serverConfig: {
        aiProvider: {},
        compliance: {
          icpRecordText: '京ICP备00000000号-1',
          publicSecurityRecordText: '京公网安备00000000000000号',
          publicSecurityRecordUrl: 'https://www.beian.gov.cn/portal/registerSystemInfo',
        },
        telemetry: {},
      },
    };

    render(<About />);

    expect(screen.getByText('京ICP备00000000号-1').closest('a')?.getAttribute('href')).toBe(
      'https://beian.miit.gov.cn/',
    );
    expect(screen.getByText('京公网安备00000000000000号').closest('a')?.getAttribute('href')).toBe(
      'https://www.beian.gov.cn/portal/registerSystemInfo',
    );
  });

  it('renders public-security text without a link when no URL is configured', () => {
    mocks.serverState = {
      serverConfig: {
        aiProvider: {},
        compliance: {
          publicSecurityRecordText: '京公网安备00000000000000号',
        },
        telemetry: {},
      },
    };

    render(<About />);

    expect(screen.getByText('京公网安备00000000000000号').closest('a')).toBeNull();
  });
});
