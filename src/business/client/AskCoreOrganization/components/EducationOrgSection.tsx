'use client';

import { Alert, Button, Empty, Form, Input, Popconfirm, Select, Space, Spin, Tag } from 'antd';
import { Check, Plus, RefreshCw, UserRoundPlus, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { type JsonRecord } from '../../AskCoreWorkbench/types';
import { styles } from '../styles';
import {
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitPayload,
  type AskCoreEducationRole,
  type AskCoreEducationRoleAssignment,
  type AskCoreOrganizationMember,
} from '../types';
import { OrgTreeNode } from './OrgTreeNode';

const unitTypeLabels = {
  class: '班级',
  cohort: '届别',
  school: '学校',
};

const roleLabels: Record<AskCoreEducationRole, string> = {
  grade_admin: '届别管理者',
  homeroom_teacher: '班主任',
  school_admin: '学校管理者',
  student: '学生',
  teacher: '教师',
};

const subjectKindOptions = [
  { label: '成员', value: 'member' },
  { label: '教师', value: 'teacher' },
  { label: '学生', value: 'student' },
];

const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ label, value }));

const numericId = (record: JsonRecord, keys: string[]) => {
  for (const key of keys) {
    const value = Number(record[key] || 0);
    if (value > 0) return value;
  }
  return 0;
};

