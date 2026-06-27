'use client';

import { Alert, Button, Empty, Form, Input, Select, Space, Spin, Tag, TreeSelect } from 'antd';
import { Download, Link2, Plus, RefreshCw, Send, Upload, UserRoundPlus } from 'lucide-react';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { message } from '@/components/AntdStaticMethods';

import {
  bindAskCoreDirectoryPersonAccount,
  createAskCoreDirectoryInvitation,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  fetchAskCoreOrganizationDirectory,
  importAskCoreDirectoryPeople,
  uploadAskCoreCsv,
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

const allRoleOptions = (Object.keys(roleLabels) as AskCoreEducationRole[]).map((role) => ({
  label: roleLabels[role],
  value: role,
}));

const sortUnits = (units: AskCoreEducationOrgUnit[]) =>
  [...units].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

const roleAllowedForUnit = (role: AskCoreEducationRole | undefined, unit: AskCoreEducationOrgUnit) =>
  !role || roleOptionsByUnitType[unit.unit_type].includes(role);

const roleColor = (role: AskCoreEducationRole) => {
  if (role === 'student') return 'blue';
  if (role === 'teacher' || role === 'homeroom_teacher') return 'geekblue';
  return 'purple';
};

const makeChildrenByParent = (units: AskCoreEducationOrgUnit[]) => {
  const map = new Map<number | null, AskCoreEducationOrgUnit[]>();
  for (const unit of units) {
    const key = unit.parent_id ?? null;
    map.set(key, [...(map.get(key) || []), unit]);
  }
  for (const [key, value] of map.entries()) map.set(key, sortUnits(value));
  return map;
};

const makeUnitPath = (
  unitId: number | null | undefined,
  unitById: Map<number, AskCoreEducationOrgUnit>,
) => {
  const path: AskCoreEducationOrgUnit[] = [];
  let current = unitId ? unitById.get(unitId) : undefined;
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parent_id ? unitById.get(current.parent_id) : undefined;
  }
  return path;
};

const UnitTree = memo<{
  activeAncestorIds: Set<number>;
  peopleCountByUnitId: Map<number, number>;
  selectedUnitId: number | null;
  totalPeopleCount: number;
  units: AskCoreEducationOrgUnit[];
  onSelect: (unitId: number | null) => void;
}>(({ activeAncestorIds, peopleCountByUnitId, selectedUnitId, totalPeopleCount, units, onSelect }) => {
  const childrenByParent = useMemo(() => makeChildrenByParent(units), [units]);

  const renderBranch = (parentId: number | null, depth = 0): ReactNode[] =>
    (childrenByParent.get(parentId) || []).flatMap((unit) => {
      const active = selectedUnitId === unit.id;
      const ancestor = activeAncestorIds.has(unit.id) && !active;
      return [
        <button
          aria-current={active ? 'true' : undefined}
          key={unit.id}
          style={{ paddingInlineStart: 12 + depth * 16 }}
          type="button"
          className={`${styles.directoryTreeNode} ${active ? styles.directoryTreeNodeActive : ''} ${
            ancestor ? styles.directoryTreeNodeAncestor : ''
          }`}
          onClick={() => onSelect(unit.id)}
        >
          <span className={styles.directoryTreeNodeLabel}>
            <span>{unit.name}</span>
            <small>{unitTypeLabels[unit.unit_type]}</small>
          </span>
          <Tag className={styles.directoryTreeTag}>{peopleCountByUnitId.get(unit.id) || 0}</Tag>
        </button>,
        ...renderBranch(unit.id, depth + 1),
      ];
    });

  return (
    <div className={styles.directoryTree}>
      <button
        aria-current={selectedUnitId === null ? 'true' : undefined}
        type="button"
        className={`${styles.directoryTreeNode} ${
          selectedUnitId === null ? styles.directoryTreeNodeActive : ''
        }`}
        onClick={() => onSelect(null)}
      >
        <span className={styles.directoryTreeNodeLabel}>
          <span>全部人员</span>
          <small>组织</small>
        </span>
        <Tag className={styles.directoryTreeTag}>{totalPeopleCount}</Tag>
      </button>
      {renderBranch(null)}
    </div>
  );
});

