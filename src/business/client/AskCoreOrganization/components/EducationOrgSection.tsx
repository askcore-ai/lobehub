'use client';

import { Alert, Button, Empty, Form, Input, InputNumber, Select, Space } from 'antd';
import { cssVar } from 'antd-style';
import { Plus, RefreshCw, UserRoundPlus } from 'lucide-react';
import { memo, useMemo } from 'react';

import { styles } from '../styles';
import { type AskCoreEducationOrgUnitPayload } from '../types';
import { OrgTreeNode } from './OrgTreeNode';

const unitTypeOptions = [
  { label: '学校', value: 'school' },
  { label: '年级', value: 'grade' },
  { label: '班级', value: 'class' },
];

interface EducationOrgSectionProps {
  assigningRole: boolean;
  canManage: boolean;
  creatingUnit: boolean;
  error: string | undefined;
  loading: boolean;
  onAssignRole: () => Promise<void>;
  onCreateUnit: () => Promise<void>;
  onReload: () => void;
  orgRoleForm: ReturnType<typeof Form.useForm>[0];
  orgUnitForm: ReturnType<typeof Form.useForm>[0];
  payload: AskCoreEducationOrgUnitPayload | null;
}

export const EducationOrgSection = memo<EducationOrgSectionProps>(
  ({
    payload,
    loading,
    error,
    canManage,
    creatingUnit,
    assigningRole,
    orgUnitForm,
    orgRoleForm,
    onCreateUnit,
    onAssignRole,
    onReload,
  }) => {
    const units = useMemo(() => payload?.units ?? [], [payload?.units]);
    const roots = useMemo(() => units.filter((u) => !u.parent_id), [units]);

    return (
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.sectionTitle}>教育组织</span>
            <span className={styles.sectionSubtitle}>
              {roots.length} 学校 / {units.length} 单元
            </span>
          </div>
          <Button
            icon={<RefreshCw size={14} />}
            loading={loading}
            size="small"
            type="text"
            onClick={onReload}
          />
        </div>
        <div className={styles.sectionBody}>
          {error && (
            <Alert
              showIcon
              style={{ marginBottom: 14 }}
              title={error}
              type="error"
            />
          )}
          {units.length === 0 ? (
            <div className={styles.treeEmpty}>
              <Empty description="还没有学校" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                {canManage && (
                  <Button
                    className={styles.pillButton}
                    icon={<Plus size={14} />}
                    type="primary"
                  >
                    创建第一个学校
                  </Button>
                )}
              </Empty>
            </div>
          ) : (
            <div className={styles.treeRoot}>
              {roots.map((root) => (
                <OrgTreeNode
                  allNodes={units}
                  canManage={canManage}
                  key={root.id}
                  node={root}
                />
              ))}
            </div>
          )}

          {canManage && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${cssVar.colorBorderSecondary}` }}>
              <Form form={orgUnitForm} initialValues={{ sort_order: 0, unit_type: 'school' }} layout="vertical">
                <Space size={8} style={{ marginBottom: 12 }}>
                  <Plus size={14} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>创建层级</span>
                </Space>
                <Space wrap align="start">
                  <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input maxLength={80} placeholder="名称" />
                  </Form.Item>
                  <Form.Item label="类型" name="unit_type" rules={[{ required: true }]}>
                    <Select options={unitTypeOptions} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="上级 ID" name="parent_id">
                    <InputNumber min={1} placeholder="无" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="排序" name="sort_order">
                    <InputNumber style={{ width: 100 }} />
                  </Form.Item>
                </Space>
                <Form.Item label="备注" name="description">
                  <Input.TextArea autoSize={{ maxRows: 3, minRows: 2 }} maxLength={2000} />
                </Form.Item>
                <Button
                  className={styles.pillButton}
                  icon={<Plus size={14} />}
                  loading={creatingUnit}
                  type="primary"
                  onClick={onCreateUnit}
                >
                  创建层级
                </Button>
              </Form>

              <Form form={orgRoleForm} layout="vertical" style={{ marginTop: 20 }}>
                <Space size={8} style={{ marginBottom: 12 }}>
                  <UserRoundPlus size={14} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>分配身份</span>
                </Space>
                <Space wrap align="start">
                  <Form.Item label="组织层级" name="org_unit_id" rules={[{ required: true, message: '请选择层级' }]}>
                    <Select options={units.map((u) => ({ label: u.name, value: u.id }))} style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item label="身份" name="role" rules={[{ required: true, message: '请选择身份' }]}>
                    <Select
                      style={{ width: 140 }}
                      options={[
                        { label: '学校管理者', value: 'school_admin' },
                        { label: '年级管理者', value: 'grade_admin' },
                        { label: '班主任', value: 'homeroom_teacher' },
                        { label: '教师', value: 'teacher' },
                        { label: '学生', value: 'student' },
                      ]}
                    />
                  </Form.Item>
                </Space>
                <Space wrap align="start">
                  <Form.Item label="Better Auth 用户 ID" name="better_auth_user_id">
                    <Input maxLength={200} placeholder="可选" style={{ width: 220 }} />
                  </Form.Item>
                  <Form.Item label="教师 ID" name="teacher_id">
                    <InputNumber min={1} placeholder="可选" style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="学生 ID" name="student_id">
                    <InputNumber min={1} placeholder="可选" style={{ width: 120 }} />
                  </Form.Item>
                </Space>
                <Button
                  className={styles.pillButton}
                  icon={<UserRoundPlus size={14} />}
                  loading={assigningRole}
                  type="primary"
                  onClick={onAssignRole}
                >
                  分配身份
                </Button>
              </Form>
            </div>
          )}
        </div>
      </div>
    );
  },
);

EducationOrgSection.displayName = 'EducationOrgSection';
