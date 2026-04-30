import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildQuestionPreviewDataFromPayload } from './questionModel';
import { QuestionCompactPreview, QuestionSummaryPreview } from './questionPreview';

vi.mock('@lobehub/ui', () => ({
  Markdown: ({ children, enableLatex }: { children: string; enableLatex?: boolean }) => (
    <div data-enable-latex={String(Boolean(enableLatex))}>{children}</div>
  ),
}));

describe('AskCoreWorkbench questionPreview', () => {
  it('renders compact Markdown and LaTeX previews without raw JSON', () => {
    const preview = buildQuestionPreviewDataFromPayload({
      content: {
        stem: { nodes: [{ kind: 'text', text: '计算 $x^2+1$。' }] },
        version: 'question.content@v1',
      },
      question_type: 'problem_solving',
    });

    const { container } = render(<QuestionCompactPreview preview={preview} />);

    expect(screen.getByText('题干')).toBeInTheDocument();
    expect(screen.getByText('计算 $x^2+1$。')).toBeInTheDocument();
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.textContent).not.toContain('"nodes"');
    expect(container.querySelector('[data-enable-latex="true"]')).not.toBeNull();
  });

  it('renders list summaries as Markdown instead of JSON strings', () => {
    const preview = buildQuestionPreviewDataFromPayload({
      content: {
        stem: { nodes: [{ kind: 'text', text: '若 $a>b$，求证 $a+1>b+1$。' }] },
        version: 'question.content@v1',
      },
      question_type: 'problem_solving',
    });

    const { container } = render(<QuestionSummaryPreview preview={preview} />);

    expect(screen.getByText('若 $a>b$，求证 $a+1>b+1$。')).toBeInTheDocument();
    expect(container.textContent).not.toContain('[object Object]');
  });
});
