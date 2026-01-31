'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Button, Input, Modal, Space, Typography } from 'antd';
import { memo, useMemo, useState } from 'react';

type Props = {
  artifactId: string;
  conversationId: string;
  initialContent: Record<string, unknown>;
  onClose: () => void;
};

type StartInvocationResponse = { invocation_id: string; run_id: number };

const QUESTION_CONTENT_VERSION = 'question.content@v1';
const QUESTION_ANSWER_VERSION = 'question.answer@v1';

const AssignmentDraftEditor = memo<Props>(
  ({ artifactId, conversationId, initialContent, onClose }) => {
    const { message } = App.useApp();

    const initialTitle = String((initialContent as any)?.title || '').trim();
    const initialDueDate = String((initialContent as any)?.due_date || '').trim();
    const subjectId = Number((initialContent as any)?.subject_id || 0);
    const gradeId = Number((initialContent as any)?.grade_id || 0);

    const initialQuestions = Array.isArray((initialContent as any)?.questions)
      ? (initialContent as any).questions
      : [];

    const [title, setTitle] = useState(initialTitle);
    const [dueDate, setDueDate] = useState(initialDueDate);
    const [draftQuestionsJson, setDraftQuestionsJson] = useState(() =>
      JSON.stringify(initialQuestions, null, 2),
    );
    const [saving, setSaving] = useState(false);

    const idempotencyKey = useMemo(
      () => `assignment-draft-save:${artifactId}:${Date.now()}`,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [artifactId],
    );

    const addProblemSolvingQuestion = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draftQuestionsJson || '[]');
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Invalid JSON');
        return;
      }
      const arr = Array.isArray(parsed) ? parsed : [];
      const maxOrder = arr.reduce((acc, item) => {
        const v = Number((item as any)?.order_index || 0);
        return Number.isFinite(v) ? Math.max(acc, v) : acc;
      }, 0);

      const nextOrder = maxOrder + 1;

      const next = {
        answer: {
          sub_answers: [{ sub_question_id: 'sq1', value: { raw_text: '' } }],
          version: QUESTION_ANSWER_VERSION,
        },
        content: {
          assets: [],
          stem: { nodes: [] },
          sub_questions: [{ id: 'sq1', prompt: { nodes: [{ kind: 'text', text: '' }] } }],
          version: QUESTION_CONTENT_VERSION,
        },
        grade_id: gradeId || 1,
        order_index: nextOrder,
        question_type: 'problem_solving',
        subject_id: subjectId || 1,
        thinking: null,
      };

      setDraftQuestionsJson(JSON.stringify([...arr, next], null, 2));
    };

    const onSave = async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draftQuestionsJson || '[]');
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Invalid JSON');
        return;
      }

      if (!Array.isArray(parsed)) {
        message.error('questions must be a JSON array');
        return;
      }

      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        message.error('title is required');
        return;
      }

      const normalizedDueDate = dueDate.trim();

      Modal.confirm({
        content:
          'Save as a new draft revision? This will create a new Workbench run and a new assignment.draft artifact revision.',
        okText: 'Confirm',
        onOk: async () => {
          setSaving(true);
          try {
            const res = await fetch('/api/workbench/invocations', {
              body: JSON.stringify({
                action_id: 'assignment.draft.save',
                confirmation_id: null,
                conversation_id: conversationId,
                params: {
                  draft_artifact_id: artifactId,
                  due_date: normalizedDueDate || undefined,
                  questions: parsed,
                  title: normalizedTitle,
                },
                plugin_id: 'assignment.authoring.v1',
              }),
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
              },
              method: 'POST',
            });

            if (!res.ok) {
              const text = await res.text();
              message.error(text || `Save failed (${res.status})`);
              return;
            }

            const data = (await res.json()) as StartInvocationResponse;
            message.success(`Save started (run ${data.run_id}).`);
            onClose();
          } finally {
            setSaving(false);
          }
        },
        title: 'Confirm save',
      });
    };

    return (
      <Flexbox gap={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Edit assignment draft
        </Typography.Title>

        <Space wrap>
          <Input
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            style={{ minWidth: 240 }}
            value={title}
          />
          <Input
            onChange={(e) => setDueDate(e.target.value)}
            placeholder="Due date (RFC3339, optional)"
            style={{ minWidth: 260 }}
            value={dueDate}
          />
          <Button onClick={addProblemSolvingQuestion} size="small">
            + Add question
          </Button>
        </Space>

        <Typography.Text type="secondary">
          Edit `questions` as JSON. Each item is upserted into canonical `questions` and the draft
          is saved as a new immutable artifact revision.
        </Typography.Text>

        <Input.TextArea
          autoSize={{ maxRows: 18, minRows: 10 }}
          onChange={(e) => setDraftQuestionsJson(e.target.value)}
          value={draftQuestionsJson}
        />
        <Space>
          <Button loading={saving} onClick={onSave} type="primary">
            Save draft
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      </Flexbox>
    );
  },
);

export default AssignmentDraftEditor;
