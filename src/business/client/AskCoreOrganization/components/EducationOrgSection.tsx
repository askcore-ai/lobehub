'use client';

import { Alert, Button, Empty, Form, Input, Popconfirm, Select, Spin, Tag, Tooltip } from 'antd';
import { Check, Plus, RefreshCw, UserRoundPlus, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { type JsonRecord } from '../../AskCoreWorkbench/types';
import { styles } from '../styles';
import {
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitPayload,
  type AskCoreEducationOrgUnitType,
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

type RoleSubjectKind = 'member' | 'student' | 'teacher';

const roleOptionsByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole[]> = {
  class: ['homeroom_teacher', 'teacher', 'student'],
  cohort: ['grade_admin', 'teacher'],
  school: ['school_admin', 'teacher'],
};

const subjectKindByRole: Record<AskCoreEducationRole, RoleSubjectKind> = {
  grade_admin: 'member',
  homeroom_teacher: 'teacher',
  school_admin: 'member',
  student: 'student',
  teacher: 'teacher',
};

const getRoleOptions = (unit: AskCoreEducationOrgUnit | null) =>
  unit
    ? roleOptionsByUnitType[unit.unit_type].map((role) => ({
        label: roleLabels[role],
        value: role,
      }))
    : [];

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
    const availableRoleOptions = useMemo(() => getRoleOptions(selectedUnit), [selectedUnit]);
    const selectedAssignments = selectedUnit
      ? roleAssignments.filter((assignment) => assignment.org_unit_id === selectedUnit.id)
      : [];

    const subjectOptions = useMemo(() => {
      if (subjectKind === 'teacher') {
        return teachers
          .map((teacher) => {
            const id = numericId(teacher, ['teacher_id', 'id']);
            return {
              label: String(
                teacher.real_name || teacher.username || teacher.name || '未命名教师',
              ).trim(),
              value: String(id),
            };
          })
          .filter((item) => item.value !== '0');
      }
      if (subjectKind === 'student') {
        return students
          .map((student) => {
            const id = numericId(student, ['student_id', 'id']);
            return {
              label: String(student.name || student.real_name || '未命名学生').trim(),
              value: String(id),
            };
          })
          .filter((item) => item.value !== '0');
      }
      return members.map((member) => ({
        label: member.email
          ? `${member.name || '未命名成员'} · ${member.email}`
          : member.name || '未命名成员',
        value: member.userId,
      }));
    }, [members, students, subjectKind, teachers]);

    const subjectLabel = (assignment: AskCoreEducationRoleAssignment) => {
      if (assignment.teacher_id) {
        const teacher = teachers.find(
          (item) => numericId(item, ['teacher_id', 'id']) === assignment.teacher_id,
        );
        return String(teacher?.real_name || teacher?.username || teacher?.name || '未命名教师');
      }
      if (assignment.student_id) {
        const student = students.find(
          (item) => numericId(item, ['student_id', 'id']) === assignment.student_id,
        );
        return String(student?.name || student?.real_name || '未命名学生');
      }
      const member = members.find((item) => item.userId === assignment.better_auth_user_id);
      return member?.email
        ? `${member.name || '未命名成员'} · ${member.email}`
        : member?.name || '未知成员';
    };

    const selectUnit = (unit: AskCoreEducationOrgUnit) => {
      const defaultRole = roleOptionsByUnitType[unit.unit_type][0];
      const defaultSubjectKind = subjectKindByRole[defaultRole];
      setSelectedUnitId(unit.id);
      setSubjectKind(defaultSubjectKind);
      orgRoleForm.setFieldsValue({
        org_unit_id: unit.id,
        role: defaultRole,
        subject_kind: defaultSubjectKind,
        subject_value: undefined,
      });
    };

    const handleRoleChange = (role: AskCoreEducationRole) => {
      const nextSubjectKind = subjectKindByRole[role];
      setSubjectKind(nextSubjectKind);
      orgRoleForm.setFieldsValue({
        subject_kind: nextSubjectKind,
        subject_value: undefined,
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

    const subjectFieldLabel =
      subjectKind === 'teacher' ? '教师' : subjectKind === 'student' ? '学生' : '成员';
    const subjectPlaceholder =
      subjectKind === 'teacher' ? '搜索教师' : subjectKind === 'student' ? '搜索学生' : '搜索成员';

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
          {error && <Alert showIcon style={{ marginBottom: 14 }} title={error} type="error" />}
          <div className={styles.orgTreeLayout}>
            <div className={styles.orgTreePane}>
              {canManage && (
                <div className={styles.treeRootActionRow}>
                  <div className={styles.treeRootActionText}>
                    <span className={styles.treeRootActionTitle}>组织根层级</span>
                    <span className={styles.treeRootActionHint}>学校从这里创建</span>
                  </div>
                  <Tooltip title="新建学校">
                    <Button
                      aria-label="新建学校"
                      className={styles.treeRootAddButton}
                      icon={<Plus size={16} />}
                      size="small"
                      type="text"
                      onClick={() => setAddingSchool(true)}
                    />
                  </Tooltip>
                </div>
              )}

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
                  <Button
                    icon={<Check size={14} />}
                    loading={creatingUnit}
                    type="text"
                    onClick={confirmAddSchool}
                  />
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
                  <Empty description="还没有学校" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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

            <aside aria-label="身份分配" className={styles.orgRolePanel}>
              {selectedUnit ? (
                <>
                  <div className={styles.rolePanelHeader}>
                    <div>
                      <div className={styles.rolePanelTitle}>{selectedUnit.name} 的身份</div>
                      <div className={styles.rolePanelMeta}>
                        {unitTypeLabels[selectedUnit.unit_type]}
                      </div>
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
                            <Popconfirm
                              title="移除该身份？"
                              onConfirm={() => onDeleteRole(assignment.id)}
                            >
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
                    <Form className={styles.roleAssignForm} form={orgRoleForm} layout="vertical">
                      <Form.Item hidden name="org_unit_id">
                        <Input />
                      </Form.Item>
                      <Form.Item hidden initialValue="member" name="subject_kind">
                        <Input />
                      </Form.Item>
                      <Form.Item
                        label="身份"
                        name="role"
                        rules={[{ required: true, message: '请选择身份' }]}
                      >
                        <Select options={availableRoleOptions} onChange={handleRoleChange} />
                      </Form.Item>
                      <Form.Item
                        label={subjectFieldLabel}
                        name="subject_value"
                        rules={[{ required: true, message: '请选择对象' }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={subjectOptions}
                          placeholder={subjectPlaceholder}
                        />
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
