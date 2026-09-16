import { sanitizeSVGContent } from '@lobechat/utils/client';

export const TIKZJAX_VERSION = '1.5.0';
export const TIKZJAX_RENDER_TIMEOUT_MS = 15_000;

const TIKZJAX_TEX_PACKAGES = ['chemfig', 'circuitikz', 'pgfplots', 'physics'];
const TIKZJAX_LIBRARIES = [
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
];

export const getTikzJaxAssetBaseUrl = () => {
  const applicationBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);

  return new URL(`vendor/tikzjax/${TIKZJAX_VERSION}`, applicationBaseUrl).href.replace(/\/$/, '');
};

export const createTikzJaxOptions = () => ({
  assetBaseUrl: getTikzJaxAssetBaseUrl(),
  maxRetries: 0,
  renderTimeout: TIKZJAX_RENDER_TIMEOUT_MS,
  restartWorkerOnFail: true,
  texPackages: TIKZJAX_TEX_PACKAGES,
  theme: { adaptiveColors: false, applyTargetStyles: false },
  tikzLibraries: TIKZJAX_LIBRARIES,
  workerPool: {
    enabled: true,
    initializationRetries: 0,
    maxWorkers: 2,
    reserveCpuCores: 1,
    useDeviceMemory: true,
  },
});

const UNSAFE_SVG_ELEMENTS = new Set([
  'embed',
  'foreignobject',
  'iframe',
  'link',
  'object',
  'script',
  'style',
]);

const containsExternalUrlReference = (value: string) => {
  const normalized = value.toLowerCase();
  let offset = 0;

  while (offset < normalized.length) {
    const start = normalized.indexOf('url(', offset);
    if (start === -1) return false;

    const end = normalized.indexOf(')', start + 4);
    if (end === -1) return true;

    const target = normalized
      .slice(start + 4, end)
      .trim()
      .replaceAll(/^['"]|['"]$/g, '')
      .trim();
    if (target && !target.startsWith('#')) return true;

    offset = end + 1;
  }

  return false;
};

const containsUnsafeSvgContent = (svg: SVGSVGElement) => {
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    if (UNSAFE_SVG_ELEMENTS.has(element.localName.toLowerCase())) return true;

    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith('on') || /javascript:/i.test(value)) return true;
      if ((name === 'href' || name.endsWith(':href')) && value && !value.startsWith('#')) {
        return true;
      }

      if (containsExternalUrlReference(value)) return true;
    }
  }

  return false;
};

const parseSvg = (content: string) => {
  const template = document.createElement('template');
  template.innerHTML = content.trim();
  const root = template.content.firstElementChild;

  if (!root || root.localName.toLowerCase() !== 'svg' || template.content.children.length !== 1) {
    throw new Error('unsafe TikZ SVG');
  }

  return root as unknown as SVGSVGElement;
};

export const sanitizeTikzSvg = (content: string) => {
  const source = parseSvg(content);
  if (containsUnsafeSvgContent(source)) throw new Error('unsafe TikZ SVG');

  const sanitized = sanitizeSVGContent(content);
  if (!sanitized.trim()) return source.outerHTML;

  const result = parseSvg(sanitized);
  if (containsUnsafeSvgContent(result)) throw new Error('unsafe TikZ SVG');

  return sanitized;
};

export type TikzCompileResult =
  | { status: 'rendered'; svg: string }
  | { reason: 'asset' | 'policy' | 'syntax' | 'timeout'; status: 'failed' };

interface TikzJaxWindow extends Window {
  TikzJax?: boolean;
  TikzJaxOptions?: ReturnType<typeof createTikzJaxOptions>;
}

let runtimeLoad: Promise<void> | undefined;

const loadTikzJaxRuntime = () => {
  const tikzWindow = window as TikzJaxWindow;
  if (tikzWindow.TikzJax) return Promise.resolve();
  if (runtimeLoad) return runtimeLoad;

  const assetBaseUrl = getTikzJaxAssetBaseUrl();
  tikzWindow.TikzJaxOptions = createTikzJaxOptions();

  if (!document.querySelector('link[data-askcore-tikzjax-fonts]')) {
    const fonts = document.createElement('link');
    fonts.dataset.askcoreTikzjaxFonts = '';
    fonts.href = `${assetBaseUrl}/fonts.min.css`;
    fonts.rel = 'stylesheet';
    document.head.append(fonts);
  }

  runtimeLoad = new Promise<void>((resolve, reject) => {
    const runtime = document.createElement('script');
    let loaded = false;
    const assetTimeout = window.setTimeout(() => {
      if (loaded) return;
      runtime.remove();
      runtimeLoad = undefined;
      reject(new Error('TikZJax runtime asset timed out'));
    }, TIKZJAX_RENDER_TIMEOUT_MS);
    runtime.async = true;
    runtime.dataset.askcoreTikzjaxRuntime = '';
    runtime.src = `${assetBaseUrl}/tikzjax.min.js`;
    runtime.addEventListener(
      'load',
      () => {
        loaded = true;
        window.clearTimeout(assetTimeout);
        resolve();
      },
      { once: true },
    );
    runtime.addEventListener(
      'error',
      () => {
        window.setTimeout(() => {
          if (loaded) return;
          window.clearTimeout(assetTimeout);
          runtimeLoad = undefined;
          reject(new Error('TikZJax runtime asset failed to load'));
        }, 50);
      },
      { once: true },
    );
    document.head.append(runtime);
  });

  return runtimeLoad;
};

export const compileTikz = async (source: string): Promise<TikzCompileResult> => {
  try {
    await loadTikzJaxRuntime();
  } catch {
    return { reason: 'asset', status: 'failed' };
  }

  return new Promise<TikzCompileResult>((resolve) => {
    const host = document.createElement('span');
    host.dataset.askcoreTikzCompile = '';
    host.style.height = '1px';
    host.style.left = '-10000px';
    host.style.opacity = '0';
    host.style.overflow = 'hidden';
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.width = '1px';

    let settled = false;
    const observer = new MutationObserver(() => inspectFailure());
    const finish = (result: TikzCompileResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      observer.disconnect();
      host.remove();
      resolve(result);
    };
    const inspectFailure = () => {
      if (host.querySelector('.tikzjax-broken-wrapper')) {
        finish({ reason: 'syntax', status: 'failed' });
      }
    };

    const inspectRendered = () => {
      inspectFailure();
      if (settled) return;
      const svg = host.querySelector<SVGSVGElement>(
        '.tikzjax-wrapper:not(.tikzjax-loading) svg:not(.tikzjax-loader)',
      );
      if (!svg) return;

      try {
        finish({ status: 'rendered', svg: sanitizeTikzSvg(svg.outerHTML) });
      } catch {
        finish({ reason: 'policy', status: 'failed' });
      }
    };

    host.addEventListener('tikzjax-load-finished', inspectRendered);
    observer.observe(host, { childList: true, subtree: true });
    const timeout = window.setTimeout(
      () => finish({ reason: 'timeout', status: 'failed' }),
      TIKZJAX_RENDER_TIMEOUT_MS,
    );

    const input = document.createElement('script');
    input.type = 'text/tikz';
    input.textContent = source;
    host.append(input);
    document.body.append(host);
  });
};
