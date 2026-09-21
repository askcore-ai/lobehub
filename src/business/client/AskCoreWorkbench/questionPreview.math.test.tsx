import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownPreview } from './questionPreview';

describe('AskCoreWorkbench real mathematics preview', () => {
  it.each([
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
      expect(container.textContent).not.toContain('$');
    },
  );

  it('preserves literal code and currency while rendering adjacent numeric mathematics', async () => {
    const source = 'Price: $20 and $30. Code: `$2x + 3 = 11$`. Math: $2x = 8$.';
    const { container } = render(<MarkdownPreview content={source} />);

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(1));
    expect(container.querySelector('code')?.textContent).toBe('$2x + 3 = 11$');
    expect(container.textContent).toContain('Price: $20 and $30.');
    expect(container.querySelector('annotation')?.textContent).toBe('2x = 8');
    expect(container.querySelector('.katex-error')).toBeNull();
  });
});
