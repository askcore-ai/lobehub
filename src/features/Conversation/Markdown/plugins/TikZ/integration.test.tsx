import { describe, expect, it } from 'vitest';

import {
  createTikzJaxOptions,
  getTikzJaxAssetBaseUrl,
  sanitizeTikzSvg,
  TIKZJAX_RENDER_TIMEOUT_MS,
  TIKZJAX_VERSION,
} from './runtime';

describe('TikZJax application policy', () => {
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
});
