// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NavBar from './NavBar';

const mocks = vi.hoisted(() => ({
  enterSchoolSource: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/business/client/AskCoreSchoolPortal/handoffClient', () => ({
  enterSchoolSource: mocks.enterSchoolSource,
}));

vi.mock('@/hooks/useActiveTabKey', () => ({
  useActiveTabKey: () => 'chat',
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@lobehub/ui', () => ({
  Icon: () => <span aria-hidden />,
}));

vi.mock('@lobehub/ui/mobile', () => ({
  TabBar: ({
    height,
    items,
  }: {
    height: number;
    items: { key: string; onClick: () => void; title: string }[];
  }) => (
    <nav data-height={height} data-keys={items.map(({ key }) => key).join(',')}>
      {items.map((item) => (
        <button key={item.title} type="button" onClick={item.onClick}>
          {item.title}
        </button>
      ))}
    </nav>
  ),
}));

vi.mock('antd-style', () => ({
  createStaticStyles: () => ({ active: 'active', container: 'container' }),
}));

afterEach(() => {
  mocks.enterSchoolSource.mockReset();
  mocks.navigate.mockReset();
});

describe('P140 mobile navigation', () => {
  it('replaces Community with School and starts the invisible Moodle handoff', async () => {
    mocks.enterSchoolSource.mockResolvedValueOnce(undefined);

    render(<NavBar />);

    expect(screen.getByRole('button', { name: 'tab.chat' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'setting:group.school' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'tab.me' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'tab.community' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveAttribute('data-height', '48');
    expect(screen.getByRole('navigation')).toHaveAttribute('data-keys', 'chat,school,me');

    fireEvent.click(screen.getByRole('button', { name: 'setting:group.school' }));

    await waitFor(() => {
      expect(mocks.enterSchoolSource).toHaveBeenCalledWith('moodle');
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('uses /school only as the recovery route when handoff preparation fails', async () => {
    mocks.enterSchoolSource.mockRejectedValueOnce(new Error('unavailable'));

    render(<NavBar />);
    fireEvent.click(screen.getByRole('button', { name: 'setting:group.school' }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith('/school');
    });
  });

  it('uses the generated contract destinations for Chat and Me', () => {
    render(<NavBar />);

    fireEvent.click(screen.getByRole('button', { name: 'tab.chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'tab.me' }));

    expect(mocks.navigate).toHaveBeenNthCalledWith(1, '/agent');
    expect(mocks.navigate).toHaveBeenNthCalledWith(2, '/me');
  });
});
