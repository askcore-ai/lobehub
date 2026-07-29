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
  enterSchoolSource: vi.fn(),
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

vi.mock('@/business/client/AskCoreSchoolPortal/handoffClient', () => ({
  enterSchoolSource: mocks.enterSchoolSource,
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
  mocks.enterSchoolSource.mockReset();
  mocks.enterSchoolSource.mockResolvedValue('navigating');
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

  it('injects the single School / Learning Space entry and drops persisted duplicates', () => {
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'school', title: '学校/学习空间', url: '/school' }],
    };
    mocks.globalState.status.sidebarItems = ['learning-space', 'school-billing', 'recents', 'agent'];

    render(<Body />);

    expect(screen.getAllByText('学校/学习空间')).toHaveLength(1);
    expect(screen.queryByText('学习空间')).not.toBeInTheDocument();
    expect(screen.queryByText('学校计费')).not.toBeInTheDocument();
  });

  it('prepares the direct Moodle handoff without changing the current AskCore route', () => {
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'school', title: '学校/学习空间', url: '/school' }],
    };
    mocks.globalState.status.sidebarItems = ['school'];

    render(<Body />);
    fireEvent.click(screen.getByRole('link', { name: '学校/学习空间' }));

    expect(mocks.enterSchoolSource).toHaveBeenCalledWith('moodle');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('uses /school only as the bounded recovery route after preparation fails', async () => {
    mocks.enterSchoolSource.mockRejectedValueOnce(new Error('unavailable'));
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'school', title: '学校/学习空间', url: '/school' }],
    };
    mocks.globalState.status.sidebarItems = ['school'];

    render(<Body />);
    fireEvent.click(screen.getByRole('link', { name: '学校/学习空间' }));

    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/school'));
  });

  it('marks the combined school navigation item active at /school', () => {
    mocks.activeTabKey = 'school';
    mocks.pathname = '/school';
    mocks.navLayout = {
      bottomMenuItems: [],
      topNavItems: [{ key: 'school', title: '学校/学习空间', url: '/school' }],
    };
    mocks.globalState.status.sidebarItems = ['school'];

    render(<Body />);

    expect(screen.getByText('学校/学习空间')).toHaveAttribute('data-active', 'true');
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
