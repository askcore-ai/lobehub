/**
 * @vitest-environment happy-dom
 */
import type { ConversationContext, UIChatMessage } from '@lobechat/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { ConversationProvider } from './ConversationProvider';
import { useScientificContentRenderEnabled } from './Markdown/plugins/TikZ/context';
import { dataSelectors, useConversationStore } from './store';

const oldContext = {
  agentId: 'agt_old',
  threadId: null,
  topicId: 'tpc_old',
} satisfies ConversationContext;

const nextContext = {
  agentId: 'agt_next',
  threadId: null,
  topicId: null,
} satisfies ConversationContext;

const oldMessages = [
  {
    content: 'old message',
    createdAt: 1,
    id: 'msg_old',
    role: 'user',
    updatedAt: 1,
  },
] as UIChatMessage[];

interface Snapshot {
  actualContextKey: string;
  displayMessageIds: string[];
  expectedContextKey: string;
}

const Probe = ({
  expectedContext,
  snapshots,
}: {
  expectedContext: ConversationContext;
  snapshots: Snapshot[];
}) => {
  const context = useConversationStore((s) => s.context);
  const displayMessageIds = useConversationStore(dataSelectors.displayMessageIds);

  snapshots.push({
    actualContextKey: messageMapKey(context),
    displayMessageIds,
    expectedContextKey: messageMapKey(expectedContext),
  });

  return null;
};

const ScientificContentProbe = () => (
  <span>{useScientificContentRenderEnabled() ? 'enabled' : 'disabled'}</span>
);

describe('ConversationProvider', () => {
  it('does not expose the previous local conversation store after context changes', () => {
    const snapshots: Snapshot[] = [];

    const { rerender } = render(
      <ConversationProvider hasInitMessages context={oldContext} messages={oldMessages}>
        <Probe expectedContext={oldContext} snapshots={snapshots} />
      </ConversationProvider>,
    );

    rerender(
      <ConversationProvider context={nextContext} hasInitMessages={false}>
        <Probe expectedContext={nextContext} snapshots={snapshots} />
      </ConversationProvider>,
    );

    const mismatchedNextContextSnapshots = snapshots.filter(
      (snapshot) =>
        snapshot.expectedContextKey === messageMapKey(nextContext) &&
        snapshot.actualContextKey !== snapshot.expectedContextKey,
    );

    expect(mismatchedNextContextSnapshots).toEqual([]);
  });

  it('defaults scientific rendering to disabled for unapproved surfaces', () => {
    render(
      <ConversationProvider context={{ ...oldContext, scope: 'page' }}>
        <ScientificContentProbe />
      </ConversationProvider>,
    );

    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('enables scientific rendering only with an explicit surface opt-in', () => {
    render(
      <ConversationProvider enableScientificContent context={oldContext}>
        <ScientificContentProbe />
      </ConversationProvider>,
    );

    expect(screen.getByText('enabled')).toBeInTheDocument();
  });

  it('disables scientific rendering for public topic shares even with an opt-in', () => {
    render(
      <ConversationProvider
        enableScientificContent
        context={{ ...oldContext, topicShareId: 'public-share' }}
      >
        <ScientificContentProbe />
      </ConversationProvider>,
    );

    expect(screen.getByText('disabled')).toBeInTheDocument();
  });

  it('accepts an explicit exclusion for share-image rendering', () => {
    render(
      <ConversationProvider context={oldContext} enableScientificContent={false}>
        <ScientificContentProbe />
      </ConversationProvider>,
    );

    expect(screen.getByText('disabled')).toBeInTheDocument();
  });
});
