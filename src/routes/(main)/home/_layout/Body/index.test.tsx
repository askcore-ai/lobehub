import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Body from './index';

interface MockGlobalState {
  status: {
    hiddenSidebarSections?: string[];
    sidebarExpandedKeys?: string[];
    sidebarItems?: string[];
  };
  updateSystemStatus: (patch: Partial<MockGlobalState['status']>) => void;
}

type MockNavItem = { hidden?: boolean; key: string; title: string; url: string };

const mocks = vi.hoisted(() => ({
  activeTabKey: 'home',
  globalState: undefined as unknown as MockGlobalState,
  navLayout: {
    bottomMenuItems: [] as MockNavItem[],
    topNavItems: [] as MockNavItem[],
  },
  navigate: vi.fn(),
  pathname: '/',
  updateSystemStatus: vi.fn(),
}));

vi.mock('@lobehub/ui', () => ({
  Accordion: ({
    children,
    expandedKeys,
    onExpandedChange,
  }: {
    children: React.ReactNode;
    expandedKeys?: string[];
    onExpandedChange?: (keys: string[]) => void;
  }) => (
    <div data-expanded-keys={JSON.stringify(expandedKeys)} data-testid="sidebar-accordion">
      <button aria-label="collapse recents" onClick={() => onExpandedChange?.(['agent'])} />
      {children}
    </div>
  ),
  ActionIcon: () => <span />,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Flexbox: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-body">{children}</div>
  ),
  Icon: () => <span />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({
    children,
    onClick,
    to,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    to: string;
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ active, title }: { active?: boolean; title: string }) => (
    <div data-active={active ? 'true' : undefined}>{title}</div>
  ),
}));

vi.mock('@/hooks/useActiveTabKey', () => ({
  useActiveTabKey: () => mocks.activeTabKey,
}));

vi.mock('@/hooks/useNavLayout', () => ({
  useNavLayout: () => mocks.navLayout,
}));

vi.mock('@/utils/navigation', () => ({
  isModifierClick: () => false,
}));

vi.mock('@/routes/(main)/home/features/Recents', () => ({
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
}));

vi.mock('./Agent', () => ({
  default: ({ itemKey }: { itemKey: string }) => <div data-testid={`sidebar-item-${itemKey}`} />,
}));

vi.mock('./CustomizeSidebarModal', () => ({
  openCustomizeSidebarModal: vi.fn(),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: MockGlobalState) => unknown) => selector(mocks.globalState),
}));

beforeEach(() => {
  mocks.activeTabKey = 'home';
  mocks.updateSystemStatus.mockReset();
  mocks.navigate.mockReset();
  mocks.pathname = '/';
  mocks.navLayout = {
    bottomMenuItems: [],
    topNavItems: [],
  };
  mocks.globalState = {
    status: {
      hiddenSidebarSections: [],
      sidebarExpandedKeys: ['recents', 'agent'],
      sidebarItems: ['recents', 'agent'],
    },
    updateSystemStatus: mocks.updateSystemStatus,
  };
});

afterEach(() => {
  cleanup();
});

