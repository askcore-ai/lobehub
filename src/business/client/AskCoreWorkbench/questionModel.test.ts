import { describe, expect, it } from 'vitest';

import {
  buildQuestionPreviewDataFromPayload,
  deserializeQuestionPayload,
  serializeQuestionForm,
} from './questionModel';
import type { JsonRecord } from './types';

describe('AskCoreWorkbench questionModel', () => {
  it('deserializes versioned payloads into editable question models', () => {
    const payload: JsonRecord = {
      answer: {
        selected_option_id: 'A',
        text: 'A',
        version: 'question.answer@v1',
      },
      content: {
        options: [
          { content: { nodes: [{ kind: 'text', text: '$x^2+1$' }] }, id: 'A', label: 'A' },
          { content: { nodes: [{ kind: 'text', text: '$x+1$' }] }, id: 'B', label: 'B' },
        ],
        points: 5,
        stem: { nodes: [{ kind: 'text', text: '已知函数 $f(x)=x^2+1$。' }] },
        version: 'question.content@v1',
      },
      grade_id: 3,
      question_type: 'single_choice',
      subject_id: 1,
      thinking: { text: '顶点在 $x=0$。', version: 'question.thinking@v1' },
    };

    const model = deserializeQuestionPayload(payload);

    expect(model.questionType).toBe('single_choice');
    expect(model.stem).toBe('已知函数 $f(x)=x^2+1$。');
    expect(model.options).toHaveLength(2);
    expect(model.answerText).toBe('A');
    expect(model.thinking).toBe('顶点在 $x=0$。');
  });

  it('serializes sub-question edits without losing answers or thinking', () => {
    const payload = serializeQuestionForm({
      answerText: '',
      difficulty: '0.4',
      extraData: {},
      gradeId: '3',
      knowledgePoints: ['函数'],
      options: [],
      points: '',
      questionType: 'problem_solving',
      stem: '阅读材料并回答问题。',
      subjectId: '1',
      subQuestions: [
        {
          answerText: '$1$',
          id: 'sq1',
          points: '3',
          prompt: '求 $f(0)$。',
          thinking: '代入即可。',
        },
      ],
      thinking: '',
    });

    expect(payload.content).toMatchObject({
      sub_questions: [{ id: 'sq1', points: 3 }],
      version: 'question.content@v1',
    });
    expect(payload.answer).toMatchObject({
      sub_answers: [{ sub_question_id: 'sq1', value: { text: '$1$' } }],
      version: 'question.answer@v1',
    });
    expect(payload.thinking).toMatchObject({
      sub_thinking: [{ sub_question_id: 'sq1', text: '代入即可。' }],
      version: 'question.thinking@v1',
    });
  });

  it('builds markdown previews instead of raw JSON previews', () => {
    const preview = buildQuestionPreviewDataFromPayload({
      content: {
        stem: { nodes: [{ kind: 'text', text: '计算 $x^2+1$。' }] },
        version: 'question.content@v1',
      },
      question_type: 'problem_solving',
    });

    expect(preview.summaryMarkdown).toBe('计算 $x^2+1$。');
    expect(JSON.stringify(preview)).not.toContain('[object Object]');
  });
});
