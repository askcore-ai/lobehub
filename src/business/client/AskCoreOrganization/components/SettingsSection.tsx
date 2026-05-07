'use client';

import { Button, Tooltip } from 'antd';
import { cssVar } from 'antd-style';
import { ChevronDown, ChevronRight, Copy, LogOut, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import { styles } from '../styles';
import { type AskCoreOrganizationPayload } from '../types';

interface SettingsSectionProps {
  onDelete?: () => void;
  onLeave?: () => void;
  payload: AskCoreOrganizationPayload | null;
}

export const SettingsSection = memo<SettingsSectionProps>(
  ({ payload, onLeave, onDelete }) => {
    const [expanded, setExpanded] = useState(false);
    const current = payload?.current;

    const handleCopy = (text: string) => {
      navigator.clipboard.writeText(text).then(() => message.success('已复制'));
    };

    return (
      <div className={styles.sectionCard}>
        <div className={styles.settingsHeader} onClick={() => setExpanded((v) => !v)}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.sectionTitle}>组织设置</span>
          </div>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        {expanded && (
          <div className={styles.settingsBody}>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>组织 ID</span>
              <span className={styles.settingsValue}>
                {current?.id || '--'}
                {current?.id && (
                  <Tooltip title="复制">
                    <Button
                      className={styles.copyBtn}
                      icon={<Copy size={13} />}
                      size="small"
                      style={{ marginLeft: 8 }}
                      type="text"
                      onClick={() => handleCopy(current.id)}
                    />
                  </Tooltip>
                )}
              </span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>创建时间</span>
              <span style={{ fontSize: 13, color: cssVar.colorText }}>
                {current?.createdAt?.slice(0, 10) || '--'}
              </span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>联系人</span>
              <span style={{ fontSize: 13, color: cssVar.colorText }}>
                {current?.contact || '--'}
              </span>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              {onLeave && (
                <Button icon={<LogOut size={14} />} onClick={onLeave}>
                  离开组织
                </Button>
              )}
              {onDelete && (
                <Button danger icon={<Trash2 size={14} />} onClick={onDelete}>
                  删除组织
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);

SettingsSection.displayName = 'SettingsSection';
