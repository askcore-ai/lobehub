'use client';

import { Alert, Button, Empty, Form, Input, Select, Space, Spin, Tag } from 'antd';
import { Link2, Plus, RefreshCw, Send, UserRoundPlus } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { message } from '@/components/AntdStaticMethods';

import {
  bindAskCoreDirectoryPersonAccount,
  createAskCoreDirectoryInvitation,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  fetchAskCoreOrganizationDirectory,
} from '../api';
import { styles } from '../styles';
import {
  type AskCoreDirectoryPerson,
  type AskCoreDirectoryRosterKind,
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitType,
  type AskCoreEducationRole,
  type AskCoreOrganizationDirectoryPayload,
} from '../types';

const unitTypeLabels: Record<AskCoreEducationOrgUnitType, string> = {
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

const registrationLabels: Record<AskCoreDirectoryPerson['registration_status'], string> = {
  invited: '邀请中',
  registered: '已注册',
  unregistered: '未注册',
};

const registrationColors: Record<AskCoreDirectoryPerson['registration_status'], string> = {
  invited: 'gold',
  registered: 'green',
  unregistered: 'default',
};

const roleOptionsByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole[]> = {
  class: ['homeroom_teacher', 'teacher', 'student'],
  cohort: ['grade_admin', 'teacher'],
  department: ['teacher'],
  school: ['school_admin', 'teacher'],
};

const rosterKindOptions: { label: string; value: AskCoreDirectoryRosterKind }[] = [
  { label: '教师', value: 'teacher' },
  { label: '学生', value: 'student' },
];

const displayUnitName = (unit?: AskCoreEducationOrgUnit) =>
  unit ? `${unit.name} · ${unitTypeLabels[unit.unit_type]}` : '未设置';

const sortUnits = (units: AskCoreEducationOrgUnit[]) =>
  [...units].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

const UnitTree = memo<{
  selectedUnitId: number | null;
  units: AskCoreEducationOrgUnit[];
  onSelect: (unitId: number | null) => void;
}>(({ units, selectedUnitId, onSelect }) => {
  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, AskCoreEducationOrgUnit[]>();
    for (const unit of units) {
      const key = unit.parent_id ?? null;
      map.set(key, [...(map.get(key) || []), unit]);
    }
    for (const [key, value] of map.entries()) map.set(key, sortUnits(value));
    return map;
  }, [units]);

  const renderBranch = (parentId: number | null, depth = 0): ReactNode[] =>
    (childrenByParent.get(parentId) || []).flatMap((unit) => [
      <button
        className={`${styles.directoryTreeNode} ${
          selectedUnitId === unit.id ? styles.directoryTreeNodeActive : ''
        }`}
        key={unit.id}
        style={{ paddingInlineStart: 12 + depth * 18 }}
        type="button"
        onClick={() => onSelect(unit.id)}
      >
        <span>{unit.name}</span>
        <Tag>{unitTypeLabels[unit.unit_type]}</Tag>
      </button>,
      ...renderBranch(unit.id, depth + 1),
    ]);

  return (
    <div className={styles.directoryTree}>
      <button
        className={`${styles.directoryTreeNode} ${selectedUnitId === null ? styles.directoryTreeNodeActive : ''}`}
        type="button"
        onClick={() => onSelect(null)}
      >
        <span>全部人员</span>
        <Tag>组织</Tag>
      </button>
      {renderBranch(null)}
    </div>
  );
});

UnitTree.displayName = 'UnitTree';

interface OrganizationDirectorySectionProps {
  canManage: boolean;
}

