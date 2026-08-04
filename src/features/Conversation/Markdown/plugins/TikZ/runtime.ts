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
