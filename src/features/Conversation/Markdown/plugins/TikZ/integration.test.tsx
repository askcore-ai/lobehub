import { describe, expect, it, vi } from 'vitest';

import packageJson from '../../../../../../package.json';
import {
  compileTikz,
  createTikzJaxOptions,
  getTikzJaxAssetBaseUrl,
  sanitizeTikzSvg,
  TIKZJAX_RENDER_TIMEOUT_MS,
  TIKZJAX_VERSION,
} from './runtime';

describe('TikZJax application policy', () => {
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