export const OrganizationDirectorySection = memo<OrganizationDirectorySectionProps>(({ canManage }) => {
  const [payload, setPayload] = useState<AskCoreOrganizationDirectoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [personForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [inviteForm] = Form.useForm();

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await fetchAskCoreOrganizationDirectory();
      setPayload(next);
      setSelectedPersonId((current) => current ?? next.people[0]?.id ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '组织架构加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const units = payload?.units ?? [];
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const people = payload?.people ?? [];
  const selectedUnit = selectedUnitId ? unitById.get(selectedUnitId) || null : null;
  const filteredPeople = selectedUnitId
    ? people.filter((person) => person.primary_org_unit_id === selectedUnitId)
    : people;
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) || filteredPeople[0] || people[0] || null;
  const selectedPersonRoles = selectedPerson
    ? (payload?.role_assignments || []).filter((role) => role.person_id === selectedPerson.id)
    : [];
  const selectedPersonLinks = selectedPerson
    ? (payload?.roster_links || []).filter((link) => link.person_id === selectedPerson.id)
    : [];
  const selectedPersonInvitations = selectedPerson
    ? (payload?.invitations || []).filter((invite) => invite.person_id === selectedPerson.id)
    : [];
  const activeUnitForRole = selectedUnit || (selectedPerson?.primary_org_unit_id ? unitById.get(selectedPerson.primary_org_unit_id) || null : null);
  const roleOptions = (activeUnitForRole ? roleOptionsByUnitType[activeUnitForRole.unit_type] : [])
    .map((role) => ({ label: roleLabels[role], value: role }));
  const unitOptions = units.map((unit) => ({ label: displayUnitName(unit), value: unit.id }));

  const createPerson = async () => {
    const values = await personForm.validateFields();
    setSaving(true);
    try {
      await createAskCoreDirectoryPerson({
        display_name: values.display_name,
        email: values.email || undefined,
        primary_org_unit_id: values.primary_org_unit_id || selectedUnitId || undefined,
        roster_kind: values.roster_kind,
      });
      personForm.resetFields();
      await loadDirectory();
      message.success('人员已创建');
    } finally {
      setSaving(false);
    }
  };

  const bindAccount = async () => {
    if (!selectedPerson) return;
    const values = await accountForm.validateFields();
    setSaving(true);
    try {
      await bindAskCoreDirectoryPersonAccount(selectedPerson.id, values.better_auth_user_id);
      accountForm.resetFields();
      await loadDirectory();
      message.success('账号已绑定');
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async () => {
    if (!selectedPerson) return;
    const values = await roleForm.validateFields();
    setSaving(true);
    try {
      await createAskCoreDirectoryPersonRole(selectedPerson.id, {
        org_unit_id: values.org_unit_id,
        role: values.role,
      });
      roleForm.resetFields(['role']);
      await loadDirectory();
      message.success('角色已分配');
    } finally {
      setSaving(false);
    }
  };

  const createInvitation = async (kind: 'directed' | 'open') => {
    const values = await inviteForm.validateFields(kind === 'open' ? ['primary_org_unit_id', 'role'] : []);
    setSaving(true);
    try {
      await createAskCoreDirectoryInvitation(
        kind === 'directed'
          ? {
              email: values.email || selectedPerson?.email || undefined,
              invitation_kind: 'directed',
              person_id: selectedPerson?.id,
            }
          : {
              email: values.email || undefined,
              invitation_kind: 'open',
              primary_org_unit_id: values.primary_org_unit_id,
              preset_roles: values.role ? [values.role] : [],
            },
      );
      inviteForm.resetFields();
      await loadDirectory();
      message.success(kind === 'directed' ? '定向邀请已创建' : '邀请链接已创建');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div aria-label="组织架构工作区" className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.sectionTitle}>组织架构</span>
          <span className={styles.sectionSubtitle}>统一管理人员、位置、角色、账号和邀请</span>
        </div>
        <Button icon={<RefreshCw size={14} />} loading={loading} size="small" type="text" onClick={loadDirectory} />
      </div>
      <div className={styles.sectionBody}>
        {error ? <Alert showIcon style={{ marginBottom: 12 }} title={error} type="error" /> : null}
        {loading && !payload ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : payload ? (
          <div className={styles.directoryWorkspace}>
            <section className={styles.directoryPane}>
              <div className={styles.directoryPaneTitle}>组织树</div>
              <UnitTree selectedUnitId={selectedUnitId} units={units} onSelect={setSelectedUnitId} />
            </section>

            <section className={styles.directoryPane}>
              <div className={styles.directoryPaneTitle}>
                {selectedUnit ? selectedUnit.name : '全部人员'} · {filteredPeople.length}
              </div>
              {canManage ? (
                <Form className={styles.directoryInlineForm} form={personForm} layout="vertical">
                  <Form.Item name="display_name" rules={[{ message: '请输入姓名', required: true }]}>
                    <Input placeholder="姓名" />
                  </Form.Item>
                  <Form.Item name="roster_kind">
                    <Select allowClear options={rosterKindOptions} placeholder="教师/学生" />
                  </Form.Item>
                  <Form.Item name="primary_org_unit_id">
                    <Select allowClear options={unitOptions} placeholder="主位置" />
                  </Form.Item>
                  <Button icon={<UserRoundPlus size={14} />} loading={saving} type="primary" onClick={createPerson}>
                    新建人员
                  </Button>
                </Form>
              ) : null}
              <div className={styles.directoryPeopleList}>
                {filteredPeople.length ? (
                  filteredPeople.map((person) => (
                    <button
                      className={`${styles.directoryPersonRow} ${
                        selectedPerson?.id === person.id ? styles.directoryPersonRowActive : ''
                      }`}
                      key={person.id}
                      type="button"
                      onClick={() => setSelectedPersonId(person.id)}
                    >
                      <span>
                        <strong>{person.display_name}</strong>
                        <small>{displayUnitName(unitById.get(person.primary_org_unit_id || 0))}</small>
                      </span>
                      <Tag color={registrationColors[person.registration_status]}>
                        {registrationLabels[person.registration_status]}
                      </Tag>
                    </button>
                  ))
                ) : (
                  <Empty description="当前节点暂无人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </section>

            <section className={styles.directoryPane}>
              <div className={styles.directoryPaneTitle}>人员详情</div>
              {selectedPerson ? (
                <div className={styles.directoryDetail}>
                  <div>
                    <div className={styles.directoryPersonName}>{selectedPerson.display_name}</div>
                    <Space wrap>
                      <Tag color={registrationColors[selectedPerson.registration_status]}>
                        {registrationLabels[selectedPerson.registration_status]}
                      </Tag>
                      <Tag>{displayUnitName(unitById.get(selectedPerson.primary_org_unit_id || 0))}</Tag>
                    </Space>
                  </div>

                  <div>
                    <div className={styles.directoryDetailTitle}>角色</div>
                    <Space wrap>
                      {selectedPersonRoles.length ? (
                        selectedPersonRoles.map((role) => (
                          <Tag key={role.id}>
                            {roleLabels[role.role]} · {unitById.get(role.org_unit_id)?.name || role.org_unit_id}
                          </Tag>
                        ))
                      ) : (
                        <Tag>暂无角色</Tag>
                      )}
                    </Space>
                    {canManage ? (
                      <Form className={styles.directoryInlineForm} form={roleForm} layout="vertical">
                        <Form.Item
                          initialValue={activeUnitForRole?.id}
                          name="org_unit_id"
                          rules={[{ message: '请选择作用范围', required: true }]}
                        >
                          <Select options={unitOptions} placeholder="作用范围" />
                        </Form.Item>
                        <Form.Item name="role" rules={[{ message: '请选择角色', required: true }]}>
                          <Select options={roleOptions} placeholder="角色" />
                        </Form.Item>
                        <Button loading={saving} onClick={assignRole}>分配角色</Button>
                      </Form>
                    ) : null}
                  </div>

                  <div>
                    <div className={styles.directoryDetailTitle}>账号绑定</div>
                    <div className={styles.directoryMetaLine}>
                      {selectedPerson.better_auth_user_id || '未绑定 AskCore 账号'}
                    </div>
                    {canManage ? (
                      <Form className={styles.directoryInlineForm} form={accountForm} layout="vertical">
                        <Form.Item
                          name="better_auth_user_id"
                          rules={[{ message: '请输入 Better Auth 用户 ID', required: true }]}
                        >
                          <Input placeholder="Better Auth 用户 ID" />
                        </Form.Item>
                        <Button icon={<Link2 size={14} />} loading={saving} onClick={bindAccount}>
                          绑定账号
                        </Button>
                      </Form>
                    ) : null}
                  </div>

                  <div>
                    <div className={styles.directoryDetailTitle}>邀请与加入</div>
                    <div className={styles.directoryMetaLine}>
                      待处理邀请 {selectedPersonInvitations.filter((item) => item.status === 'pending').length} 个
                    </div>
                    {canManage ? (
                      <Form className={styles.directoryInlineForm} form={inviteForm} layout="vertical">
                        <Form.Item name="email">
                          <Input placeholder="邮箱（可选）" />
                        </Form.Item>
                        <Form.Item name="primary_org_unit_id">
                          <Select options={unitOptions} placeholder="不定向邀请位置" />
                        </Form.Item>
                        <Form.Item name="role">
                          <Select
                            allowClear
                            options={[
                              { label: '教师', value: 'teacher' },
                              { label: '学生', value: 'student' },
                            ]}
                            placeholder="预设角色"
                          />
                        </Form.Item>
                        <Space wrap>
                          <Button icon={<Send size={14} />} loading={saving} onClick={() => createInvitation('directed')}>
                            发送定向邀请
                          </Button>
                          <Button loading={saving} onClick={() => createInvitation('open')}>创建邀请链接</Button>
                        </Space>
                      </Form>
                    ) : null}
                  </div>

                  <div>
                    <div className={styles.directoryDetailTitle}>兼容名册</div>
                    <Space wrap>
                      {selectedPersonLinks.length ? (
                        selectedPersonLinks.map((link) => (
                          <Tag key={link.id}>
                            {link.roster_kind === 'teacher' ? '教师' : '学生'} #{link.roster_id}
                          </Tag>
                        ))
                      ) : (
                        <Tag>无名册链接</Tag>
                      )}
                    </Space>
                  </div>
                </div>
              ) : (
                <Empty description="请选择人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </section>
          </div>
        ) : (
          <Empty description="暂无组织架构数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
});

OrganizationDirectorySection.displayName = 'OrganizationDirectorySection';
