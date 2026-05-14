'use client';

import { Button, Input, Tooltip } from 'antd';
import { cssVar } from 'antd-style';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Plus,
  UsersRound,
  X,
} from 'lucide-react';
import { memo, useState } from 'react';

import { styles } from '../styles';
import { type AskCoreEducationOrgUnit, type AskCoreEducationOrgUnitType } from '../types';

const unitTypeIcons: Record<AskCoreEducationOrgUnitType, React.ReactNode> = {
  class: <UsersRound size={14} />,
  cohort: <GitBranch size={14} />,
  school: <Building2 size={14} />,
};

const unitTypeLabels: Record<AskCoreEducationOrgUnitType, string> = {
  class: '班级',
  cohort: '届别',
  school: '学校',
};

interface OrgTreeNodeProps {
  allNodes: AskCoreEducationOrgUnit[];
  canManage?: boolean;
  depth?: number;
  node: AskCoreEducationOrgUnit;
  onAddChild?: (parent: AskCoreEducationOrgUnit, name: string) => Promise<void>;
  onSelect?: (node: AskCoreEducationOrgUnit) => void;
  selectedId?: number;
}

export const OrgTreeNode = memo<OrgTreeNodeProps>(
  ({ node, allNodes, depth = 0, canManage, onAddChild, onSelect, selectedId }) => {
    const [expanded, setExpanded] = useState(true);
    const [adding, setAdding] = useState(false);
    const [addName, setAddName] = useState('');

    const children = allNodes.filter((n) => n.parent_id === node.id);
    const hasChildren = children.length > 0;
    const childActionLabel = `添加${node.unit_type === 'school' ? '届别' : '班级'}`;

    const handleConfirmAdd = () => {
      const trimmed = addName.trim();
      if (!trimmed || !onAddChild) return;
      void onAddChild(node, trimmed).then(() => {
        setAdding(false);
        setAddName('');
      });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirmAdd();
      if (e.key === 'Escape') {
        setAdding(false);
        setAddName('');
      }
    };

    return (
      <div className={styles.treeNode}>
        <div
          className={`${styles.treeNodeRow} ${selectedId === node.id ? styles.treeNodeRowSelected : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(node)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect?.(node);
          }}
        >
          {hasChildren ? (
            <span
              style={{ cursor: 'pointer', display: 'inline-flex' }}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span style={{ width: 14 }} />
          )}
          <span style={{ color: cssVar.colorTextSecondary, display: 'inline-flex' }}>
            {unitTypeIcons[node.unit_type]}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: cssVar.colorText }}>
            {node.name}
          </span>
          <span className={styles.treeBadge}>{unitTypeLabels[node.unit_type]}</span>
          {canManage && (
            <div className={`tree-node-actions ${styles.treeNodeActions}`}>
              {node.unit_type !== 'class' && (
                <Tooltip title={childActionLabel}>
                  <Button
                    aria-label={childActionLabel}
                    className={styles.treeAddButton}
                    icon={<Plus size={13} />}
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      setAdding(true);
                    }}
                  />
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {adding && (
          <div className={styles.treeInlineForm}>
            <Input
              autoFocus
              placeholder={`输入${node.unit_type === 'school' ? '届别，如 2025级' : '班级名称'}`}
              size="small"
              style={{ width: 200 }}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              icon={<Check size={13} />}
              size="small"
              type="text"
              onClick={handleConfirmAdd}
            />
            <Button
              icon={<X size={13} />}
              size="small"
              type="text"
              onClick={() => {
                setAdding(false);
                setAddName('');
              }}
            />
          </div>
        )}

        {hasChildren && expanded && (
          <div className={styles.treeNodeChildren}>
            {children.map((child) => (
              <OrgTreeNode
                allNodes={allNodes}
                canManage={canManage}
                depth={depth + 1}
                key={child.id}
                node={child}
                selectedId={selectedId}
                onAddChild={onAddChild}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);

OrgTreeNode.displayName = 'OrgTreeNode';
