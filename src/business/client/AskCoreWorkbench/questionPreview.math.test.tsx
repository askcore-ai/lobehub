import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownPreview } from './questionPreview';

describe('AskCoreWorkbench real mathematics preview', () => {
  it.each([
    {
      expressions: ['2x = 8'],
      source: '$2x = 8$',
    },
    {
      expressions: ['2x + 3 = 11'],
      source: 'Solve $2x + 3 = 11$. Show your steps.',
    },
    {
      expressions: ['2x + 3 = 11', '2x = 8', 'x = 4'],
      source: 'Question 1: $2x + 3 = 11$; $2x = 8$; $x = 4$.',
    },
  ])(
    'renders every inline expression without corrupting source: $source',
    async ({ source, expressions }) => {
      const { container } = render(<MarkdownPreview content={source} />);

      await waitFor(() => {
        const mathematics = container.querySelectorAll('.katex');
        expect(mathematics).toHaveLength(expressions.length);
        expect(
          [...container.querySelectorAll('annotation[encoding="application/x-tex"]')].map(
            (annotation) => annotation.textContent?.trim(),
          ),
        ).toEqual(expressions);
      });
      expect(container.querySelector('.katex-error')).toBeNull();
      expect(container.querySelector('.katex-display')).toBeNull();
      expect(container.textContent).not.toContain('$');
    },
  );

  it('preserves escaped literal currency and code under the source Markdown grammar', async () => {
    // Literal dollars are escaped by the source contract; paired dollars denote math.
    const source = String.raw`Price: \$20 and \$30. Code: ` + '`$2x + 3 = 11$`. Math: $2x = 8$.';
    const { container } = render(<MarkdownPreview content={source} />);

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.querySelector('code')?.textContent).toBe('$2x + 3 = 11$');
    expect(container.textContent).toContain('Price: $20 and $30.');
    expect(container.querySelector('annotation')?.textContent).toBe('2x = 8');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('keeps unpaired dollars literal and parses paired spans without guessing currency', async () => {
    const { container } = render(<MarkdownPreview content={'Cost $20.\n\n$20 and $30'} />);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.textContent).toContain('Cost $20.');
    expect(container.querySelector('annotation')?.textContent).toBe('20 and');
    expect(container.textContent).toContain('30');
  });

  it('preserves display mathematics, escaped TeX dollars, and chemical formula notation', async () => {
    const source = String.raw`Inline $2 + \$x$ and $\mathrm{H_2O}$.

$$
\frac{2}{3} + x = 4
$$`;
    const { container } = render(<MarkdownPreview content={source} />);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(3));
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
    expect([...container.querySelectorAll('annotation')].map((node) => node.textContent)).toEqual([
      String.raw`2 + \$x`,
      String.raw`\mathrm{H_2O}`,
      String.raw`\frac{2}{3} + x = 4`,
    ]);
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('preserves literal formulas in inline, fenced, indented, and TikZ code', async () => {
    const source = [
      '`$2x$`',
      '',
      '```text',
      '$3x$',
      '```',
      '',
      '    $4x$',
      '',
      '```tikz',
      String.raw`\begin{tikzpicture} $5x$ \end{tikzpicture}`,
      '```',
    ].join('\n');
    const { container } = render(<MarkdownPreview content={source} />);
    await waitFor(() => expect(container.textContent).toContain('$5x$'));
    for (const formula of ['$2x$', '$3x$', '$4x$', '$5x$']) {
      expect(container.textContent).toContain(formula);
    }
    expect(container.querySelector('.katex')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('retains Markdown links, images, lists and tables with safe HTML and URL handling', async () => {
    const source = [
      '[Source](https://example.test/source)',
      '',
      '![Diagram](https://example.test/diagram.png)',
      '',
      '- **First**',
      '- Second',
      '',
      '| Value |',
      '| --- |',
      '| $2x$ |',
      '',
      '<script>alert(1)</script>',
      '',
      '<img src="x" onerror="alert(1)">',
      '',
      '[unsafe](javascript:alert%281%29)',
    ].join('\n');
    const { container } = render(<MarkdownPreview content={source} />);
    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://example.test/source');
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute('src', 'https://example.test/diagram.png');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('First');
    expect(container.querySelector('table .katex')).not.toBeNull();
    expect(container.querySelector('script, [onerror]')).toBeNull();
    expect([...container.querySelectorAll('a')].some((link) => link.getAttribute('href')?.startsWith('javascript:'))).toBe(false);
  });

});
