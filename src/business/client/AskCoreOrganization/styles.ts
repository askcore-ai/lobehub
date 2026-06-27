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
  pageInnerWide: css`
    gap: 16px;
    width: min(1440px, 100%);
  `,

  // Hero Card
  heroCard: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: stretch;

    padding-block: 20px;
    padding-inline: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};

    transition:
      box-shadow 0.25s ease,
      transform 0.25s ease;

    &:hover {
      box-shadow: 0 8px 24px rgb(0 0 0 / 6%);
    }
  `,
  heroSummary: css`
    display: flex;
    gap: 16px;
    align-items: center;
    min-width: 0;

    @media (width <= 700px) {
      flex-wrap: wrap;
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
  heroOverviewStats: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    @media (width <= 760px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  heroOverviewStat: css`
    display: flex;
    gap: 8px;
    align-items: baseline;
    justify-content: space-between;

    min-width: 0;
    padding-block: 8px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};

    strong {
      font-size: 18px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      color: ${cssVar.colorText};
    }

    span {
      overflow: hidden;

      font-size: 12px;
      color: ${cssVar.colorTextSecondary};
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  heroEditForm: css`
    width: 100%;
    text-align: start;
    transition: all 0.3s ease;
  `,
  heroEditActions: css`
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-block-start: 12px;
  `,
  heroInfoGrid: css`
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px 16px;

    padding-block-start: 2px;

    font-size: 13px;
    line-height: 1.5;

    span {
      color: ${cssVar.colorTextSecondary};
    }

    strong {
      min-width: 0;
      font-weight: 500;
      color: ${cssVar.colorText};
      overflow-wrap: anywhere;
    }

    @media (width <= 700px) {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  `,
  heroOrgId: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-family: monospace;
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

    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

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

    transition:
      box-shadow 0.25s ease,
      transform 0.25s ease;

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
  identityLayout: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 20px;

    @media (width <= 820px) {
      grid-template-columns: 1fr;
    }
  `,
  identityPanel: css`
    min-width: 0;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorFillQuaternary};
  `,
  identityPanelHeader: css`
    margin-block-end: 12px;
  `,
  identityClaimList: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
  `,
  identityClaimItem: css`
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;

    min-height: 56px;
    padding-block: 10px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }

    @media (width <= 700px) {
      flex-direction: column;
      align-items: flex-start;
    }
  `,
  identityClaimMain: css`
    min-width: 0;
  `,
  identityClaimTitle: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 650;
    line-height: 1.45;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  identityClaimMeta: css`
    margin-block-start: 2px;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
    overflow-wrap: anywhere;
  `,
  identityClaimLoading: css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
  `,

  // Settings
  settingsPanel: css`
    overflow: hidden;
    transition:
      max-height 0.3s ease,
      opacity 0.3s ease;
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
  csvFormatGuide: css`
    margin-block-end: 12px;

    .ant-alert-message,
    .ant-alert-title {
      font-weight: 650;
    }
  `,
  csvFormatDescription: css`
    display: grid;
    gap: 6px;

    font-size: 13px;
    line-height: 1.6;
    color: ${cssVar.colorTextSecondary};

    strong {
      color: ${cssVar.colorText};
    }
  `,
  csvFormatExample: css`
    display: block;

    max-width: 100%;
    margin-block-start: 4px;
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: 6px;

    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorText};
    overflow-wrap: anywhere;
    white-space: pre-wrap;

    background: ${cssVar.colorFillQuaternary};
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

    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;

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

  // Unified Directory
  directorySurface: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    box-sizing: border-box;
    width: 100%;
    padding: 16px;
    border: 1px solid #e5e6eb;
    border-radius: 8px;

    color: #1f2329;

    background: #f7f8fa;

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :where(.ant-btn) {
      min-height: 34px;
      border-radius: 6px;
      box-shadow: none;
    }

    :where(.ant-input-affix-wrapper, .ant-select-selector) {
      min-height: 34px !important;
      border-radius: 6px !important;
    }

    :where(.ant-form-item) {
      margin-block-end: 0;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorText};
      background: ${cssVar.colorBgLayout};
    }
  `,
  directoryTopbar: css`
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;

    padding-block: 2px 6px;

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.3;
      color: #1f2329;
    }

    p {
      margin-block-start: 4px;
      font-size: 13px;
      line-height: 1.5;
      color: #646a73;
    }

    @media (width <= 700px) {
      flex-direction: column;
    }

    @media (prefers-color-scheme: dark) {
      h2 {
        color: ${cssVar.colorText};
      }

      p {
        color: ${cssVar.colorTextSecondary};
      }
    }
  `,
  directoryTopbarActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;

    @media (width <= 700px) {
      justify-content: flex-start;
      width: 100%;
    }
  `,
  directoryCommandBar: css`
    display: grid;
    grid-template-columns: minmax(220px, 320px) minmax(280px, 1fr) auto;
    gap: 10px;
    align-items: center;

    padding: 10px;
    border: 1px solid #e5e6eb;
    border-radius: 8px;

    background: #fff;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      background: ${cssVar.colorBgContainer};
    }
  `,
  directoryFilterGroup: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  `,
  directoryFilterChip: css`
    cursor: pointer;

    min-height: 28px;
    padding-block: 4px;
    padding-inline: 10px;
    border: 1px solid transparent;
    border-radius: 6px;

    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    color: #646a73;

    background: transparent;

    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;

    &:hover {
      color: #1f2329;
      background: #f2f3f5;
    }

    &:focus-visible {
      outline: 2px solid rgb(51 112 255 / 30%);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextSecondary};

      &:hover {
        color: ${cssVar.colorText};
        background: ${cssVar.colorFillQuaternary};
      }
    }
  `,
  directoryFilterChipActive: css`
    border-color: #bdd2ff;
    color: #245bdb;
    background: #eef5ff;

    &:hover {
      color: #245bdb;
      background: #eef5ff;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorPrimaryBorder};
      color: ${cssVar.colorPrimaryText};
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  directoryActionPanel: css`
    width: min(320px, calc(100vw - 48px));
  `,
  directoryActionPanelTitle: css`
    margin-block-end: 12px;
    font-size: 14px;
    font-weight: 650;
    color: #1f2329;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorText};
    }
  `,
  directoryActionForm: css`
    display: grid;
    gap: 10px;

    .ant-form-item-label {
      padding-block-end: 3px;
    }

    .ant-form-item-label > label {
      height: auto;
      font-size: 12px;
      color: ${cssVar.colorTextSecondary};
    }
  `,
  directoryWorkspace: css`
    display: grid;
    grid-template-columns: 240px minmax(420px, 1fr) 320px;
    gap: 16px;
    align-items: stretch;

    @media (width <= 1360px) {
      grid-template-columns: 220px minmax(360px, 1fr) 280px;
    }

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
    }
  `,
  directoryPane: css`
    overflow: hidden;
    display: flex;
    flex-direction: column;

    min-width: 0;
    min-height: 620px;
    border: 1px solid #e5e6eb;
    border-radius: 8px;

    background: #fff;

    @media (width <= 1100px) {
      min-height: 0;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      background: ${cssVar.colorBgContainer};
    }
  `,
  directoryPaneTitle: css`
    margin: 0;
    padding-block: 14px 10px;
    padding-inline: 16px;

    font-size: 14px;
    font-weight: 650;
    line-height: 1.45;
    color: #1f2329;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorText};
    }
  `,
  directoryPaneHeader: css`
    display: flex;
    gap: 10px;
    align-items: flex-start;
    justify-content: space-between;

    padding-block: 14px;
    padding-inline: 16px;
    border-block-end: 1px solid #e5e6eb;

    @media (width <= 700px) {
      flex-direction: column;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
    }
  `,
  directoryBreadcrumb: css`
    margin-block-end: 3px;

    font-size: 12px;
    line-height: 1.45;
    color: #86909c;
    overflow-wrap: anywhere;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextDescription};
    }
  `,
  directoryPaneMeta: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;

    font-size: 12px;
    line-height: 1.5;
    color: #646a73;
    overflow-wrap: anywhere;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  directoryTree: css`
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;

    padding-block: 0 14px;
    padding-inline: 10px;
  `,
  directoryTreeNode: css`
    cursor: pointer;

    position: relative;

    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    min-height: 34px;
    padding-block: 6px;
    padding-inline: 10px;
    border: 0;
    border-radius: 6px;

    font-size: 13px;
    color: #1f2329;
    text-align: start;

    background: transparent;

    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;

    &::before {
      content: '';

      position: absolute;
      inset-block: 5px;
      inset-inline-start: 0;

      width: 3px;
      border-radius: 999px;

      opacity: 0;
      background: ${cssVar.colorPrimary};

      transition: opacity 0.15s ease;
    }

    &:hover {
      background: #f2f3f5;
    }

    &:focus-visible {
      outline: 2px solid rgb(51 112 255 / 30%);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;

      &::before {
        transition: none;
      }
    }

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorText};

      &:hover {
        background: ${cssVar.colorFillQuaternary};
      }
    }
  `,
  directoryTreeNodeActive: css`
    font-weight: 650;
    color: #245bdb;
    background: #eef5ff;

    &::before {
      opacity: 1;
    }

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorPrimaryText};
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  directoryTreeNodeAncestor: css`
    color: #245bdb;
    background: #f7faff;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorPrimaryText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  directoryTreeNodeLabel: css`
    display: grid;
    gap: 1px;
    min-width: 0;

    span,
    small {
      overflow: hidden;
      min-width: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      font-size: 11px;
      font-weight: 400;
      color: #86909c;

      @media (prefers-color-scheme: dark) {
        color: ${cssVar.colorTextDescription};
      }
    }
  `,
  directoryTreeCount: css`
    flex-shrink: 0;

    min-width: 26px;
    padding-block: 2px;
    padding-inline: 7px;
    border-radius: 999px;

    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    color: #646a73;
    text-align: center;

    background: #f2f3f5;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  directoryScopeOption: css`
    display: grid;
    gap: 2px;
    line-height: 1.35;

    span,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      font-size: 13px;
      color: ${cssVar.colorText};
    }

    small {
      font-size: 11px;
      color: ${cssVar.colorTextDescription};
    }
  `,
  directoryInlineForm: css`
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-block-start: 10px;

    .ant-form-item {
      margin-block-end: 0;
    }
  `,
  directoryNodeActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;

    @media (width <= 760px) {
      justify-content: flex-start;
    }
  `,
  directoryPeopleTable: css`
    overflow: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  `,
  directoryPeopleHeader: css`
    position: sticky;
    z-index: 1;
    inset-block-start: 0;

    display: grid;
    grid-template-columns:
      minmax(110px, 1.1fr) minmax(120px, 1.1fr) minmax(116px, 1fr)
      58px 74px 64px;
    gap: 8px;
    align-items: center;

    min-height: 36px;
    padding-inline: 14px;
    border-block-end: 1px solid #e5e6eb;

    font-size: 12px;
    font-weight: 600;
    color: #86909c;

    background: #fff;

    @media (width <= 700px) {
      display: none;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorTextDescription};
      background: ${cssVar.colorBgContainer};
    }
  `,
  directoryPersonRow: css`
    cursor: pointer;

    position: relative;

    display: grid;
    grid-template-columns:
      minmax(110px, 1.1fr) minmax(120px, 1.1fr) minmax(116px, 1fr)
      58px 74px 64px;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 58px;
    padding-block: 8px;
    padding-inline: 14px;
    border: 0;
    border-block-end: 1px solid #e5e6eb;
    border-radius: 0;

    text-align: start;

    background: transparent;

    transition:
      background 0.15s ease,
      transform 0.15s ease;

    &::before {
      content: '';

      position: absolute;
      inset-block: 8px;
      inset-inline-start: 0;

      width: 3px;
      border-radius: 999px;

      opacity: 0;
      background: #3370ff;
    }

    strong,
    small {
      overflow: hidden;
      display: block;

      min-width: 0;

      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:hover {
      background: #f7f8fa;
    }

    &:focus-visible {
      outline: 2px solid rgb(51 112 255 / 30%);
      outline-offset: -2px;
    }

    &:active {
      transform: translateY(1px);
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;

      &:active {
        transform: none;
      }
    }

    @media (width <= 700px) {
      grid-template-columns: 1fr;
      gap: 6px;
      padding-block: 12px;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};

      &:hover {
        background: ${cssVar.colorFillQuaternary};
      }
    }
  `,
  directoryPersonRowActive: css`
    background: #eef5ff;

    &::before {
      opacity: 1;
    }

    @media (prefers-color-scheme: dark) {
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  directoryPersonIdentity: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;

    svg {
      flex-shrink: 0;
      color: #86909c;
    }

    strong {
      font-size: 14px;
      font-weight: 650;
      line-height: 1.35;
      color: #1f2329;
    }

    small {
      margin-block-start: 2px;
      font-size: 12px;
      line-height: 1.35;
      color: #86909c;
    }

    @media (prefers-color-scheme: dark) {
      svg,
      small {
        color: ${cssVar.colorTextDescription};
      }

      strong {
        color: ${cssVar.colorText};
      }
    }
  `,
  directoryCellText: css`
    overflow: hidden;

    min-width: 0;

    font-size: 12px;
    line-height: 1.45;
    color: #646a73;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (width <= 700px) {
      white-space: normal;
    }

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  directoryRoleStack: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  `,
  directoryRoleTag: css`
    display: inline-flex;
    align-items: center;

    max-width: 100%;
    height: 22px;
    margin-inline-end: 0;
    padding-inline: 7px;
    border: 1px solid #e5e6eb;
    border-radius: 6px;

    font-size: 12px;
    font-weight: 500;
    line-height: 20px;
    color: #646a73;

    background: #f7f8fa;

    &[data-tone='admin'] {
      border-color: #d7c9ff;
      color: #6425d0;
      background: #f5f0ff;
    }

    &[data-tone='teacher'] {
      border-color: #c9ddff;
      color: #245bdb;
      background: #eef5ff;
    }

    &[data-tone='student'] {
      border-color: #b7ebc0;
      color: #1f7a3d;
      background: #effbf2;
    }

    &[data-tone='roster'] {
      border-color: #d8dadf;
      color: #4e5969;
      background: #f2f3f5;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillQuaternary};

      &[data-tone] {
        color: ${cssVar.colorText};
        background: ${cssVar.colorBgElevated};
      }
    }
  `,
  directoryFileInput: css`
    display: none;
  `,
  directoryInspectorHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-inline-end: 16px;
    border-block-end: 1px solid #e5e6eb;

    span {
      font-size: 12px;
      color: #86909c;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};

      span {
        color: ${cssVar.colorTextDescription};
      }
    }
  `,
  directoryDetail: css`
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0;

    min-height: 0;
    padding-inline: 16px;
  `,
  directoryDetailHero: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 16px;
    border-block-end: 1px solid #e5e6eb;

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
    }
  `,
  directoryPersonAvatar: css`
    display: grid;
    flex-shrink: 0;
    place-items: center;

    width: 38px;
    height: 38px;
    border-radius: 8px;

    font-size: 16px;
    font-weight: 700;
    color: #245bdb;

    background: #eef5ff;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorPrimaryText};
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  directoryDetailSection: css`
    padding-block: 14px;
    border-block-end: 1px solid #e5e6eb;

    &:last-child {
      border-block-end: 0;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
    }
  `,
  directoryPersonName: css`
    margin-block-end: 8px;

    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    color: #1f2329;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorText};
    }
  `,
  directoryDetailTitle: css`
    margin-block-end: 8px;
    font-size: 13px;
    font-weight: 650;
    color: #1f2329;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorText};
    }
  `,
  directoryMetaLine: css`
    margin-block-end: 8px;
    font-size: 13px;
    color: #646a73;
    overflow-wrap: anywhere;

    @media (prefers-color-scheme: dark) {
      color: ${cssVar.colorTextSecondary};
    }
  `,
  directoryInfoGrid: css`
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 6px 10px;

    font-size: 13px;
    line-height: 1.5;

    span {
      color: #86909c;
    }

    strong {
      min-width: 0;
      font-weight: 500;
      color: #1f2329;
      overflow-wrap: anywhere;
    }

    @media (prefers-color-scheme: dark) {
      span {
        color: ${cssVar.colorTextDescription};
      }

      strong {
        color: ${cssVar.colorText};
      }
    }
  `,
  directoryInspectorTags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  `,
  directoryStatusTag: css`
    height: 22px;
    margin-inline-end: 0;
    padding-inline: 7px;
    border: 1px solid #e5e6eb;
    border-radius: 6px;

    font-size: 12px;
    font-weight: 500;
    line-height: 20px;
    color: #4e5969;

    background: #f7f8fa;

    &[data-status='registered'] {
      border-color: #b7ebc0;
      color: #1f7a3d;
      background: #effbf2;
    }

    &[data-status='invited'] {
      border-color: #fed4a4;
      color: #9a5b00;
      background: #fff7e8;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  directoryIdentityList: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  directoryIdentityIntro: css`
    display: flex;
    flex-direction: column;
    gap: 4px;

    padding-block-end: 12px;
    border-block-end: 1px solid #e5e6eb;

    font-size: 14px;
    font-weight: 650;
    color: #1f2329;

    span {
      font-size: 13px;
      font-weight: 400;
      line-height: 1.5;
      color: #646a73;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorText};

      span {
        color: ${cssVar.colorTextSecondary};
      }
    }
  `,
  directoryIdentityItem: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    min-width: 0;
    padding-block: 10px;
    border-block-end: 1px solid #e5e6eb;

    &:last-child {
      border-block-end: 0;
    }

    @media (width <= 560px) {
      flex-direction: column;
      align-items: flex-start;
    }

    @media (prefers-color-scheme: dark) {
      border-color: ${cssVar.colorBorderSecondary};
    }
  `,
  directoryIdentityItemMain: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 3px;

    min-width: 0;

    strong,
    span,
    small {
      overflow: hidden;
      min-width: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 14px;
      font-weight: 650;
      color: #1f2329;
    }

    span {
      font-size: 13px;
      color: #646a73;
    }

    small {
      font-size: 12px;
      color: #86909c;
    }

    @media (width <= 560px) {
      strong,
      span,
      small {
        white-space: normal;
      }
    }

    @media (prefers-color-scheme: dark) {
      strong {
        color: ${cssVar.colorText};
      }

      span {
        color: ${cssVar.colorTextSecondary};
      }

      small {
        color: ${cssVar.colorTextDescription};
      }
    }
  `,
  centerPane: css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
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
      0%,
      100% {
        transform: translateX(0);
      }

      20% {
        transform: translateX(-4px);
      }

      40% {
        transform: translateX(4px);
      }

      60% {
        transform: translateX(-2px);
      }

      80% {
        transform: translateX(2px);
      }
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
