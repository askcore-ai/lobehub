import fs from 'node:fs';
import path from 'node:path';

import { Markdown } from '@lobehub/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import packageJson from '../../../../../../package.json';
import { markdownElements } from '../index';
import { TIKZ_DIAGRAM_TAG } from './rehypePlugin';
import {
  compileTikz,
  createTikzJaxOptions,
  getTikzJaxAssetBaseUrl,
  sanitizeTikzSvg,
  TIKZJAX_RENDER_TIMEOUT_MS,
  TIKZJAX_VERSION,
} from './runtime';

afterEach(cleanup);

interface ClassificationCase {
  block: {
    complete: boolean;
    kind: 'code' | 'prose';
    language: null | string;
    source: string;
  };
  expected: 'diagram' | 'unchanged';
  id: string;
}

const commonFixturePath = path.resolve(
  process.cwd(),
  '../aitutor/spec/rendering/scientific_content_rendering.fixtures.json',
);
const commonClassificationCases: ClassificationCase[] | undefined = fs.existsSync(commonFixturePath)
  ? JSON.parse(fs.readFileSync(commonFixturePath, 'utf8')).classification_cases
  : undefined;

const blockMarkdown = ({ complete, kind, language, source }: ClassificationCase['block']) => {
  if (kind === 'prose') return source;

  return `\`\`\`${language || ''}\n${source}${complete ? '\n```' : ''}`;
};

const renderWithTikzRoute = (content: string) => {
  const element = markdownElements.find(({ tag }) => tag === TIKZ_DIAGRAM_TAG)!;

  return render(
    <Markdown
      rehypePlugins={[element.rehypePlugin]}
      components={{
        [TIKZ_DIAGRAM_TAG]: () => <div data-testid="tikz-routed" />,
      }}
    >
      {content}
    </Markdown>,
  );
};