UnitTree.displayName = 'UnitTree';

interface OrganizationDirectorySectionProps {
  canManage: boolean;
}

interface DirectoryTreeSelectNode {
  children?: DirectoryTreeSelectNode[];
  disabled: boolean;
  key: number;
  title: string;
  value: number;
}

export const OrganizationDirectorySection = memo<OrganizationDirectorySectionProps>(({ canManage }) => {
  const [payload, setPayload] = useState<AskCoreOrganizationDirectoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const orgImportInputRef = useRef<HTMLInputElement>(null);
  const unitImportInputRef = useRef<HTMLInputElement>(null);
  const [orgPersonForm] = Form.useForm();
  const [unitPersonForm] = Form.useForm();
  const [orgInviteForm] = Form.useForm();
  const [unitInviteForm] = Form.useForm();
  const [orgImportForm] = Form.useForm();
  const [unitImportForm] = Form.useForm();
  const [accountForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [directInviteForm] = Form.useForm();
  const watchedRole = Form.useWatch('role', roleForm) as AskCoreEducationRole | undefined;
  const watchedOrgInviteRole = Form.useWatch('role', orgInviteForm) as AskCoreEducationRole | undefined;

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

  const units = useMemo(() => payload?.units ?? [], [payload?.units]);
  const people = useMemo(() => payload?.people ?? [], [payload?.people]);
  const roleAssignments = useMemo(
    () => payload?.role_assignments ?? [],
    [payload?.role_assignments],
  );
  const invitations = useMemo(() => payload?.invitations ?? [], [payload?.invitations]);
  const rosterLinks = useMemo(() => payload?.roster_links ?? [], [payload?.roster_links]);
  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const childrenByParent = useMemo(() => makeChildrenByParent(units), [units]);
  const selectedUnit = selectedUnitId ? unitById.get(selectedUnitId) || null : null;
  const selectedPath = useMemo(() => makeUnitPath(selectedUnitId, unitById), [selectedUnitId, unitById]);
  const activeAncestorIds = useMemo(
    () => new Set(selectedPath.map((unit) => unit.id)),
    [selectedPath],
  );
  const unitPathLabel = useCallback(
    (unitId?: number | null) => {
      const path = makeUnitPath(unitId, unitById);
      return path.length ? path.map((unit) => unit.name).join(' / ') : '未设置';
    },
    [unitById],
  );
  const selectedPathLabel = selectedUnit ? unitPathLabel(selectedUnit.id) : '全部人员';
  const filteredPeople = useMemo(
    () =>
      selectedUnitId
        ? people.filter((person) => person.primary_org_unit_id === selectedUnitId)
        : people,
    [people, selectedUnitId],
  );
  const peopleCountByUnitId = useMemo(() => {
    const map = new Map<number, number>();
    for (const person of people) {
      if (person.primary_org_unit_id) {
        map.set(person.primary_org_unit_id, (map.get(person.primary_org_unit_id) || 0) + 1);
      }
    }
    return map;
  }, [people]);
  const rolesByPersonId = useMemo(() => {
    const map = new Map<number, typeof roleAssignments>();
    for (const role of roleAssignments) {
      if (!role.person_id) continue;
      map.set(role.person_id, [...(map.get(role.person_id) || []), role]);
    }
    return map;
  }, [roleAssignments]);
  const linksByPersonId = useMemo(() => {
    const map = new Map<number, typeof rosterLinks>();
    for (const link of rosterLinks) map.set(link.person_id, [...(map.get(link.person_id) || []), link]);
    return map;
  }, [rosterLinks]);
  const pendingInvitationsByPersonId = useMemo(() => {
    const map = new Map<number, number>();
    for (const invite of invitations) {
      if (invite.status !== 'pending' || !invite.person_id) continue;
      map.set(invite.person_id, (map.get(invite.person_id) || 0) + 1);
    }
    return map;
  }, [invitations]);
  const selectedPerson =
    filteredPeople.find((person) => person.id === selectedPersonId) || filteredPeople[0] || null;
  const selectedPersonRoles = selectedPerson ? rolesByPersonId.get(selectedPerson.id) || [] : [];
  const selectedPersonLinks = selectedPerson ? linksByPersonId.get(selectedPerson.id) || [] : [];
  const selectedPersonPendingInvites = selectedPerson
    ? pendingInvitationsByPersonId.get(selectedPerson.id) || 0
    : 0;
  const selectedNodePendingInvites = invitations.filter((invite) => {
    if (invite.status !== 'pending') return false;
    if (!selectedUnitId) return invite.invitation_kind === 'open' || Boolean(invite.person_id);
    if (invite.primary_org_unit_id === selectedUnitId) return true;
    if (!invite.person_id) return false;
    return people.find((person) => person.id === invite.person_id)?.primary_org_unit_id === selectedUnitId;
  }).length;

  useEffect(() => {
    if (!filteredPeople.length) {
      setSelectedPersonId(null);
      return;
    }
    if (!filteredPeople.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId(filteredPeople[0].id);
    }
  }, [filteredPeople, selectedPersonId]);

  const buildUnitTreeData = useCallback(
    (role?: AskCoreEducationRole, parentId: number | null = null): DirectoryTreeSelectNode[] =>
      (childrenByParent.get(parentId) || []).map((unit) => ({
        disabled: !roleAllowedForUnit(role, unit),
        key: unit.id,
        title: `${unit.name} · ${unitTypeLabels[unit.unit_type]}`,
        value: unit.id,
        children: buildUnitTreeData(role, unit.id),
      })),
    [childrenByParent],
  );

  const roleScopedTreeData = useMemo(() => buildUnitTreeData(watchedRole), [buildUnitTreeData, watchedRole]);
  const orgInviteTreeData = useMemo(
    () => buildUnitTreeData(watchedOrgInviteRole),
    [buildUnitTreeData, watchedOrgInviteRole],
  );
  const plainTreeData = useMemo(() => buildUnitTreeData(), [buildUnitTreeData]);
  const selectedUnitRoleOptions = (selectedUnit ? roleOptionsByUnitType[selectedUnit.unit_type] : [])
    .map((role) => ({ label: roleLabels[role], value: role }));

  const createPerson = async (scope: 'organization' | 'unit') => {
    const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createAskCoreDirectoryPerson({
        display_name: values.display_name,
        email: values.email || undefined,
        primary_org_unit_id:
          scope === 'unit' ? selectedUnitId || undefined : values.primary_org_unit_id || undefined,
        roster_kind: values.roster_kind,
      });
      form.resetFields();
      await loadDirectory();
      message.success('人员已创建');
    } finally {
      setSaving(false);
    }
  };

  const createOpenInvitation = async (scope: 'organization' | 'unit') => {
    const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
    const values = await form.validateFields();
    const primaryOrgUnitId = scope === 'unit' ? selectedUnitId : values.primary_org_unit_id;
    if (!primaryOrgUnitId) return;
    setSaving(true);
    try {
      await createAskCoreDirectoryInvitation({
        email: values.email || undefined,
        invitation_kind: 'open',
        primary_org_unit_id: primaryOrgUnitId,
        preset_roles: values.role ? [values.role] : [],
      });
      form.resetFields();
      await loadDirectory();
      message.success(scope === 'unit' ? '当前节点邀请链接已创建' : '不定向邀请已创建');
    } finally {
      setSaving(false);
    }
  };

  const handleCsvImport = async (scope: 'organization' | 'unit', file: File) => {
    const form = scope === 'organization' ? orgImportForm : unitImportForm;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const objectKey = await uploadAskCoreCsv(file);
      const result = await importAskCoreDirectoryPeople({
        csv_ref: {
          locator: { kind: 'object_store', object_key: objectKey },
          media_type: 'text/csv',
          purpose: 'csv',
        },
        default_role: values.default_role || undefined,
        primary_org_unit_id: scope === 'unit' ? selectedUnitId || undefined : undefined,
        roster_kind: values.roster_kind || undefined,
        scope,
      });
      await loadDirectory();
      const errorText = result.errors.length ? `，${result.errors.length} 行失败` : '';
      message.success(`批量导入完成：新增 ${result.created_count} 人${errorText}`);
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
      roleForm.resetFields();
      await loadDirectory();
      message.success('角色已分配');
    } finally {
      setSaving(false);
    }
  };

  const createDirectedInvitation = async () => {
    if (!selectedPerson) return;
    const values = await directInviteForm.validateFields();
    setSaving(true);
    try {
      await createAskCoreDirectoryInvitation({
        email: values.email || selectedPerson.email || undefined,
        invitation_kind: 'directed',
        person_id: selectedPerson.id,
      });
      directInviteForm.resetFields();
      await loadDirectory();
      message.success('定向邀请已创建');
    } finally {
      setSaving(false);
    }
  };

  const exportDirectory = () => {
    if (!payload) return;
    const header = ['姓名', '注册状态', '主位置', '角色'];
    const rows = people.map((person) => [
      person.display_name,
      registrationLabels[person.registration_status],
      unitPathLabel(person.primary_org_unit_id),
      (rolesByPersonId.get(person.id) || [])
        .map((role) => `${roleLabels[role.role]}@${unitPathLabel(role.org_unit_id)}`)
        .join(';'),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'askcore-directory.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div aria-label="组织架构工作区" className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <span className={styles.sectionTitle}>组织架构</span>
          <span className={styles.sectionSubtitle}>统一管理人员、位置、角色、账号和邀请</span>
        </div>
        <Button icon={<RefreshCw size={14} />} loading={loading} size="small" type="text" onClick={loadDirectory}>
          刷新
        </Button>
      </div>
      <div className={styles.sectionBody}>
        {error ? <Alert showIcon style={{ marginBottom: 12 }} title={error} type="error" /> : null}
        {loading && !payload ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : payload ? (
          <>
            {canManage ? (
              <section aria-label="组织级操作" className={styles.directoryToolbar}>
                <Form className={styles.directoryToolbarForm} form={orgPersonForm} layout="vertical">
                  <Form.Item name="display_name" rules={[{ message: '请输入姓名', required: true }]}>
                    <Input placeholder="姓名" />
                  </Form.Item>
                  <Form.Item name="primary_org_unit_id">
                    <TreeSelect
                      allowClear
                      showSearch
                      treeDefaultExpandAll
                      placeholder="主位置"
                      treeData={plainTreeData}
                    />
                  </Form.Item>
                  <Form.Item name="roster_kind">
                    <Select allowClear options={rosterKindOptions} placeholder="名册" />
                  </Form.Item>
                  <Button
                    icon={<UserRoundPlus size={14} />}
                    loading={saving}
                    type="primary"
                    onClick={() => createPerson('organization')}
                  >
                    新建人员
                  </Button>
                </Form>
                <Form className={styles.directoryToolbarForm} form={orgInviteForm} layout="vertical">
                  <Form.Item name="role">
                    <Select
                      allowClear
                      options={allRoleOptions}
                      placeholder="预设角色"
                      onChange={() => orgInviteForm.resetFields(['primary_org_unit_id'])}
                    />
                  </Form.Item>
                  <Form.Item name="primary_org_unit_id" rules={[{ message: '请选择邀请位置', required: true }]}>
                    <TreeSelect
                      showSearch
                      treeDefaultExpandAll
                      placeholder="邀请位置"
                      treeData={orgInviteTreeData}
                    />
                  </Form.Item>
                  <Button icon={<Send size={14} />} loading={saving} onClick={() => createOpenInvitation('organization')}>
                    不定向邀请
                  </Button>
                </Form>
                <Form className={styles.directoryToolbarForm} form={orgImportForm} layout="vertical">
                  <Form.Item name="default_role">
                    <Select allowClear options={allRoleOptions} placeholder="导入默认角色" />
                  </Form.Item>
                  <Form.Item name="roster_kind">
                    <Select allowClear options={rosterKindOptions} placeholder="默认名册" />
                  </Form.Item>
                  <Button icon={<Upload size={14} />} loading={saving} onClick={() => orgImportInputRef.current?.click()}>
                    批量导入
                  </Button>
                  <input
                    accept=".csv,text/csv"
                    className={styles.directoryFileInput}
                    ref={orgImportInputRef}
                    type="file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file) void handleCsvImport('organization', file);
                    }}
                  />
                </Form>
                <Button icon={<Download size={14} />} onClick={exportDirectory}>
                  导出
                </Button>
              </section>
            ) : null}

            <div className={styles.directoryWorkspace}>
              <section aria-label="组织树" className={styles.directoryPane}>
                <div className={styles.directoryPaneTitle}>组织树</div>
                <UnitTree
                  activeAncestorIds={activeAncestorIds}
                  peopleCountByUnitId={peopleCountByUnitId}
                  selectedUnitId={selectedUnitId}
                  totalPeopleCount={people.length}
                  units={units}
                  onSelect={setSelectedUnitId}
                />
              </section>

              <section aria-label="当前节点工作区" className={styles.directoryPane}>
                <div className={styles.directoryPaneHeader}>
                  <div>
                    <div className={styles.directoryPaneTitle}>
                      {selectedUnit ? selectedUnit.name : '全部人员'}
                    </div>
                    <div className={styles.directoryPaneMeta}>
                      {selectedPathLabel} · 直属 {filteredPeople.length} 人 · 待处理邀请 {selectedNodePendingInvites} 个
                    </div>
                  </div>
                </div>
                {canManage && selectedUnit ? (
                  <div className={styles.directoryNodeActions}>
                    <Form className={styles.directoryInlineForm} form={unitPersonForm} layout="vertical">
                      <Form.Item name="display_name" rules={[{ message: '请输入姓名', required: true }]}>
                        <Input placeholder="姓名" />
                      </Form.Item>
                      <Form.Item name="roster_kind">
                        <Select allowClear options={rosterKindOptions} placeholder="名册" />
                      </Form.Item>
                      <Button icon={<Plus size={14} />} loading={saving} onClick={() => createPerson('unit')}>
                        添加到当前节点
                      </Button>
                    </Form>
                    <Form className={styles.directoryInlineForm} form={unitInviteForm} layout="vertical">
                      <Form.Item name="role">
                        <Select allowClear options={selectedUnitRoleOptions} placeholder="预设角色" />
                      </Form.Item>
                      <Button icon={<Send size={14} />} loading={saving} onClick={() => createOpenInvitation('unit')}>
                        当前节点邀请
                      </Button>
                    </Form>
                    <Form className={styles.directoryInlineForm} form={unitImportForm} layout="vertical">
                      <Form.Item name="default_role">
                        <Select allowClear options={selectedUnitRoleOptions} placeholder="导入默认角色" />
                      </Form.Item>
                      <Form.Item name="roster_kind">
                        <Select allowClear options={rosterKindOptions} placeholder="默认名册" />
                      </Form.Item>
                      <Button icon={<Upload size={14} />} loading={saving} onClick={() => unitImportInputRef.current?.click()}>
                        批量导入到当前节点
                      </Button>
                      <input
                        accept=".csv,text/csv"
                        className={styles.directoryFileInput}
                        ref={unitImportInputRef}
                        type="file"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = '';
                          if (file) void handleCsvImport('unit', file);
                        }}
                      />
                    </Form>
                  </div>
                ) : null}
                <div className={styles.directoryPeopleList}>
                  {filteredPeople.length ? (
                    filteredPeople.map((person) => {
                      const personRoles = rolesByPersonId.get(person.id) || [];
                      const personLinks = linksByPersonId.get(person.id) || [];
                      const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
                      return (
                        <button
                          aria-current={selectedPerson?.id === person.id ? 'true' : undefined}
                          key={person.id}
                          type="button"
                          className={`${styles.directoryPersonRow} ${
                            selectedPerson?.id === person.id ? styles.directoryPersonRowActive : ''
                          }`}
                          onClick={() => setSelectedPersonId(person.id)}
                        >
                          <span className={styles.directoryPersonContent}>
                            <strong>{person.display_name}</strong>
                            <small>{unitPathLabel(person.primary_org_unit_id)}</small>
                            <span className={styles.directoryPersonTags}>
                              <Tag color={registrationColors[person.registration_status]}>
                                {registrationLabels[person.registration_status]}
                              </Tag>
                              {pendingInvites ? <Tag color="gold">待邀请 {pendingInvites}</Tag> : null}
                              {personRoles.length
                                ? personRoles.map((role) => (
                                    <Tag color={roleColor(role.role)} key={role.id}>
                                      {roleLabels[role.role]}
                                    </Tag>
                                  ))
                                : personLinks.map((link) => (
                                    <Tag key={link.id}>{link.roster_kind === 'teacher' ? '教师名册' : '学生名册'}</Tag>
                                  ))}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <Empty description="当前节点暂无人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
              </section>

              <section aria-label="人员详情" className={styles.directoryPane}>
                <div className={styles.directoryPaneTitle}>人员详情</div>
                {selectedPerson ? (
                  <div className={styles.directoryDetail}>
                    <section className={styles.directoryDetailSection}>
                      <div className={styles.directoryPersonName}>{selectedPerson.display_name}</div>
                      <Space wrap>
                        <Tag color={registrationColors[selectedPerson.registration_status]}>
                          {registrationLabels[selectedPerson.registration_status]}
                        </Tag>
                        <Tag>{unitPathLabel(selectedPerson.primary_org_unit_id)}</Tag>
                      </Space>
                    </section>

                    <section className={styles.directoryDetailSection}>
                      <div className={styles.directoryDetailTitle}>角色</div>
                      <Space wrap>
                        {selectedPersonRoles.length ? (
                          selectedPersonRoles.map((role) => (
                            <Tag color={roleColor(role.role)} key={role.id}>
                              {roleLabels[role.role]} · {unitPathLabel(role.org_unit_id)}
                            </Tag>
                          ))
                        ) : (
                          <Tag>暂无角色</Tag>
                        )}
                      </Space>
                      {canManage ? (
                        <Form className={styles.directoryInlineForm} form={roleForm} layout="vertical">
                          <Form.Item name="role" rules={[{ message: '请选择角色', required: true }]}>
                            <Select
                              options={allRoleOptions}
                              placeholder="角色"
                              onChange={() => roleForm.resetFields(['org_unit_id'])}
                            />
                          </Form.Item>
                          <Form.Item
                            name="org_unit_id"
                            rules={[{ message: '请选择作用范围', required: true }]}
                          >
                            <TreeSelect
                              showSearch
                              treeDefaultExpandAll
                              placeholder="作用范围"
                              treeData={roleScopedTreeData}
                            />
                          </Form.Item>
                          <Button loading={saving} onClick={assignRole}>分配角色</Button>
                        </Form>
                      ) : null}
                    </section>

                    <section className={styles.directoryDetailSection}>
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
                    </section>

                    <section className={styles.directoryDetailSection}>
                      <div className={styles.directoryDetailTitle}>定向邀请</div>
                      <div className={styles.directoryMetaLine}>待处理邀请 {selectedPersonPendingInvites} 个</div>
                      {canManage ? (
                        <Form className={styles.directoryInlineForm} form={directInviteForm} layout="vertical">
                          <Form.Item name="email">
                            <Input placeholder="邮箱（默认使用人员邮箱）" />
                          </Form.Item>
                          <Button icon={<Send size={14} />} loading={saving} onClick={createDirectedInvitation}>
                            发送定向邀请
                          </Button>
                        </Form>
                      ) : null}
                    </section>

                    <section className={styles.directoryDetailSection}>
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
                    </section>
                  </div>
                ) : (
                  <Empty description="请选择人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </section>
            </div>
          </>
        ) : (
          <Empty description="暂无组织架构数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
});

OrganizationDirectorySection.displayName = 'OrganizationDirectorySection';
