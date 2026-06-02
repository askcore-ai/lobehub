import { createStaticStyles, cssVar } from 'antd-style';

export const styles = createStaticStyles(({ css }) => ({
  page: css`
    overflow: auto;

    width: 100%;
    min-height: 100%;
    padding: 24px;

    background: ${cssVar.colorBgLayout};
  `,
  pageInner: css`
    display: flex;
    flex-direction: column;
    gap: 20px;

    width: min(960px, 100%);
    margin-block: 0;
    margin-inline: auto;
  `,

  // Hero Card
  heroCard: css`
    position: relative;

    overflow: hidden;
    display: flex;
    gap: 16px;
    align-items: center;

    padding-block: 20px;
    padding-inline: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};

    transition: box-shadow 0.25s ease, transform 0.25s ease;

    &:hover {
      box-shadow: 0 8px 24px rgb(0 0 0 / 6%);
    }
  `,
  heroAvatarWrap: css`
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  `,
  heroAvatar: css`
    border: 2px solid ${cssVar.colorBgContainer};
    box-shadow: 0 2px 6px rgb(0 0 0 / 8%);
  `,
  heroBody: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;

    min-width: 0;
  `,
  heroName: css`
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    color: ${cssVar.colorText};
  `,
  heroDesc: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-size: 13px;
    font-weight: 400;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
  `,
  heroStats: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;

    margin-block-start: 2px;
  `,
  heroEditForm: css`
    max-width: 480px;
    margin-block: 20px 0;
    margin-inline: auto;

    text-align: start;

    transition: all 0.3s ease;
  `,
  heroEditActions: css`
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-block-start: 12px;
  `,

  // Tab Navigation
  tabNav: css`
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;

    width: fit-content;
    margin-block: 0;
    margin-inline: auto;
    padding: 4px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  tabButton: css`
    cursor: pointer;

    padding-block: 8px;
    padding-inline: 24px;
    border: none;
    border-radius: 10px;

    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    transition: all 0.2s ease;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  tabButtonActive: css`
    color: ${cssVar.colorBgContainer};
    background: ${cssVar.colorText};

    &:hover {
      color: ${cssVar.colorBgContainer};
    }
  `,
  tabContent: css`
    animation: org-fade-up 0.35s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
  `,

  // Stat Cards
  statGrid: css`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;

    @media (width <= 700px) {
      grid-template-columns: repeat(2, 1fr);
    }
  `,
  statCard: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;

    padding-block: 20px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 14px;

    text-align: center;

    background: ${cssVar.colorBgContainer};

    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgb(0 0 0 / 5%);
    }
  `,
  statValue: css`
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    color: ${cssVar.colorText};
  `,
  statLabel: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,

  // Section Cards
  sectionCard: css`
    overflow: hidden;

    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};

    transition: box-shadow 0.25s ease, transform 0.25s ease;

    &:hover {
      box-shadow: 0 4px 12px rgb(0 0 0 / 4%);
    }
  `,
  sectionHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    min-height: 52px;
    padding-block: 14px;
    padding-inline: 20px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionHeaderLeft: css`
    display: flex;
    gap: 10px;
    align-items: center;
  `,
  sectionTitle: css`
    font-size: 16px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  sectionSubtitle: css`
    font-size: 13px;
    font-weight: 400;
    color: ${cssVar.colorTextSecondary};
  `,
  sectionBody: css`
    padding-block: 16px;
padding-inline: 20px;
  `,

  // Member Card
  memberCard: css`
    display: flex;
    gap: 14px;
    align-items: center;

    padding-block: 14px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    transition: background 0.15s ease;

    &:last-child {
      border-block-end: 0;
    }

    &:hover {
      margin-block: 0;
      margin-inline: -20px;
      padding-inline: 20px;
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  memberAvatar: css`
    flex-shrink: 0;
  `,
  memberInfo: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;

    min-width: 0;
  `,
  memberName: css`
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: ${cssVar.colorText};
  `,
  memberEmail: css`
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
  `,
  memberMeta: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  memberActions: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
  `,

  // Role Tags
  roleTag: css`
    cursor: default;
    user-select: none;

    display: inline-flex;
    align-items: center;

    padding-block: 2px;
    padding-inline: 10px;
    border-radius: 6px;

    font-size: 12px;
    font-weight: 500;

    transition: opacity 0.15s ease;
  `,
  roleTagOwner: css`
    color: #92400e;
    background: #fef3c7;
  `,
  roleTagAdmin: css`
    color: #1e40af;
    background: #dbeafe;
  `,
  roleTagMember: css`
    color: ${cssVar.colorTextSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  roleTagEditable: css`
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  `,

  // Invite
  inviteSegmented: css`
    width: 100%;
    margin-block-end: 20px;

    .ant-segmented-item-label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      justify-content: center;

      min-height: 40px;
    }
  `,
  inviteChannels: css`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-block-end: 20px;
  `,
  inviteChannelCard: css`
    cursor: pointer;

    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;

    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};

    transition: all 0.2s ease;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
    }
  `,
  inviteChannelActive: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  inviteResultBox: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    margin-block-start: 16px;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorFillQuaternary};
  `,
  inviteResultTitle: css`
    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  inviteResultMeta: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    overflow-wrap: anywhere;
  `,
  inviteQrResult: css`
    align-items: center;
  `,

  // Tree
  treeRoot: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  orgTreeLayout: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;

    @media (width <= 820px) {
      grid-template-columns: 1fr;
    }
  `,
  orgTreePane: css`
    min-width: 0;
  `,
  treeRootActionRow: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 10px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  treeRootActionText: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  `,
  treeRootActionTitle: css`
    font-size: 13px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  treeRootActionHint: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  treeRootAddButton: css`
    width: 28px;
    min-width: 28px;
    height: 28px;
    border-radius: 8px;

    color: ${cssVar.colorTextSecondary};

    &:hover,
    &:focus-visible {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  treeRootInlineForm: css`
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) auto auto;
    gap: 8px;
    align-items: center;

    margin-block-end: 12px;
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorFillQuaternary};

    @media (width <= 700px) {
      grid-template-columns: 1fr;
    }
  `,
  treeNode: css`
    position: relative;
  `,
  treeNodeRow: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 10px;
    border-radius: 10px;

    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};

      .tree-node-actions {
        opacity: 1;
      }
    }
  `,
  treeNodeRowSelected: css`
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  treeNodeActions: css`
    display: flex;
    gap: 4px;
    align-items: center;

    margin-inline-start: auto;

    opacity: 0;

    transition: opacity 0.15s ease;
  `,
  treeAddButton: css`
    width: 24px;
    min-width: 24px;
    height: 24px;
    border-radius: 6px;

    color: ${cssVar.colorTextSecondary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  treeNodeChildren: css`
    position: relative;

    display: flex;
    flex-direction: column;
    gap: 2px;

    margin-inline-start: 18px;
    padding-inline-start: 14px;

    &::before {
      content: '';

      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;

      width: 1px;

      background: ${cssVar.colorBorderSecondary};
    }
  `,
  treeInlineForm: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 32px 0;
  `,
  treeBadge: css`
    display: inline-flex;
    align-items: center;

    padding-block: 1px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 11px;
    font-weight: 500;
    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  treeEmpty: css`
    padding-block: 32px;
    padding-inline: 0;
    text-align: center;
  `,
  orgRolePanel: css`
    min-width: 0;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorFillQuaternary};
  `,
  rolePanelHeader: css`
    display: flex;
    gap: 10px;
    align-items: flex-start;
    justify-content: space-between;

    margin-block-end: 12px;
  `,
  rolePanelTitle: css`
    font-size: 15px;
    font-weight: 700;
    color: ${cssVar.colorText};
  `,
  rolePanelMeta: css`
    margin-block-start: 2px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  roleAssignmentList: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-block-end: 14px;
  `,
  roleAssignmentItem: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    padding-block: 8px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 13px;

    &:last-child {
      border-block-end: 0;
    }
  `,
  roleAssignForm: css`
    padding-block-start: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  rolePanelEmpty: css`
    padding-block: 12px;
    padding-inline: 0;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  rolePanelEmptyState: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;

    min-height: 220px;

    color: ${cssVar.colorTextSecondary};
    text-align: center;
  `,

  // Settings
  settingsPanel: css`
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.3s ease;
  `,
  settingsHeader: css`
    cursor: pointer;
    user-select: none;

    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-block: 14px;
    padding-inline: 20px;
    border-radius: 16px;

    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  settingsBody: css`
    padding-block: 0 20px;
padding-inline: 20px;
  `,
  settingsRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-block: 10px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  settingsLabel: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  settingsValue: css`
    font-family: monospace;
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,

  // Search
  searchWrap: css`
    position: relative;
    width: 240px;

    @media (width <= 600px) {
      width: 100%;
    }
  `,
  searchInput: css`
    border-radius: 999px !important;

    .ant-input {
      border-radius: 999px !important;
    }
  `,

  // Roster waterfall
  rosterListHeader: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    margin-block-end: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    background: ${cssVar.colorFillQuaternary};
  `,
  rosterMasonry: css`
    column-count: 2;
    column-gap: 12px;

    @media (width <= 860px) {
      column-count: 1;
    }
  `,
  rosterCard: css`
    break-inside: avoid;

    margin-block-end: 12px;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
    box-shadow: 0 1px 2px rgb(0 0 0 / 3%);

    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      box-shadow: 0 4px 12px rgb(0 0 0 / 5%);
    }
  `,
  rosterCardSelected: css`
    border-color: ${cssVar.colorPrimary};
    box-shadow: 0 0 0 1px ${cssVar.colorPrimaryBorder};
  `,
  rosterCardHeader: css`
    display: flex;
    gap: 10px;
    align-items: flex-start;
  `,
  rosterCardTitleWrap: css`
    flex: 1;
    min-width: 0;
  `,
  rosterCardTitle: css`
    font-size: 14px;
    font-weight: 650;
    line-height: 1.5;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
  `,
  rosterCardMeta: css`
    margin-block-start: 2px;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    overflow-wrap: anywhere;
  `,
  rosterCardFields: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
  `,
  rosterFieldChip: css`
    display: inline-flex;
    gap: 5px;
    align-items: center;

    max-width: 100%;
    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;

    background: ${cssVar.colorFillQuaternary};

    span {
      color: ${cssVar.colorTextDescription};
    }

    strong {
      min-width: 0;
      font-weight: 500;
      color: ${cssVar.colorText};
    }
  `,
  rosterLoadStatus: css`
    margin-block-start: 12px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px dashed ${cssVar.colorBorderSecondary};
    border-radius: 10px;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;

    background: ${cssVar.colorFillQuaternary};
  `,
  scrollSentinel: css`
    height: 12px;
  `,

  // Animations
  staggerItem: css`
    transform: translateY(20px);
    opacity: 0;
    animation: org-fade-up 0.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;

    @keyframes org-fade-up {
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `,
  shake: css`
    animation: org-shake 0.3s ease;

    @keyframes org-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-4px); }
      40% { transform: translateX(4px); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }
  `,

  // Utility
  pillButton: css`
    border-radius: 999px !important;
  `,
  flexBetween: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  `,
  emptyState: css`
    padding-block: 48px;
    padding-inline: 0;
    text-align: center;
  `,
  copyBtn: css`
    opacity: 0.6;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 1;
    }
  `,
}));