interface EducationOrgSectionProps {
  assigningRole: boolean;
  canManage: boolean;
  creatingUnit: boolean;
  error: string | undefined;
  loading: boolean;
  members: AskCoreOrganizationMember[];
  onAddChild: (parent: AskCoreEducationOrgUnit, name: string) => Promise<void>;
  onAddSchool: (name: string, description?: string) => Promise<void>;
  onAssignRole: () => Promise<void>;
  onDeleteRole: (assignmentId: number) => Promise<void>;
  onReload: () => void;
  orgRoleForm: ReturnType<typeof Form.useForm>[0];
  payload: AskCoreEducationOrgUnitPayload | null;
  roleAssignments: AskCoreEducationRoleAssignment[];
  roleLoading: boolean;
  students: JsonRecord[];
  teachers: JsonRecord[];
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
    teachers,
    students,
    roleAssignments,
    roleLoading,
    orgRoleForm,
    onAddSchool,
    onAddChild,
    onAssignRole,
    onDeleteRole,
    onReload,
  }) => {
    const [addingSchool, setAddingSchool] = useState(false);
    const [schoolName, setSchoolName] = useState('');
    const [schoolDescription, setSchoolDescription] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
    const [subjectKind, setSubjectKind] = useState<'member' | 'student' | 'teacher'>('member');

    const units = useMemo(() => payload?.units ?? [], [payload?.units]);
    const roots = useMemo(() => units.filter((u) => !u.parent_id), [units]);
    const selectedUnit = units.find((u) => u.id === selectedUnitId) || null;
    const selectedAssignments = roleAssignments.filter(
      (assignment) => selectedUnit && assignment.org_unit_id === selectedUnit.id,
    );

    const subjectOptions = useMemo(() => {
      if (subjectKind === 'teacher') {
        return teachers
          .map((teacher) => {
            const id = numericId(teacher, ['teacher_id', 'id']);
            return {
              label: String(teacher.real_name || teacher.username || id || '').trim(),
              value: String(id),
            };
          })
          .filter((item) => item.value !== '0');
      }
      if (subjectKind === 'student') {
        return students
          .map((student) => {
            const id = numericId(student, ['student_id', 'id']);
            const number = String(student.student_number || '').trim();
            return {
              label: number ? `${student.name || id} · ${number}` : String(student.name || id),
              value: String(id),
            };
          })
          .filter((item) => item.value !== '0');
      }
      return members.map((member) => ({
        label: member.email ? `${member.name} · ${member.email}` : member.name,
        value: member.userId,
      }));
    }, [members, students, subjectKind, teachers]);

    const subjectLabel = (assignment: AskCoreEducationRoleAssignment) => {
      if (assignment.teacher_id) {
        const teacher = teachers.find((item) => numericId(item, ['teacher_id', 'id']) === assignment.teacher_id);
        return String(teacher?.real_name || teacher?.username || `教师 #${assignment.teacher_id}`);
      }
      if (assignment.student_id) {
        const student = students.find((item) => numericId(item, ['student_id', 'id']) === assignment.student_id);
        return String(student?.name || student?.student_number || `学生 #${assignment.student_id}`);
      }
      const member = members.find((item) => item.userId === assignment.better_auth_user_id);
      return member?.email ? `${member.name} · ${member.email}` : member?.name || assignment.subject_user_id;
    };

    const selectUnit = (unit: AskCoreEducationOrgUnit) => {
      setSelectedUnitId(unit.id);
      orgRoleForm.setFieldsValue({
        org_unit_id: unit.id,
        role: unit.unit_type === 'class' ? 'teacher' : unit.unit_type === 'cohort' ? 'grade_admin' : 'school_admin',
      });
    };

    const confirmAddSchool = async () => {
      const trimmed = schoolName.trim();
      if (!trimmed) return;
      await onAddSchool(trimmed, schoolDescription);
      setAddingSchool(false);
      setSchoolName('');
      setSchoolDescription('');
    };

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
          <Space>
            {canManage && (
              <Button
                className={styles.treeRootAddButton}
                icon={<Plus size={15} />}
                size="small"
                onClick={() => setAddingSchool(true)}
              >
                添加学校
              </Button>
            )}
            <Button icon={<RefreshCw size={14} />} loading={loading} size="small" type="text" onClick={onReload} />
          </Space>
        </div>
        <div className={styles.sectionBody}>
          {error && <Alert showIcon style={{ marginBottom: 14 }} title={error} type="error" />}
          <div className={styles.orgTreeLayout}>
            <div className={styles.orgTreePane}>
              {addingSchool && (
                <div className={styles.treeRootInlineForm}>
                  <Input
                    autoFocus
                    maxLength={80}
                    placeholder="学校名称"
                    value={schoolName}
                    onChange={(event) => setSchoolName(event.target.value)}
                    onPressEnter={confirmAddSchool}
                  />
                  <Input
                    maxLength={200}
                    placeholder="备注"
                    value={schoolDescription}
                    onChange={(event) => setSchoolDescription(event.target.value)}
                    onPressEnter={confirmAddSchool}
                  />
                  <Button icon={<Check size={14} />} loading={creatingUnit} type="text" onClick={confirmAddSchool} />
                  <Button
                    icon={<X size={14} />}
                    type="text"
                    onClick={() => {
                      setAddingSchool(false);
                      setSchoolName('');
                      setSchoolDescription('');
                    }}
                  />
                </div>
              )}

              {units.length === 0 ? (
                <div className={styles.treeEmpty}>
                  <Empty description="还没有组织层级" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                    {canManage && (
                      <Button
                        className={styles.pillButton}
                        icon={<Plus size={14} />}
                        type="primary"
                        onClick={() => setAddingSchool(true)}
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
                      selectedId={selectedUnit?.id}
                      onAddChild={onAddChild}
                      onSelect={selectUnit}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.orgRolePanel}>
              {selectedUnit ? (
                <>
                  <div className={styles.rolePanelHeader}>
                    <div>
                      <div className={styles.rolePanelTitle}>{selectedUnit.name} 的身份</div>
                      <div className={styles.rolePanelMeta}>{unitTypeLabels[selectedUnit.unit_type]}</div>
                    </div>
                    {roleLoading && <Spin size="small" />}
                  </div>
                  <div className={styles.roleAssignmentList}>
                    {selectedAssignments.length ? (
                      selectedAssignments.map((assignment) => (
                        <div className={styles.roleAssignmentItem} key={assignment.id}>
                          <div>
                            <Tag>{roleLabels[assignment.role] || assignment.role}</Tag>
                            <span>{subjectLabel(assignment)}</span>
                          </div>
                          {canManage && (
                            <Popconfirm title="移除该身份？" onConfirm={() => onDeleteRole(assignment.id)}>
                              <Button danger size="small" type="link">
                                移除
                              </Button>
                            </Popconfirm>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className={styles.rolePanelEmpty}>暂无身份</div>
                    )}
                  </div>
                  {canManage && (
                    <Form form={orgRoleForm} layout="vertical" className={styles.roleAssignForm}>
                      <Form.Item hidden name="org_unit_id">
                        <Input />
                      </Form.Item>
                      <Form.Item label="身份" name="role" rules={[{ required: true, message: '请选择身份' }]}>
                        <Select options={roleOptions} />
                      </Form.Item>
                      <Form.Item label="对象类型" name="subject_kind" initialValue="member">
                        <Select
                          options={subjectKindOptions}
                          onChange={(value) => {
                            setSubjectKind(value);
                            orgRoleForm.resetFields(['subject_value']);
                          }}
                        />
                      </Form.Item>
                      <Form.Item label="对象" name="subject_value" rules={[{ required: true, message: '请选择对象' }]}>
                        <Select showSearch optionFilterProp="label" options={subjectOptions} placeholder="搜索成员/教师/学生" />
                      </Form.Item>
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
                  )}
                </>
              ) : (
                <div className={styles.rolePanelEmptyState}>
                  <UserRoundPlus size={18} />
                  <span>选择树上的节点分配身份</span>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    );
  },
);

EducationOrgSection.displayName = 'EducationOrgSection';