describe('Home sidebar body', () => {
  it('uses persisted sidebar accordion expanded keys', () => {
    mocks.globalState.status.sidebarExpandedKeys = ['agent'];

    render(<Body />);

    expect(screen.getByTestId('sidebar-accordion')).toHaveAttribute(
      'data-expanded-keys',
      '["agent"]',
    );
  });

  it('persists sidebar accordion expanded changes', () => {
    render(<Body />);

    fireEvent.click(screen.getByRole('button', { name: 'collapse recents' }));

    expect(mocks.updateSystemStatus).toHaveBeenCalledWith({ sidebarExpandedKeys: ['agent'] });
  });

  it('renders items strictly in sidebarItems order with the spacer at its stored position', () => {
    mocks.navLayout = {
      bottomMenuItems: [
        { key: 'image', title: 'Image', url: '/image' },
        { key: 'resource', title: 'Resource', url: '/resource' },
      ],
      topNavItems: [
        { key: 'pages', title: 'Pages', url: '/page' },
        { key: 'tasks', title: 'Tasks', url: '/tasks' },
      ],
    };
    mocks.globalState.status.sidebarItems = [
      'pages',
      'recents',
      'agent',
      '__spacer__',
      'image',
      'tasks',
      'resource',
    ];

    render(<Body />);

    const children = Array.from(screen.getByTestId('sidebar-body').children);
    const spacerIndex = children.findIndex((child) =>
      child.hasAttribute('data-sidebar-bottom-spacer'),
    );

    expect(spacerIndex).toBe(2);
    expect(children[0]).toHaveTextContent('Pages');
    expect(children[1]).toHaveAttribute('data-testid', 'sidebar-accordion');
    expect(children[3]).toHaveTextContent('Image');
    expect(children[4]).toHaveTextContent('Tasks');
    expect(children[5]).toHaveTextContent('Resource');
  });

  it('renders the school entry for users whose persisted sidebar predates that system item', () => {
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [
        { key: 'pages', title: 'Pages', url: '/page' },
        { key: 'school', title: '学校', url: '/school' },
      ],
    };
    mocks.globalState.status.sidebarItems = ['pages', 'recents', 'agent'];

    render(<Body />);

    expect(screen.getByText('学校')).toBeInTheDocument();
  });

  it('keeps required AskCore navigation visible even when local hidden sections are stale', () => {
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'school', title: '学校', url: '/school' }],
    };
    mocks.globalState.status.hiddenSidebarSections = ['school'];
    mocks.globalState.status.sidebarItems = ['school', 'recents', 'agent'];

    render(<Body />);

    expect(screen.getByText('学校')).toBeInTheDocument();
  });

  it.each([
    ['teaching-center', '教学中心', 'learning-space', '学习空间'],
    ['learning-space', '学习空间', 'teaching-center', '教学中心'],
    ['operations-center', '运维中心', 'teaching-center', '教学中心'],
  ] as const)(
    'injects the live %s role entry when persisted sidebar items predate it',
    (visibleKey, visibleTitle, hiddenKey, hiddenTitle) => {
      mocks.navLayout = {
        bottomMenuItems: [],
        topNavItems: [
          { key: 'school', title: '学校', url: '/school' },
          { key: visibleKey, title: visibleTitle, url: `/school/${visibleKey}` },
          { hidden: true, key: hiddenKey, title: hiddenTitle, url: `/school/${hiddenKey}` },
        ],
      };
      mocks.globalState.status.sidebarItems = ['recents', 'agent'];

      render(<Body />);

      expect(screen.getByText('学校')).toBeInTheDocument();
      expect(screen.getByText(visibleTitle)).toBeInTheDocument();
      expect(screen.queryByText(hiddenTitle)).not.toBeInTheDocument();
    },
  );

  it('navigates the teaching entry to the stable AskCore surface route', () => {
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'teaching-center', title: '教学中心', url: '/school/teaching-center' }],
    };
    mocks.globalState.status.sidebarItems = ['teaching-center'];

    render(<Body />);
    fireEvent.click(screen.getByRole('link', { name: '教学中心' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/school/teaching-center');
  });

  it.each([
    ['/school', '学校'],
    ['/school/operations-center', '运维中心'],
    ['/school/teaching-center', '教学中心'],
    ['/school/learning-space', '学习空间'],
  ] as const)('marks only the exact %s school navigation item active', (pathname, activeTitle) => {
    mocks.activeTabKey = 'school';
    mocks.pathname = pathname;
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [
        { key: 'school', title: '学校', url: '/school' },
        { key: 'operations-center', title: '运维中心', url: '/school/operations-center' },
        { key: 'teaching-center', title: '教学中心', url: '/school/teaching-center' },
        { key: 'learning-space', title: '学习空间', url: '/school/learning-space' },
      ],
    };
    mocks.globalState.status.sidebarItems = [
      'school',
      'operations-center',
      'teaching-center',
      'learning-space',
    ];

    render(<Body />);

    expect(screen.getByText(activeTitle)).toHaveAttribute('data-active', 'true');
    expect(
      screen
        .getAllByText(/^(学校|运维中心|教学中心|学习空间)$/)
        .filter((item) => item.getAttribute('data-active') === 'true'),
    ).toHaveLength(1);
  });

  it('keeps a top item that was dragged past the spacer in its new position', () => {
    mocks.navLayout = {
      bottomMenuItems: [{ key: 'image', title: 'Image', url: '/image' }],
      topNavItems: [{ key: 'tasks', title: 'Tasks', url: '/tasks' }],
    };
    // User dragged `tasks` from the top section to sit after `image`.
    mocks.globalState.status.sidebarItems = ['recents', 'agent', '__spacer__', 'image', 'tasks'];

    render(<Body />);

    const children = Array.from(screen.getByTestId('sidebar-body').children);

    expect(children[0]).toHaveAttribute('data-testid', 'sidebar-accordion');
    expect(children[1]).toHaveAttribute('data-sidebar-bottom-spacer');
    expect(children[2]).toHaveTextContent('Image');
    expect(children[3]).toHaveTextContent('Tasks');
  });
});
