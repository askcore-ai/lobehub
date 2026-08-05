import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScientificContentRenderContext } from './context';
import Render from './Render';
import { compileTikz } from './runtime';
import { stableScientificCanvas } from './tokens';

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

describe('TikZ diagram renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a textual pending state while the independent block compiles', () => {
    mockCompileTikz.mockReturnValue(new Promise(() => {}));

    render(<Render {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('Rendering scientific diagram');
  });

  it('preserves source without compiling on excluded presentation surfaces', () => {
    render(
      <ScientificContentRenderContext value={false}>
        <Render {...props} />
      </ScientificContentRenderContext>,
    );

    expect(mockCompileTikz).not.toHaveBeenCalled();
    expect(screen.getByText(source)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders sanitized SVG on a stable light canvas', async () => {
    mockCompileTikz.mockResolvedValue({
      status: 'rendered',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="#c00"/></svg>',
    });

    render(<Render {...props} />);

    const canvas = await screen.findByTestId('tikz-diagram-canvas');
    expect(canvas).toHaveStyle({
      backgroundColor: stableScientificCanvas.backgroundColor,
      color: stableScientificCanvas.foregroundColor,
    });
    expect(canvas.querySelector('path')).toHaveAttribute('stroke', '#c00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a localized failure and the original source for one failed block', async () => {
    mockCompileTikz.mockResolvedValue({ reason: 'syntax', status: 'failed' });

    render(<Render {...props} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scientific diagram could not be rendered',
    );
    expect(screen.getByLabelText('Original TikZ source').textContent).toBe(source);
  });
});