describe('TikZJax application policy', () => {
  it('registers one TikZ element for assistant and user Markdown', () => {
    const element = markdownElements.find(({ tag }) => tag === TIKZ_DIAGRAM_TAG);

    expect(element).toMatchObject({
      rehypePlugin: expect.any(Function),
      scope: 'all',
      tag: TIKZ_DIAGRAM_TAG,
    });
  });

  it('does not route a fence whose info string contains extra tokens', () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;

    renderWithTikzRoute(`\`\`\`tikz title=diagram\n${source}\n\`\`\``);

    expect(screen.queryByTestId('tikz-routed')).not.toBeInTheDocument();
    expect(screen.getByText(/\\begin\{tikzpicture\}/)).toBeInTheDocument();
  });

  it.skipIf(!commonClassificationCases)(
    'matches every classification case in the paired common fixture',
    () => {
      for (const fixture of commonClassificationCases!) {
        cleanup();
        renderWithTikzRoute(blockMarkdown(fixture.block));

        expect(Boolean(screen.queryByTestId('tikz-routed')), fixture.id).toBe(
          fixture.expected === 'diagram',
        );
      }
    },
  );

  it('isolates two valid blocks from adjacent prose, KaTeX, and an invalid fence', () => {
    const diagram = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}`;
    const content = `before\n\n\`\`\`tikz\n${diagram}\n\`\`\`\n\nmiddle $x^2$\n\n\`\`\`latex\n${diagram}\n\`\`\`\n\nafter\n\n\`\`\`tikz\n${diagram}\n\`\`\``;
    const { container } = renderWithTikzRoute(content);

    expect(screen.getAllByTestId('tikz-routed')).toHaveLength(2);
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(screen.getByText(/\\begin\{tikzpicture\}/)).toBeInTheDocument();
  });

  it('loads no TikZJax asset for ordinary Markdown or an incomplete fence', () => {
    const incomplete = String.raw`\begin{tikzpicture}
  \draw (0,0) -- (1,1);`;

    renderWithTikzRoute(`ordinary $x$\n\n\`\`\`tikz\n${incomplete}`);

    expect(document.querySelector('script[data-askcore-tikzjax-runtime]')).toBeNull();
    expect(document.querySelector('link[data-askcore-tikzjax-fonts]')).toBeNull();
    expect(screen.queryByTestId('tikz-routed')).not.toBeInTheDocument();
  });

  it('pins the selected runtime as an exact production dependency', () => {
    expect(packageJson.dependencies['@rod2ik/tikzjax']).toBe('1.5.0');
  });

  it('uses one immutable self-hosted runtime profile', () => {
    expect(TIKZJAX_VERSION).toBe('1.5.0');
    expect(getTikzJaxAssetBaseUrl()).toBe(`${window.location.origin}/vendor/tikzjax/1.5.0`);
    expect(createTikzJaxOptions()).toEqual({
      assetBaseUrl: `${window.location.origin}/vendor/tikzjax/1.5.0`,
      maxRetries: 0,
      renderTimeout: TIKZJAX_RENDER_TIMEOUT_MS,
      restartWorkerOnFail: true,
      texPackages: ['chemfig', 'circuitikz', 'pgfplots', 'physics'],
      theme: { adaptiveColors: false, applyTargetStyles: false },
      tikzLibraries: [
        'calc',
        '3d',
        'decorations',
        'decorations.markings',
        'decorations.pathmorphing',
        'decorations.pathreplacing',
        'arrows',
        'arrows.meta',
        'positioning',
        'graphs',
        'graphs.standard',
      ],
      workerPool: {
        enabled: true,
        initializationRetries: 0,
        maxWorkers: 2,
        reserveCpuCores: 1,
        useDeviceMemory: true,
      },
    });
  });

  it('preserves explicit colors while accepting only inert local SVG references', () => {
    const svg = sanitizeTikzSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="p" d="M0 0"/></defs><use href="#p" fill="#c00"/></svg>',
    );

    expect(svg).toContain('href="#p"');
    expect(svg).toContain('fill="#c00"');
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>unsafe</foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com">x</a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://example.com/x)"/></svg>',
  ])('rejects the complete SVG when active or external content is present', (svg) => {
    expect(() => sanitizeTikzSvg(svg)).toThrow('unsafe TikZ SVG');
  });

  it('loads assets only for an eligible block and returns one sanitized SVG', async () => {
    const source = String.raw`\begin{tikzpicture}
  \draw[red] (0,0) -- (1,1);
\end{tikzpicture}`;

    expect(document.querySelector('script[data-askcore-tikzjax-runtime]')).toBeNull();

    const compilation = compileTikz(source);
    let runtimeScript: HTMLScriptElement | null = null;
    await vi.waitFor(() => {
      runtimeScript = document.querySelector('script[data-askcore-tikzjax-runtime]');
      expect(runtimeScript).not.toBeNull();
    });

    expect(document.querySelector('link[data-askcore-tikzjax-fonts]')).not.toBeNull();
    expect((window as any).TikzJaxOptions).toEqual(createTikzJaxOptions());
    runtimeScript!.dispatchEvent(new Event('load'));

    let sourceScript: HTMLScriptElement | null = null;
    await vi.waitFor(() => {
      sourceScript = document.querySelector('script[type="text/tikz"]');
      expect(sourceScript?.textContent).toBe(source);
    });
    expect(sourceScript!.attributes).toHaveLength(1);

    const wrapper = document.createElement('span');
    wrapper.className = 'tikzjax-wrapper';
    wrapper.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" stroke="#c00"/></svg>';
    sourceScript!.replaceWith(wrapper);
    wrapper
      .querySelector('svg')!
      .dispatchEvent(new Event('tikzjax-load-finished', { bubbles: true }));

    await expect(compilation).resolves.toEqual({
      status: 'rendered',
      svg: expect.stringContaining('stroke="#c00"'),
    });
    expect(document.querySelector('[data-askcore-tikz-compile]')).toBeNull();
  });
});
