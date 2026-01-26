'use client';

import { Flexbox } from '@lobehub/ui';
import { App, Button, Input, Modal, Space, Typography } from 'antd';
import { memo, useMemo, useState } from 'react';

import { HelloPluginIdentifier } from '@lobechat/builtin-tool-hello-plugin';

type Props = {
  artifactId: string;
  conversationId: string;
  initialContent: Record<string, unknown>;
  onClose: () => void;
};

type StartInvocationResponse = { invocation_id: string; run_id: number };

const HelloTableEditor = memo<Props>(({ artifactId, conversationId, initialContent, onClose }) => {
  const { message } = App.useApp();
  const [draft, setDraft] = useState(() => JSON.stringify(initialContent, null, 2));
  const [saving, setSaving] = useState(false);

  const idempotencyKey = useMemo(
    () => `hello-save:${artifactId}:${Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifactId],
  );

  const onSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }

    Modal.confirm({
      content: 'Save as a new revision? This will create a new Workbench run and a new artifact revision.',
      okText: 'Confirm',
      onOk: async () => {
        setSaving(true);
        try {
          const res = await fetch('/api/workbench/invocations', {
            body: JSON.stringify({
              action_id: 'hello-save',
              confirmation_id: `confirm:${Date.now()}`,
              conversation_id: conversationId,
              params: {
                base_artifact_id: artifactId,
                content: parsed,
                expected_latest_artifact_id: artifactId,
              },
              plugin_id: HelloPluginIdentifier,
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
        Edit hello.table
      </Typography.Title>
      <Input.TextArea
        autoSize={{ maxRows: 18, minRows: 10 }}
        onChange={(e) => setDraft(e.target.value)}
        value={draft}
      />
      <Space>
        <Button loading={saving} onClick={onSave} type="primary">
          Save
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </Space>
    </Flexbox>
  );
});

export default HelloTableEditor;
