'use client';

import { Popover, Tag } from 'antd';
import { cssVar } from 'antd-style';
import { memo, useState } from 'react';

import { styles } from '../styles';
import { type AskCoreOrganizationRole } from '../types';

const roleLabels: Record<AskCoreOrganizationRole, string> = {
  admin: '管理员',
  member: '成员',
  owner: '所有者',
};

const roleAntdColors: Record<AskCoreOrganizationRole, string> = {
  admin: 'blue',
  member: 'default',
  owner: 'gold',
};

interface RoleTagProps {
  editable?: boolean;
  onChange?: (role: AskCoreOrganizationRole) => void;
  role: AskCoreOrganizationRole;
}

export const RoleTag = memo<RoleTagProps>(({ role, editable, onChange }) => {
  const [open, setOpen] = useState(false);
  const [shaking, setShaking] = useState(false);

  if (!editable || role === 'owner') {
    return (
      <Tag color={roleAntdColors[role]} style={{ borderRadius: 6, fontWeight: 500 }}>
        {roleLabels[role]}
      </Tag>
    );
  }

  const options: AskCoreOrganizationRole[] = ['owner', 'admin', 'member'];

  const handleSelect = async (value: AskCoreOrganizationRole) => {
    setOpen(false);
    if (value === role || !onChange) return;
    try {
      await onChange(value);
    } catch {
      setShaking(true);
      setTimeout(() => setShaking(false), 350);
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
      {options.map((r) => (
        <button
          key={r}
          type="button"
          style={{
            background: r === role ? cssVar.colorPrimaryBg : 'transparent',
            border: 'none',
            borderRadius: 6,
            color: cssVar.colorText,
            cursor: 'pointer',
            fontSize: 13,
            padding: '6px 10px',
            textAlign: 'left',
          }}
          onClick={() => handleSelect(r)}
        >
          {roleLabels[r]}
        </button>
      ))}
    </div>
  );

  return (
    <Popover
      content={content}
      open={open}
      placement="bottomLeft"
      trigger="click"
      onOpenChange={setOpen}
    >
      <Tag
        className={`${styles.roleTag} ${styles.roleTagEditable} ${shaking ? styles.shake : ''}`}
        color={roleAntdColors[role]}
        style={{ borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
      >
        {roleLabels[role]}
      </Tag>
    </Popover>
  );
});

RoleTag.displayName = 'RoleTag';
