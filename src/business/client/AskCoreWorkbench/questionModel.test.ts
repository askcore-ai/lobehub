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

    expect(model.questionType).toBe('选择题');
    expect(model.schemaRef).toBe('choice_question');
    expect(model.stem).toBe('已知函数 $f(x)=x^2+1$。');
    expect(model.options).toHaveLength(2);
    expect(model.answerText).toBe('A');
    expect(model.thinking).toBe('顶点在 $x=0$。');
  });

  it('deserializes P41 Gaokao payloads from content_markdown fields', () => {
    const model = deserializeQuestionPayload({
      answer: {
        raw_markdown: 'A',
        version: 'question.answer@gaokao.v1',
      },
      content: {
        assets: [],
        content_markdown: '已知函数 $f(x)=x^2+1$，则 $f(1)=$( )',
        options: [
          { content_markdown: '$1$', label: 'A' },
          { content_markdown: '$2$', label: 'B' },
        ],
        schema_ref: 'choice_question',
        subquestions: [],
        version: 'question.content@gaokao.v1',
      },
      question_type: '选择题',
    });

    expect(model.questionType).toBe('选择题');
    expect(model.schemaRef).toBe('choice_question');
    expect(model.stem).toBe('已知函数 $f(x)=x^2+1$，则 $f(1)=$( )');
    expect(model.options[0]).toMatchObject({ content: '$1$', label: 'A' });
    expect(model.answerText).toBe('A');
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
      questionType: '解答题',
      schemaRef: 'constructed_response_question',
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
      schema_ref: 'constructed_response_question',
      subquestions: [{ id: 'sq1', score: 3 }],
      version: 'question.content@gaokao.v1',
    });
    expect(payload.answer).toMatchObject({
      raw_markdown: '$1$',
      subanswers: [{ answer_markdown: '$1$', subquestion_id: 'sq1' }],
      version: 'question.answer@gaokao.v1',
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
