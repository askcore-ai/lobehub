'use client';

import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import { Check, Plus, RefreshCw, UserRoundPlus, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { type JsonRecord } from '../../AskCoreWorkbench/types';
import { styles } from '../styles';
import {
  type AskCoreEducationIdentityClaim,
  type AskCoreEducationIdentityRosterKind,
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
  department: '部门',
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
type IdentityRosterOption = {
  boundUserId: string;
  label: string;
  value: string;
};

const roleOptionsByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole[]> = {
  class: ['homeroom_teacher', 'teacher', 'student'],
  cohort: ['grade_admin', 'teacher'],
  department: ['teacher'],
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

const identityStatusLabels: Record<AskCoreEducationIdentityClaim['status'], string> = {
  approved: '已通过',
  pending: '待审批',
  rejected: '已拒绝',
};

const identityStatusColors: Record<AskCoreEducationIdentityClaim['status'], string> = {
  approved: 'green',
  pending: 'gold',
  rejected: 'red',
};

const rosterKindLabels: Record<AskCoreEducationIdentityRosterKind, string> = {
  student: '学生',
  teacher: '教师',
};

const memberLabel = (members: AskCoreOrganizationMember[], userId: string) => {
  const member = members.find((item) => item.userId === userId);
  if (!member) return userId;
  return member.email ? `${member.name || '未命名成员'} · ${member.email}` : member.name || userId;
};

const rosterName = (
  rosterKind: AskCoreEducationIdentityRosterKind,
  rosterId: number,
  teachers: JsonRecord[],
  students: JsonRecord[],
) => {
  const rows = rosterKind === 'teacher' ? teachers : students;
  const row = rows.find(
    (item) =>
      numericId(item, [rosterKind === 'teacher' ? 'teacher_id' : 'student_id', 'id']) === rosterId,
  );
  if (!row) return `${rosterKindLabels[rosterKind]} #${rosterId}`;
  if (rosterKind === 'teacher') {
    return String(row.real_name || row.username || row.name || `教师 #${rosterId}`);
  }
  return String(row.name || row.real_name || row.student_number || `学生 #${rosterId}`);
};

const buildIdentityRosterOptions = (
  rosterKind: AskCoreEducationIdentityRosterKind,
  rows: JsonRecord[],
  members: AskCoreOrganizationMember[],
): IdentityRosterOption[] =>
  rows
    .map((row) => {
      const id = numericId(row, [rosterKind === 'teacher' ? 'teacher_id' : 'student_id', 'id']);
      if (!id) return null;
      const boundUserId = String(row.better_auth_user_id || '').trim();
      const name =
        rosterKind === 'teacher'
          ? String(row.real_name || row.username || row.name || '未命名教师')
          : String(row.name || row.real_name || row.student_number || '未命名学生');
      const number =
        rosterKind === 'teacher'
          ? String(row.teacher_number || row.username || '').trim()
          : String(row.student_number || '').trim();
      const boundLabel = boundUserId ? `已绑定 ${memberLabel(members, boundUserId)}` : '未绑定账号';
      return {
        boundUserId,
        label: [name.trim(), number, boundLabel].filter(Boolean).join(' · '),
        value: String(id),
      };
    })
    .filter((item): item is IdentityRosterOption => Boolean(item));

interface EducationOrgSectionProps {
  assigningRole: boolean;
  bindingIdentity: boolean;
  canManage: boolean;
  creatingUnit: boolean;
  error: string | undefined;
  identityForm: ReturnType<typeof Form.useForm>[0];
  loading: boolean;
  members: AskCoreOrganizationMember[];
  onAddChild: (parent: AskCoreEducationOrgUnit, name: string) => Promise<void>;
  onAddSchool: (name: string, description?: string) => Promise<void>;
  onAssignRole: () => Promise<void>;
  onBindIdentity: () => Promise<void>;
  onCreateIdentityClaim: () => Promise<void>;
  onDeleteRole: (assignmentId: number) => Promise<void>;
  onReload: () => void;
  onUnbindIdentity: (
    rosterKind: AskCoreEducationIdentityRosterKind,
    rosterId: number,
  ) => Promise<void>;
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
    bindingIdentity,
    members,
    teachers,
    students,
    roleAssignments,
    roleLoading,
    orgRoleForm,
    identityForm,
    onAddSchool,
    onAddChild,
    onAssignRole,
    onBindIdentity,
    onCreateIdentityClaim,
    onDeleteRole,
    onUnbindIdentity,
    onReload,
  }) => {
    const [addingSchool, setAddingSchool] = useState(false);
    const [schoolName, setSchoolName] = useState('');
    const [schoolDescription, setSchoolDescription] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
    const [subjectKind, setSubjectKind] = useState<'member' | 'student' | 'teacher'>('member');
    const [identityRosterKind, setIdentityRosterKind] =
      useState<AskCoreEducationIdentityRosterKind>('teacher');
    const [identityRosterId, setIdentityRosterId] = useState<number | null>(null);

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

    const memberOptions = useMemo(
      () =>
        members.map((member) => ({
          label: member.email
            ? `${member.name || '未命名成员'} · ${member.email}`
            : member.name || '未命名成员',
          value: member.userId,
        })),
      [members],
    );

    const identityRosterRows = identityRosterKind === 'teacher' ? teachers : students;
    const identityRosterOptions = useMemo(
      () => buildIdentityRosterOptions(identityRosterKind, identityRosterRows, members),
      [identityRosterKind, identityRosterRows, members],
    );

    const selectedIdentityRosterOption = identityRosterOptions.find(
      (option) => Number(option.value) === identityRosterId,
    );

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

    const handleIdentityRosterKindChange = (value: AskCoreEducationIdentityRosterKind) => {
      setIdentityRosterKind(value);
      setIdentityRosterId(null);
      identityForm.setFieldsValue({
        identity_roster_id: undefined,
        identity_roster_kind: value,
        identity_user_id: undefined,
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
                  <div
                    style={{
                      borderTop: '1px solid rgba(0,0,0,0.06)',
                      marginTop: 16,
                      paddingTop: 16,
                    }}
                  >
                    <div className={styles.rolePanelHeader}>
                      <div>
                        <div className={styles.rolePanelTitle}>账号身份绑定</div>
                        <div className={styles.rolePanelMeta}>
                          教师/学生可以绑定到 AskCore 注册账号，也可以保持未绑定。
                        </div>
                      </div>
                    </div>
                    <Form className={styles.roleAssignForm} form={identityForm} layout="vertical">
                      <Form.Item
                        initialValue="teacher"
                        label="名册类型"
                        name="identity_roster_kind"
                        rules={[{ required: true, message: '请选择名册类型' }]}
                      >
                        <Select
                          options={[
                            { label: '教师', value: 'teacher' },
                            { label: '学生', value: 'student' },
                          ]}
                          onChange={handleIdentityRosterKindChange}
                        />
                      </Form.Item>
                      <Form.Item
                        label={identityRosterKind === 'teacher' ? '教师名册' : '学生名册'}
                        name="identity_roster_id"
                        rules={[{ required: true, message: '请选择名册身份' }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={identityRosterOptions}
                          placeholder={
                            identityRosterKind === 'teacher' ? '搜索教师名册' : '搜索学生名册'
                          }
                          onChange={(value) => setIdentityRosterId(Number(value))}
                        />
                      </Form.Item>
                      {canManage ? (
                        <Form.Item
                          label="绑定账号"
                          name="identity_user_id"
                          rules={[{ required: true, message: '请选择组织成员账号' }]}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={memberOptions}
                            placeholder="搜索组织成员"
                          />
                        </Form.Item>
                      ) : null}
                      <Space wrap>
                        {canManage ? (
                          <Button
                            className={styles.pillButton}
                            loading={bindingIdentity}
                            type="primary"
                            onClick={onBindIdentity}
                          >
                            绑定账号
                          </Button>
                        ) : null}
                        <Button
                          className={styles.pillButton}
                          loading={bindingIdentity}
                          onClick={onCreateIdentityClaim}
                        >
                          申请绑定为我
                        </Button>
                        {canManage && selectedIdentityRosterOption?.boundUserId ? (
                          <Popconfirm
                            title="解除该名册身份与账号的绑定？"
                            onConfirm={() =>
                              onUnbindIdentity(identityRosterKind, Number(identityRosterId || 0))
                            }
                          >
                            <Button danger loading={bindingIdentity}>
                              解绑
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </Space>
                    </Form>
                  </div>
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

interface EducationIdentitySectionProps {
  bindingIdentity: boolean;
  canManage: boolean;
  claims: AskCoreEducationIdentityClaim[];
  claimsLoading: boolean;
  identityForm: ReturnType<typeof Form.useForm>[0];
  members: AskCoreOrganizationMember[];
  onApproveClaim: (claimId: number) => Promise<void>;
  onBindIdentity: () => Promise<void>;
  onCreateIdentityClaim: () => Promise<void>;
  onRejectClaim: (claimId: number) => Promise<void>;
  onReloadClaims: () => void;
  onUnbindIdentity: (
    rosterKind: AskCoreEducationIdentityRosterKind,
    rosterId: number,
  ) => Promise<void>;
  reviewingClaimId: number | null;
  students: JsonRecord[];
  teachers: JsonRecord[];
}

export const EducationIdentitySection = memo<EducationIdentitySectionProps>(
  ({
    bindingIdentity,
    canManage,
    claims,
    claimsLoading,
    identityForm,
    members,
    reviewingClaimId,
    students,
    teachers,
    onApproveClaim,
    onBindIdentity,
    onCreateIdentityClaim,
    onRejectClaim,
    onReloadClaims,
    onUnbindIdentity,
  }) => {
    const [identityRosterKind, setIdentityRosterKind] =
      useState<AskCoreEducationIdentityRosterKind>('teacher');
    const [identityRosterId, setIdentityRosterId] = useState<number | null>(null);

    const memberOptions = useMemo(
      () =>
        members.map((member) => ({
          label: memberLabel(members, member.userId),
          value: member.userId,
        })),
      [members],
    );

    const identityRosterRows = identityRosterKind === 'teacher' ? teachers : students;
    const identityRosterOptions = useMemo(
      () => buildIdentityRosterOptions(identityRosterKind, identityRosterRows, members),
      [identityRosterKind, identityRosterRows, members],
    );
    const selectedIdentityRosterOption = identityRosterOptions.find(
      (option) => Number(option.value) === identityRosterId,
    );

    const handleIdentityRosterKindChange = (value: AskCoreEducationIdentityRosterKind) => {
      setIdentityRosterKind(value);
      setIdentityRosterId(null);
      identityForm.setFieldsValue({
        identity_roster_id: undefined,
        identity_roster_kind: value,
        identity_user_id: undefined,
      });
    };

    const renderClaim = (claim: AskCoreEducationIdentityClaim) => {
      const rosterLabel = rosterName(claim.roster_kind, claim.roster_id, teachers, students);
      const userLabel = memberLabel(members, claim.better_auth_user_id);
      return (
        <div className={styles.identityClaimItem} key={claim.id}>
          <div className={styles.identityClaimMain}>
            <div className={styles.identityClaimTitle}>
              {rosterKindLabels[claim.roster_kind]} · {rosterLabel}
            </div>
            <div className={styles.identityClaimMeta}>{userLabel}</div>
          </div>
          <Space wrap>
            <Tag color={identityStatusColors[claim.status] || 'default'}>
              {identityStatusLabels[claim.status] || claim.status}
            </Tag>
            {canManage && claim.status === 'pending' ? (
              <>
                <Button
                  loading={reviewingClaimId === claim.id}
                  size="small"
                  type="primary"
                  onClick={() => onApproveClaim(claim.id)}
                >
                  通过
                </Button>
                <Button
                  danger
                  loading={reviewingClaimId === claim.id}
                  size="small"
                  onClick={() => onRejectClaim(claim.id)}
                >
                  拒绝
                </Button>
              </>
            ) : null}
          </Space>
        </div>
      );
    };

    return (
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <span className={styles.sectionTitle}>教育身份绑定</span>
            <span className={styles.sectionSubtitle}>提交申请、绑定账号和审批身份</span>
          </div>
          <Button
            icon={<RefreshCw size={14} />}
            loading={claimsLoading}
            size="small"
            type="text"
            onClick={onReloadClaims}
          />
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.identityLayout}>
            <section className={styles.identityPanel}>
              <div className={styles.identityPanelHeader}>
                <div className={styles.rolePanelTitle}>提交身份申请</div>
                <div className={styles.rolePanelMeta}>
                  选择教师或学生名册身份，提交后由组织管理员审批。
                </div>
              </div>
              <Form className={styles.roleAssignForm} form={identityForm} layout="vertical">
                <Form.Item
                  initialValue="teacher"
                  label="名册类型"
                  name="identity_roster_kind"
                  rules={[{ required: true, message: '请选择名册类型' }]}
                >
                  <Select
                    options={[
                      { label: '教师', value: 'teacher' },
                      { label: '学生', value: 'student' },
                    ]}
                    onChange={handleIdentityRosterKindChange}
                  />
                </Form.Item>
                <Form.Item
                  label={identityRosterKind === 'teacher' ? '教师名册' : '学生名册'}
                  name="identity_roster_id"
                  rules={[{ required: true, message: '请选择名册身份' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={identityRosterOptions}
                    placeholder={identityRosterKind === 'teacher' ? '搜索教师名册' : '搜索学生名册'}
                    onChange={(value) => setIdentityRosterId(Number(value))}
                  />
                </Form.Item>
                {canManage ? (
                  <Form.Item
                    label="绑定账号"
                    name="identity_user_id"
                    rules={[{ required: true, message: '请选择组织成员账号' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={memberOptions}
                      placeholder="搜索组织成员"
                    />
                  </Form.Item>
                ) : null}
                <Space wrap>
                  <Button
                    className={styles.pillButton}
                    loading={bindingIdentity}
                    type={canManage ? 'default' : 'primary'}
                    onClick={onCreateIdentityClaim}
                  >
                    提交身份申请
                  </Button>
                  {canManage ? (
                    <Button
                      className={styles.pillButton}
                      loading={bindingIdentity}
                      type="primary"
                      onClick={onBindIdentity}
                    >
                      管理员直接绑定
                    </Button>
                  ) : null}
                  {canManage && selectedIdentityRosterOption?.boundUserId ? (
                    <Popconfirm
                      title="解除该名册身份与账号的绑定？"
                      onConfirm={() =>
                        onUnbindIdentity(identityRosterKind, Number(identityRosterId || 0))
                      }
                    >
                      <Button danger loading={bindingIdentity}>
                        解绑
                      </Button>
                    </Popconfirm>
                  ) : null}
                </Space>
              </Form>
            </section>

            <section className={styles.identityPanel}>
              <div className={styles.identityPanelHeader}>
                <div className={styles.rolePanelTitle}>
                  {canManage ? '待审批身份申请' : '我的身份申请'}
                </div>
                <div className={styles.rolePanelMeta}>
                  {canManage
                    ? '管理员通过后，申请人会立即绑定到对应教师或学生名册。'
                    : '管理员审批通过后，工作台会按你的教师或学生身份显示。'}
                </div>
              </div>
              {claimsLoading ? (
                <div className={styles.identityClaimLoading}>
                  <Spin size="small" />
                </div>
              ) : claims.length ? (
                <div className={styles.identityClaimList}>{claims.map(renderClaim)}</div>
              ) : (
                <Empty
                  description={canManage ? '暂无待审批身份申请' : '暂无身份申请'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </section>
          </div>
        </div>
      </div>
    );
  },
);

EducationIdentitySection.displayName = 'EducationIdentitySection';
