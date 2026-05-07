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
    width: min(960px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  `,

  // Hero Card
  heroCard: css`
    position: relative;
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 20px;
    padding: 32px;
    background: ${cssVar.colorBgContainer};
    text-align: center;
    transition: box-shadow 0.25s ease, transform 0.25s ease;

    &:hover {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    }
  `,
  heroAvatarWrap: css`
    position: relative;
    display: inline-flex;
    margin-bottom: 16px;
  `,
  heroAvatar: css`
    border: 3px solid ${cssVar.colorBgContainer};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  `,
  heroName: css`
    font-size: 24px;
    font-weight: 700;
    line-height: 1.3;
    color: ${cssVar.colorText};
    margin-bottom: 6px;
  `,
  heroDesc: css`
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
    max-width: 480px;
    margin: 0 auto 16px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
  heroStats: css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
  `,
  heroEditForm: css`
    max-width: 480px;
    margin: 20px auto 0;
    text-align: left;
    transition: all 0.3s ease;
  `,
  heroEditActions: css`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
  `,

  // Quick Actions
  quickActionsGrid: css`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;

    @media (width <= 900px) {
      grid-template-columns: repeat(2, 1fr);
    }
  `,
  quickActionCard: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;
    background: ${cssVar.colorBgContainer};
    cursor: pointer;
    transition: transform 0.25s ease, box-shadow 0.25s ease;

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
    }
  `,
  quickActionIcon: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: ${cssVar.colorFillQuaternary};
    color: ${cssVar.colorText};
  `,
  quickActionTitle: css`
    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  quickActionDesc: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,

  // Section Cards
  sectionCard: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
    transition: box-shadow 0.25s ease, transform 0.25s ease;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
    }
  `,
  sectionHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 52px;
    padding: 14px 20px;
    border-bottom: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionHeaderLeft: css`
    display: flex;
    align-items: center;
    gap: 10px;
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
    padding: 16px 20px;
  `,

  // Member Card
  memberCard: css`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid ${cssVar.colorFillQuaternary};
    transition: background 0.15s ease;

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: ${cssVar.colorFillQuaternary};
      margin: 0 -20px;
      padding-left: 20px;
      padding-right: 20px;
    }
  `,
  memberAvatar: css`
    flex-shrink: 0;
  `,
  memberInfo: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  memberName: css`
    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
    line-height: 1.4;
  `,
  memberEmail: css`
    font-size: 13px;
    font-weight: 400;
    color: ${cssVar.colorTextDescription};
    line-height: 1.4;
  `,
  memberMeta: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  memberActions: css`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  `,

  // Role Tags
  roleTag: css`
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: default;
    user-select: none;
    transition: opacity 0.15s ease;
  `,
  roleTagOwner: css`
    background: #fef3c7;
    color: #92400e;
  `,
  roleTagAdmin: css`
    background: #dbeafe;
    color: #1e40af;
  `,
  roleTagMember: css`
    background: ${cssVar.colorFillQuaternary};
    color: ${cssVar.colorTextSecondary};
  `,
  roleTagEditable: css`
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  `,

  // Invite
  inviteChannels: css`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  `,
  inviteChannelCard: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    cursor: pointer;
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
    margin-top: 16px;
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,

  // Tree
  treeRoot: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,
  treeNode: css`
    position: relative;
  `,
  treeNodeRow: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};

      .tree-node-actions {
        opacity: 1;
      }
    }
  `,
  treeNodeActions: css`
    opacity: 0;
    transition: opacity 0.15s ease;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  `,
  treeNodeChildren: css`
    position: relative;
    margin-left: 18px;
    padding-left: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background: ${cssVar.colorBorderSecondary};
    }
  `,
  treeInlineForm: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0 6px 32px;
  `,
  treeBadge: css`
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    background: ${cssVar.colorPrimaryBg};
    color: ${cssVar.colorPrimary};
  `,
  treeEmpty: css`
    padding: 32px 0;
    text-align: center;
  `,

  // Settings
  settingsPanel: css`
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.3s ease;
  `,
  settingsHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    cursor: pointer;
    user-select: none;
    border-radius: 16px;
    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  settingsBody: css`
    padding: 0 20px 20px;
  `,
  settingsRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid ${cssVar.colorFillQuaternary};

    &:last-child {
      border-bottom: 0;
    }
  `,
  settingsLabel: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  settingsValue: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
    font-family: monospace;
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

  // Animations
  staggerItem: css`
    opacity: 0;
    transform: translateY(20px);
    animation: orgFadeUp 0.5s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;

    @keyframes orgFadeUp {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
  shake: css`
    animation: orgShake 0.3s ease;

    @keyframes orgShake {
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
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  `,
  emptyState: css`
    padding: 48px 0;
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
