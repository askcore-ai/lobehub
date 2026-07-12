import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BusinessGlobalProvider from './BusinessGlobalProvider';

afterEach(() => vi.unstubAllGlobals());

describe('BusinessGlobalProvider', () => {
  it('does not bootstrap or mutate a school organization', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BusinessGlobalProvider>
        <div>personal workspace</div>
      </BusinessGlobalProvider>,
    );

    expect(screen.getByText('personal workspace')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
