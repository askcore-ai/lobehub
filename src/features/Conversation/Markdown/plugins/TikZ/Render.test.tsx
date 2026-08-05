import { render, screen } from '@testing-library/react';
import { cssVar } from 'antd-style';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScientificContentRenderContext } from './context';
import Render from './Render';
import { compileTikz } from './runtime';

vi.mock('./runtime', () => ({ compileTikz: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'tikz.diagramLabel': 'Scientific diagram',
        'tikz.renderFailed': 'Scientific diagram could not be rendered',
        'tikz.rendering': 'Rendering scientific diagram',
        'tikz.sourceLabel': 'Original TikZ source',
      })[key] || key,
  }),
}));

const mockCompileTikz = vi.mocked(compileTikz);
const setTokenValue = (reference: string, value: string) => {
  const variable = /^var\((--[^)]+)\)$/.exec(reference)?.[1];
  if (!variable) throw new Error(`Expected a CSS variable reference, received: ${reference}`);
  document.documentElement.style.setProperty(variable, value);
};
const source = String.raw`\begin{tikzpicture}
  \draw[red] (0,0) -- (1,1);
\end{tikzpicture}`;
const props = {
  children: null,
  id: 'message-1',
  node: { properties: { source } },
  tagName: 'tikz-diagram',
  type: 'element',
} as any;
const renderOnApprovedSurface = () =>
  render(
    <ScientificContentRenderContext value>
      <Render {...props} />
    </ScientificContentRenderContext>,
  );

describe('TikZ diagram renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('shows a textual pending state while the independent block compiles', () => {
    mockCompileTikz.mockReturnValue(new Promise(() => {}));

    renderOnApprovedSurface();

    expect(screen.getByRole('status')).toHaveTextContent('Rendering scientific diagram');
  });

  it('preserves source without compiling on excluded presentation surfaces', () => {
    render(
      <ScientificContentRenderContext value={false}>
        <Render {...props} />
      </ScientificContentRenderContext>,
    );

    expect(mockCompileTikz).not.toHaveBeenCalled();
    expect(
      screen.getByText((_, element) =>
        Boolean(element?.matches('code.language-tikz') && element.textContent === source),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('preserves source without compiling when no surface provider is present', () => {
    mockCompileTikz.mockReturnValue(new Promise(() => {}));

    render(<Render {...props} />);

    expect(mockCompileTikz).not.toHaveBeenCalled();
    expect(
      screen.getByText((_, element) =>
        Boolean(element?.matches('code.language-tikz') && element.textContent === source),
      ),
    ).toBeInTheDocument();
  });

  it('renders sanitized SVG on a stable light canvas', async () => {
    const backgroundColor = 'rgb(241, 242, 243)';
    const foregroundColor = 'rgb(11, 12, 13)';
    setTokenValue(cssVar.colorWhite, backgroundColor);
    setTokenValue(cssVar.colorTextBase, foregroundColor);
    mockCompileTikz.mockResolvedValue({
      status: 'rendered',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#c00"/></svg>',
    });

    renderOnApprovedSurface();

    const canvas = await screen.findByTestId('tikz-diagram-canvas');
    expect(canvas).toHaveStyle({
      backgroundColor,
      color: foregroundColor,
    });
    expect(canvas.querySelector('path')).toHaveAttribute('stroke', '#c00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a dark foreground on the light canvas in dark theme', async () => {
    const backgroundColor = 'rgb(241, 242, 243)';
    const foregroundColor = 'rgb(21, 22, 23)';
    document.documentElement.setAttribute('data-theme', 'dark');
    setTokenValue(cssVar.colorWhite, backgroundColor);
    setTokenValue(cssVar.colorBgBase, foregroundColor);
    mockCompileTikz.mockResolvedValue({
      status: 'rendered',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#c00"/></svg>',
    });

    renderOnApprovedSurface();

    const canvas = await screen.findByTestId('tikz-diagram-canvas');
    expect(canvas).toHaveStyle({
      backgroundColor,
      color: foregroundColor,
    });
  });

  it('shows a localized failure and the original source for one failed block', async () => {
    mockCompileTikz.mockResolvedValue({ reason: 'syntax', status: 'failed' });

    renderOnApprovedSurface();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scientific diagram could not be rendered',
    );
    expect(screen.getByLabelText('Original TikZ source').textContent).toBe(source);
  });
});
