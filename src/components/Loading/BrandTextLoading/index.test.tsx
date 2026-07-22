import { readFileSync } from 'node:fs';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BrandTextLoading from './index';

const expectUnionedGlyphOutlines = (path: Element | null) => {
  expect(path).not.toBeNull();

  const pathData = path?.getAttribute('d') || '';
  expect(pathData.match(/m/gi)).toHaveLength(10);
  expect(pathData).not.toContain('M103.6 223.32');
  expect(pathData).not.toContain('M396.76 260');
  expect(pathData).not.toContain('M929.32 185.24');
};

describe('BrandTextLoading', () => {
  it('renders AskCore with the same animation-friendly SVG topology as LobeHub', () => {
    render(<BrandTextLoading debugId="test-loader" />);

    const status = screen.getByRole('status', { name: 'Loading' });
    const logo = status.querySelector('svg[data-askcore-brand-text]');

    expect(logo).toHaveClass('lobe-brand-loading');
    expect(logo).toHaveAttribute('viewBox', '0 0 1200 320');
    expect(logo?.querySelectorAll('path')).toHaveLength(1);
    expect(logo?.querySelector('[transform]')).toBeNull();
    expectUnionedGlyphOutlines(logo?.querySelector('path') || null);
    expect(logo).toHaveTextContent('AskCore');
    expect(logo).not.toHaveTextContent('LobeHub');
  });

  it.each([
    ['web', '../../../../index.html'],
    ['desktop', '../../../../apps/desktop/index.html'],
    ['desktop popup', '../../../../apps/desktop/popup.html'],
  ])('uses AskCore in the %s pre-hydration loading screen', (_, relativePath) => {
    const html = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const template = document.createElement('template');
    template.innerHTML = html;
    const logo = template.content.querySelector('#loading-brand svg');

    expect(html).toContain('<title>AskCore</title>');
    expect(html).not.toContain('<title>LobeHub</title>');
    expect(html).toContain('loading-draw 2s cubic-bezier(0.4, 0, 0.2, 1) infinite');
    expect(html).toContain('loading-fill 2s cubic-bezier(0.4, 0, 0.2, 1) infinite');
    expect(logo).toHaveAttribute('viewBox', '0 0 1200 320');
    expect(logo?.querySelectorAll('path')).toHaveLength(1);
    expect(logo?.querySelector('[transform]')).toBeNull();
    expectUnionedGlyphOutlines(logo?.querySelector('path') || null);
  });
});
