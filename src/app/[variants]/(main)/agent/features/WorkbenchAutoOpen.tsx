'use client';

import { memo, useEffect, useRef } from 'react';
import useSWR from 'swr';

import { useChatStore } from '@/store/chat';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import { useAgentContext } from './Conversation/useAgentContext';

type WorkbenchArtifact = {
  artifact_id: string;
  created_at: string;
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
};

/**
 * Auto-open in-chat Workbench portal when a new artifact appears for this conversation.
 *
 * Note: This uses polling as the MVP signal. P10 guarantees durability and discoverability
 * via `conversation_id`, so polling is sufficient to satisfy the UX requirement without
 * requiring new event-stream endpoints.
 */
export const WorkbenchAutoOpen = memo(() => {
  const { topicId, threadId } = useAgentContext();
  const conversationId = threadId
    ? `lc_thread:${threadId}`
    : topicId
      ? `lc_topic:${topicId}`
      : null;

  const initialized = useRef(false);
  const lastSeenArtifactId = useRef<string | null>(null);

  const { data: artifacts = [] } = useSWR<WorkbenchArtifact[]>(
    conversationId ? ['workbench:artifacts:latest', conversationId] : null,
    async ([, conversationId]: readonly [string, string]) =>
      fetchJson(
        `/api/workbench/artifacts?conversation_id=${encodeURIComponent(conversationId)}&limit=1`,
      ),
    { refreshInterval: 2000, shouldRetryOnError: false },
  );

  useEffect(() => {
    if (!conversationId) return;
    if (artifacts.length === 0) return;

    const latest = artifacts[0];

    if (!initialized.current) {
      initialized.current = true;
      lastSeenArtifactId.current = latest.artifact_id;
      return;
    }

    if (lastSeenArtifactId.current === latest.artifact_id) return;

    lastSeenArtifactId.current = latest.artifact_id;

    useChatStore.getState().pushPortalView({
      artifactId: latest.artifact_id,
      conversationId,
      type: PortalViewType.Workbench,
    });
  }, [artifacts, conversationId]);

  return null;
});

export default WorkbenchAutoOpen;
