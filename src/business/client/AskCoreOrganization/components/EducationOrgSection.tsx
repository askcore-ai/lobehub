'use client';

import { Alert, Button, Empty, Form, Input, Select, Space } from 'antd';
import { cssVar } from 'antd-style';
import { Plus, RefreshCw, UserRoundPlus } from 'lucide-react';
import { memo, useMemo } from 'react';

import { styles } from '../styles';
import {
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitPayload,
  type AskCoreOrganizationMember,
} from '../types';
import { OrgTreeNode } from './OrgTreeNode';

const unitTypeLabels = {
  class: '班级',
  cohort: '届别',
  school: '学校',
};

interface EducationOrgSectionProps {
  assigningRole: boolean;
  canManage: boolean;
  creatingUnit: boolean;
  error: string | undefined;
  loading: boolean;
  members: AskCoreOrganizationMember[];
  onAddChild: (parent: AskCoreEducationOrgUnit, name: string) => Promise<void>;
  onAssignRole: () => Promise<void>;
  onCreateSchool: () => Promise<void>;
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
    members,
    orgUnitForm,
    orgRoleForm,
    onCreateSchool,
    onAddChild,
    onAssignRole,
    onReload,
  }) => {
    const units = useMemo(() => payload?.units ?? [], [payload?.units]);
    const roots = useMemo(() => units.filter((u) => !u.parent_id), [units]);
    const unitOptions = useMemo(
      () =>
        units.map((u) => ({
          label: `${unitTypeLabels[u.unit_type]} · ${u.name}`,
          value: u.id,
        })),
      [units],
    );

    return (
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.sectionTitle}>教育组织</span>
            <span className={styles.sectionSubtitle}>
              {units.filter((u) => u.unit_type === 'school').length} 学校 /{' '}
              {units.filter((u) => u.unit_type === 'cohort').length} 届别 /{' '}
              {units.filter((u) => u.unit_type === 'class').length} 班级
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
              <Empty description="还没有组织层级" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                {canManage && (
                  <Button
                    className={styles.pillButton}
                    icon={<Plus size={14} />}
                    type="primary"
                    onClick={() => {
                      document
                        .getElementById('askcore-create-school-unit')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    添加学校
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
                  onAddChild={onAddChild}
                />
              ))}
            </div>
          )}

          {canManage && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${cssVar.colorBorderSecondary}` }}>
              <Form
                form={orgUnitForm}
                id="askcore-create-school-unit"
                layout="vertical"
              >
                <Space size={8} style={{ marginBottom: 12 }}>
                  <Plus size={14} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>学校</span>
                </Space>
                <Space wrap align="start">
                  <Form.Item label="学校名称" name="name" rules={[{ required: true, message: '请输入学校名称' }]}>
                    <Input maxLength={80} placeholder="例如：Seed School" style={{ width: 240 }} />
                  </Form.Item>
                  <Form.Item label="备注" name="description">
                    <Input maxLength={200} placeholder="可选" style={{ width: 320 }} />
                  </Form.Item>
                </Space>
                <Button
                  className={styles.pillButton}
                  icon={<Plus size={14} />}
                  loading={creatingUnit}
                  type="primary"
                  onClick={onCreateSchool}
                >
                  添加学校
                </Button>
              </Form>

              <Form form={orgRoleForm} layout="vertical" style={{ marginTop: 20 }}>
                <Space size={8} style={{ marginBottom: 12 }}>
                  <UserRoundPlus size={14} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>身份分配</span>
                </Space>
                <Space wrap align="start">
                  <Form.Item label="组织层级" name="org_unit_id" rules={[{ required: true, message: '请选择层级' }]}>
                    <Select options={unitOptions} style={{ width: 220 }} />
                  </Form.Item>
                  <Form.Item label="身份" name="role" rules={[{ required: true, message: '请选择身份' }]}>
                    <Select
                      style={{ width: 140 }}
                      options={[
                        { label: '学校管理者', value: 'school_admin' },
                        { label: '届别管理者', value: 'grade_admin' },
                        { label: '班主任', value: 'homeroom_teacher' },
                        { label: '教师', value: 'teacher' },
                        { label: '学生', value: 'student' },
                      ]}
                    />
                  </Form.Item>
                </Space>
                <Space wrap align="start">
                  <Form.Item
                    label="成员"
                    name="subject_user_id"
                    rules={[{ required: true, message: '请选择成员' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={members.map((member) => ({
                        label: member.email ? `${member.name} · ${member.email}` : member.name,
                        value: member.userId,
                      }))}
                      placeholder="搜索成员"
                      style={{ width: 260 }}
                    />
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
