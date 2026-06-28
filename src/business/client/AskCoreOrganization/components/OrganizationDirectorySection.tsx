'use client';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Popover,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  TreeSelect,
} from 'antd';
import {
  Download,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserRound,
  UserRoundPlus,
} from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { message } from '@/components/AntdStaticMethods';

import {
  approveAskCoreEducationIdentityClaim,
  bindAskCoreDirectoryPersonAccount,
  createAskCoreDirectoryInvitation,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  createAskCoreEducationIdentityClaim,
  fetchAskCoreEducationIdentityClaims,
  fetchAskCoreOrganizationDirectory,
  importAskCoreDirectoryPeople,
  rejectAskCoreEducationIdentityClaim,
  uploadAskCoreCsv,
} from '../api';
import { ASKCORE_IDENTITY_CLAIM_OPEN_EVENT } from '../events';
import { styles } from '../styles';
import {
  type AskCoreDirectoryPerson,
  type AskCoreDirectoryRosterKind,
  type AskCoreEducationIdentityClaim,
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitType,
  type AskCoreEducationRole,
  type AskCoreOrganizationDirectoryPayload,
} from '../types';

type DirectoryFilterKey = 'all' | 'invited' | 'registered' | 'student' | 'teacher' | 'unregistered';
type DirectoryRoleTone = 'admin' | 'roster' | 'student' | 'teacher';
type IdentityDrawerMode = 'claim' | 'review';
const ALL_PEOPLE_TREE_VALUE = 0;

interface DirectoryRoleBadgeModel {
  key: string;
  label: string;
  path?: string;
  tone: DirectoryRoleTone;
}

interface DirectoryPersonRowModel {
  accountLabel: string;
  invitationLabel: string;
  pendingInvites: number;
  person: AskCoreDirectoryPerson;
  primaryPath: string;
  registrationLabel: string;
  roleBadges: DirectoryRoleBadgeModel[];
  updatedLabel: string;
}

interface DirectoryTreeSelectNode {
  children?: DirectoryTreeSelectNode[];
  disabled: boolean;
  key: number;
  label: string;
  title: ReactNode;
  value: number;
}

interface IdentityClaimTarget {
  disabledReason?: string;
  key: string;
  person: AskCoreDirectoryPerson;
  rosterId: number;
  rosterKind: AskCoreDirectoryRosterKind;
  unitPath: string;
}

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

const rosterKindLabels: Record<AskCoreDirectoryRosterKind, string> = {
  student: '学生',
  teacher: '教师',
};

const directoryFilterOptions: { key: DirectoryFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'teacher', label: '教师' },
  { key: 'student', label: '学生' },
  { key: 'registered', label: '已注册' },
  { key: 'unregistered', label: '未注册' },
  { key: 'invited', label: '邀请中' },
];

const allRoleOptions = (Object.keys(roleLabels) as AskCoreEducationRole[]).map((role) => ({
  label: roleLabels[role],
  value: role,
}));

const sortUnits = (units: AskCoreEducationOrgUnit[]) =>
  [...units].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

const roleAllowedForUnit = (
  role: AskCoreEducationRole | undefined,
  unit: AskCoreEducationOrgUnit,
) => !role || roleOptionsByUnitType[unit.unit_type].includes(role);

const roleTone = (role: AskCoreEducationRole): DirectoryRoleTone => {
  if (role === 'student') return 'student';
  if (role === 'teacher' || role === 'homeroom_teacher') return 'teacher';
  return 'admin';
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

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 16).replace('T', ' ');
  return value;
};

const personTimestamp = (person: AskCoreDirectoryPerson) => {
  const withTimestamps = person as AskCoreDirectoryPerson & {
    created_at?: string | null;
    updated_at?: string | null;
  };
  return formatDateTime(withTimestamps.updated_at || withTimestamps.created_at);
};

const matchesSearch = (person: AskCoreDirectoryPerson, query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [person.display_name, person.email, person.phone, person.better_auth_user_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword));
};

const UnitTree = memo<{
  activeAncestorIds: Set<number>;
  peopleCountByUnitId: Map<number, number>;
  selectedUnitId: number | null;
  totalPeopleCount: number;
  units: AskCoreEducationOrgUnit[];
  onSelect: (unitId: number | null) => void;
}>(
  ({
    activeAncestorIds,
    peopleCountByUnitId,
    selectedUnitId,
    totalPeopleCount,
    units,
    onSelect,
  }) => {
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
            <span className={styles.directoryTreeCount}>
              {peopleCountByUnitId.get(unit.id) || 0}
            </span>
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
          <span className={styles.directoryTreeCount}>{totalPeopleCount}</span>
        </button>
        {renderBranch(null)}
      </div>
    );
  },
);

UnitTree.displayName = 'UnitTree';

interface OrganizationDirectorySectionProps {
  canManage: boolean;
}

export const OrganizationDirectorySection = memo<OrganizationDirectorySectionProps>(
  ({ canManage }) => {
    const location = useLocation();
    const [payload, setPayload] = useState<AskCoreOrganizationDirectoryPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [identityDrawerOpen, setIdentityDrawerOpen] = useState(false);
    const [identityDrawerMode, setIdentityDrawerMode] = useState<IdentityDrawerMode>('claim');
    const [identityClaimSearchText, setIdentityClaimSearchText] = useState('');
    const [identityClaims, setIdentityClaims] = useState<AskCoreEducationIdentityClaim[]>([]);
    const [identityClaimsLoading, setIdentityClaimsLoading] = useState(false);
    const [submittingIdentityClaimKey, setSubmittingIdentityClaimKey] = useState<string | null>(
      null,
    );
    const [reviewingIdentityClaimId, setReviewingIdentityClaimId] = useState<number | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
    const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
    const [searchText, setSearchText] = useState('');
    const [activeFilter, setActiveFilter] = useState<DirectoryFilterKey>('all');
    const orgImportInputRef = useRef<HTMLInputElement>(null);
    const unitImportInputRef = useRef<HTMLInputElement>(null);
    const consumedIdentityActionLocationKeyRef = useRef<string | null>(null);
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
    const watchedOrgInviteRole = Form.useWatch('role', orgInviteForm) as
      | AskCoreEducationRole
      | undefined;

    const shouldOpenIdentityDrawer =
      new URLSearchParams(location.search).get('action') === 'identity-claim';

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

    const loadIdentityClaims = useCallback(
      async (mode: IdentityDrawerMode = identityDrawerMode) => {
        setIdentityClaimsLoading(true);
        try {
          const next = await fetchAskCoreEducationIdentityClaims(
            canManage && mode === 'review' ? 'pending' : 'all',
          );
          setIdentityClaims(next.items);
        } catch (reason) {
          message.error(reason instanceof Error ? reason.message : '身份申请加载失败');
        } finally {
          setIdentityClaimsLoading(false);
        }
      },
      [canManage, identityDrawerMode],
    );

    const openIdentityClaimDrawer = useCallback(() => {
      setIdentityDrawerMode('claim');
      setIdentityClaimSearchText('');
      setIdentityDrawerOpen(true);
      void loadIdentityClaims('claim');
    }, [loadIdentityClaims]);

    useEffect(() => {
      if (!shouldOpenIdentityDrawer) {
        consumedIdentityActionLocationKeyRef.current = null;
        return;
      }
      if (consumedIdentityActionLocationKeyRef.current === location.key) return;
      consumedIdentityActionLocationKeyRef.current = location.key;
      openIdentityClaimDrawer();
    }, [location.key, openIdentityClaimDrawer, shouldOpenIdentityDrawer]);

    useEffect(() => {
      window.addEventListener(ASKCORE_IDENTITY_CLAIM_OPEN_EVENT, openIdentityClaimDrawer);
      return () => {
        window.removeEventListener(ASKCORE_IDENTITY_CLAIM_OPEN_EVENT, openIdentityClaimDrawer);
      };
    }, [openIdentityClaimDrawer]);

    const switchIdentityDrawerMode = useCallback(
      (nextMode: IdentityDrawerMode) => {
        setIdentityDrawerMode(nextMode);
        if (nextMode === 'claim') setIdentityClaimSearchText('');
        void loadIdentityClaims(nextMode);
      },
      [loadIdentityClaims],
    );

    const units = useMemo(() => payload?.units ?? [], [payload?.units]);
    const people = useMemo(() => payload?.people ?? [], [payload?.people]);
    const roleAssignments = useMemo(
      () => payload?.role_assignments ?? [],
      [payload?.role_assignments],
    );
    const invitations = useMemo(() => payload?.invitations ?? [], [payload?.invitations]);
    const rosterLinks = useMemo(() => payload?.roster_links ?? [], [payload?.roster_links]);
    const personById = useMemo(
      () => new Map(people.map((person) => [person.id, person])),
      [people],
    );
    const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
    const childrenByParent = useMemo(() => makeChildrenByParent(units), [units]);
    const selectedUnit = selectedUnitId ? unitById.get(selectedUnitId) || null : null;
    const selectedPath = useMemo(
      () => makeUnitPath(selectedUnitId, unitById),
      [selectedUnitId, unitById],
    );
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
    const basePeople = useMemo(
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
      for (const link of rosterLinks)
        map.set(link.person_id, [...(map.get(link.person_id) || []), link]);
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
    const pendingIdentityClaimKeys = useMemo(() => {
      const keys = new Set<string>();
      for (const claim of identityClaims) {
        if (claim.status !== 'pending') continue;
        keys.add(`${claim.roster_kind}:${claim.roster_id}`);
      }
      return keys;
    }, [identityClaims]);
    const identityClaimTargets = useMemo<IdentityClaimTarget[]>(
      () =>
        rosterLinks.flatMap((link) => {
          const person = personById.get(link.person_id);
          if (!person) return [];
          const key = `${link.roster_kind}:${link.roster_id}`;
          const disabledReason = person.better_auth_user_id
            ? '已绑定账号'
            : pendingIdentityClaimKeys.has(key)
              ? canManage
                ? '已提交待审批'
                : '申请处理中'
              : undefined;
          return [
            {
              disabledReason,
              key,
              person,
              rosterId: link.roster_id,
              rosterKind: link.roster_kind,
              unitPath: unitPathLabel(person.primary_org_unit_id),
            },
          ];
        }),
      [canManage, pendingIdentityClaimKeys, personById, rosterLinks, unitPathLabel],
    );
    const identityClaimSearchKeyword = identityClaimSearchText.trim().toLowerCase();
    const searchedIdentityClaimTargets = useMemo(() => {
      if (!identityClaimSearchKeyword) return [];
      return identityClaimTargets.filter((target) =>
        target.person.display_name.toLowerCase().includes(identityClaimSearchKeyword),
      );
    }, [identityClaimSearchKeyword, identityClaimTargets]);
    const identityClaimTargetByRosterKey = useMemo(
      () => new Map(identityClaimTargets.map((target) => [target.key, target])),
      [identityClaimTargets],
    );
    const pendingIdentityClaims = useMemo(
      () => identityClaims.filter((claim) => claim.status === 'pending'),
      [identityClaims],
    );

    const roleBadgesForPerson = useCallback(
      (personId: number): DirectoryRoleBadgeModel[] => {
        const personRoles = rolesByPersonId.get(personId) || [];
        if (personRoles.length) {
          return personRoles.map((role) => ({
            key: `role-${role.id}`,
            label: roleLabels[role.role],
            path: unitPathLabel(role.org_unit_id),
            tone: roleTone(role.role),
          }));
        }
        return (linksByPersonId.get(personId) || []).map((link) => ({
          key: `roster-${link.id}`,
          label: link.roster_kind === 'teacher' ? '教师名册' : '学生名册',
          tone: 'roster',
        }));
      },
      [linksByPersonId, rolesByPersonId, unitPathLabel],
    );

    const filteredPeople = useMemo(
      () =>
        basePeople.filter((person) => {
          if (!matchesSearch(person, searchText)) return false;
          const badges = roleBadgesForPerson(person.id);
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          if (activeFilter === 'all') return true;
          if (
            activeFilter === 'registered' ||
            activeFilter === 'unregistered' ||
            activeFilter === 'invited'
          ) {
            return person.registration_status === activeFilter;
          }
          if (activeFilter === 'teacher') {
            return badges.some((badge) => badge.tone === 'teacher' || badge.label.includes('教师'));
          }
          if (activeFilter === 'student') {
            return badges.some((badge) => badge.tone === 'student' || badge.label.includes('学生'));
          }
          return pendingInvites > 0;
        }),
      [activeFilter, basePeople, pendingInvitationsByPersonId, roleBadgesForPerson, searchText],
    );

    const selectedPerson =
      filteredPeople.find((person) => person.id === selectedPersonId) || filteredPeople[0] || null;
    const selectedPersonLinks = selectedPerson ? linksByPersonId.get(selectedPerson.id) || [] : [];
    const selectedPersonPendingInvites = selectedPerson
      ? pendingInvitationsByPersonId.get(selectedPerson.id) || 0
      : 0;
    const selectedNodePendingInvites = invitations.filter((invite) => {
      if (invite.status !== 'pending') return false;
      if (!selectedUnitId) return invite.invitation_kind === 'open' || Boolean(invite.person_id);
      if (invite.primary_org_unit_id === selectedUnitId) return true;
      if (!invite.person_id) return false;
      return (
        people.find((person) => person.id === invite.person_id)?.primary_org_unit_id ===
        selectedUnitId
      );
    }).length;

    const directoryRows = useMemo<DirectoryPersonRowModel[]>(
      () =>
        filteredPeople.map((person) => {
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          return {
            accountLabel: person.better_auth_user_id ? '已绑定' : '未绑定',
            invitationLabel: pendingInvites ? `邀请中 ${pendingInvites}` : '未发送',
            pendingInvites,
            person,
            primaryPath: unitPathLabel(person.primary_org_unit_id),
            registrationLabel: registrationLabels[person.registration_status],
            roleBadges: roleBadgesForPerson(person.id),
            updatedLabel: personTimestamp(person),
          };
        }),
      [filteredPeople, pendingInvitationsByPersonId, roleBadgesForPerson, unitPathLabel],
    );

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
        (childrenByParent.get(parentId) || []).map((unit) => {
          const path = unitPathLabel(unit.id);
          const allowed = roleAllowedForUnit(role, unit);
          const typeLabel = unitTypeLabels[unit.unit_type];
          const disabledReason =
            role && !allowed ? `${roleLabels[role]}不能分配到${typeLabel}` : typeLabel;
          return {
            disabled: !allowed,
            key: unit.id,
            label: `${path} ${typeLabel}`,
            title: (
              <span className={styles.directoryScopeOption}>
                <span>{path}</span>
                <small>{disabledReason}</small>
              </span>
            ),
            value: unit.id,
            children: buildUnitTreeData(role, unit.id),
          };
        }),
      [childrenByParent, unitPathLabel],
    );

    const roleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedRole),
      [buildUnitTreeData, watchedRole],
    );
    const orgInviteTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgInviteRole),
      [buildUnitTreeData, watchedOrgInviteRole],
    );
    const plainTreeData = useMemo(() => buildUnitTreeData(), [buildUnitTreeData]);
    const personPrimaryUnitTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => [
        {
          disabled: false,
          key: ALL_PEOPLE_TREE_VALUE,
          label: '全部人员',
          title: '全部人员',
          value: ALL_PEOPLE_TREE_VALUE,
        },
        ...plainTreeData,
      ],
      [plainTreeData],
    );
    const selectedUnitRoleOptions = (
      selectedUnit ? roleOptionsByUnitType[selectedUnit.unit_type] : []
    ).map((role) => ({ label: roleLabels[role], value: role }));

    const createPerson = async (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
      const values = await form.validateFields();
      setSaving(true);
      try {
        await createAskCoreDirectoryPerson({
          display_name: values.display_name,
          email: values.email || undefined,
          primary_org_unit_id:
            scope === 'unit'
              ? selectedUnitId || undefined
              : values.primary_org_unit_id === ALL_PEOPLE_TREE_VALUE
                ? null
                : values.primary_org_unit_id || undefined,
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

    const openIdentityDrawer = () => {
      const nextMode: IdentityDrawerMode = canManage ? 'review' : 'claim';
      setIdentityDrawerMode(nextMode);
      if (nextMode === 'claim') setIdentityClaimSearchText('');
      setIdentityDrawerOpen(true);
      void loadIdentityClaims(nextMode);
    };

    const submitIdentityClaim = async (target: IdentityClaimTarget) => {
      setSubmittingIdentityClaimKey(target.key);
      try {
        await createAskCoreEducationIdentityClaim({
          roster_id: target.rosterId,
          roster_kind: target.rosterKind,
        });
        await loadIdentityClaims('claim');
        message.success('身份申请已提交');
      } finally {
        setSubmittingIdentityClaimKey(null);
      }
    };

    const reviewIdentityClaim = async (
      claim: AskCoreEducationIdentityClaim,
      action: 'approve' | 'reject',
    ) => {
      setReviewingIdentityClaimId(claim.id);
      try {
        if (action === 'approve') {
          await approveAskCoreEducationIdentityClaim(claim.id);
          message.success('身份申请已通过');
        } else {
          await rejectAskCoreEducationIdentityClaim(claim.id);
          message.success('身份申请已拒绝');
        }
        await Promise.all([loadIdentityClaims('review'), loadDirectory()]);
      } finally {
        setReviewingIdentityClaimId(null);
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
      const url = URL.createObjectURL(
        new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'askcore-directory.csv';
      link.click();
      URL.revokeObjectURL(url);
    };

    const createPersonContent = (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
      return (
        <div className={styles.directoryActionPanel}>
          <div className={styles.directoryActionPanelTitle}>
            {scope === 'unit' ? '添加到当前节点' : '新建人员'}
          </div>
          <Form className={styles.directoryActionForm} form={form} layout="vertical">
            <Form.Item
              label="姓名"
              name="display_name"
              rules={[{ message: '请输入姓名', required: true }]}
            >
              <Input placeholder="输入姓名" />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item label="主位置" name="primary_org_unit_id">
                <TreeSelect
                  allowClear
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择主位置"
                  treeData={personPrimaryUnitTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
            <Form.Item label="名册" name="roster_kind">
              <Select allowClear options={rosterKindOptions} placeholder="可选" />
            </Form.Item>
            <Button block loading={saving} type="primary" onClick={() => createPerson(scope)}>
              确认创建
            </Button>
          </Form>
        </div>
      );
    };

    const invitationContent = (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
      return (
        <div className={styles.directoryActionPanel}>
          <div className={styles.directoryActionPanelTitle}>
            {scope === 'unit' ? '当前节点邀请' : '不定向邀请'}
          </div>
          <Form className={styles.directoryActionForm} form={form} layout="vertical">
            <Form.Item label="预设角色" name="role">
              <Select
                allowClear
                options={scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions}
                placeholder="可选"
                onChange={() => {
                  if (scope === 'organization') orgInviteForm.resetFields(['primary_org_unit_id']);
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="邀请位置"
                name="primary_org_unit_id"
                rules={[{ message: '请选择邀请位置', required: true }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择位置"
                  treeData={orgInviteTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
            <Form.Item label="邮箱" name="email">
              <Input placeholder="可选，留空则生成通用链接" />
            </Form.Item>
            <Button
              block
              icon={<Send size={14} />}
              loading={saving}
              onClick={() => createOpenInvitation(scope)}
            >
              创建邀请
            </Button>
          </Form>
        </div>
      );
    };

    const importContent = (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgImportForm : unitImportForm;
      const roleOptions = scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions;
      return (
        <div className={styles.directoryActionPanel}>
          <div className={styles.directoryActionPanelTitle}>
            {scope === 'unit' ? '批量导入到当前节点' : '批量导入'}
          </div>
          <Form className={styles.directoryActionForm} form={form} layout="vertical">
            <Form.Item label="默认角色" name="default_role">
              <Select allowClear options={roleOptions} placeholder="可选" />
            </Form.Item>
            <Form.Item label="默认名册" name="roster_kind">
              <Select allowClear options={rosterKindOptions} placeholder="可选" />
            </Form.Item>
            <Button
              block
              icon={<Upload size={14} />}
              loading={saving}
              onClick={() =>
                (scope === 'unit' ? unitImportInputRef : orgImportInputRef).current?.click()
              }
            >
              选择 CSV
            </Button>
          </Form>
        </div>
      );
    };

    const showIdentityReview = canManage && identityDrawerMode === 'review';
    const identityDrawerModeSwitch = canManage ? (
      <div className={styles.directoryIdentityModeSwitch}>
        <Button
          block
          type={identityDrawerMode === 'claim' ? 'primary' : 'default'}
          onClick={() => switchIdentityDrawerMode('claim')}
        >
          提交申请
        </Button>
        <Button
          block
          type={identityDrawerMode === 'review' ? 'primary' : 'default'}
          onClick={() => switchIdentityDrawerMode('review')}
        >
          身份审批
        </Button>
      </div>
    ) : null;

    const identityDrawerContent = showIdentityReview ? (
      <div className={styles.directoryIdentityList}>
        {identityDrawerModeSwitch}
        <div className={styles.directoryIdentityIntro}>
          身份审批
          <span>待处理 {pendingIdentityClaims.length} 个</span>
        </div>
        {pendingIdentityClaims.length ? (
          pendingIdentityClaims.map((claim) => {
            const target = identityClaimTargetByRosterKey.get(
              `${claim.roster_kind}:${claim.roster_id}`,
            );
            return (
              <div className={styles.directoryIdentityItem} key={claim.id}>
                <div className={styles.directoryIdentityItemMain}>
                  <strong>{target?.person.display_name || `名册 #${claim.roster_id}`}</strong>
                  <span>
                    {rosterKindLabels[claim.roster_kind]}名册 ·{' '}
                    {target?.unitPath || `#${claim.roster_id}`}
                  </span>
                  <small>申请账号 {claim.better_auth_user_id}</small>
                </div>
                <Space>
                  <Button
                    loading={reviewingIdentityClaimId === claim.id}
                    onClick={() => reviewIdentityClaim(claim, 'reject')}
                  >
                    拒绝
                  </Button>
                  <Button
                    loading={reviewingIdentityClaimId === claim.id}
                    type="primary"
                    onClick={() => reviewIdentityClaim(claim, 'approve')}
                  >
                    通过
                  </Button>
                </Space>
              </div>
            );
          })
        ) : (
          <Empty description="暂无待审批身份申请" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    ) : (
      <div className={styles.directoryIdentityList}>
        {identityDrawerModeSwitch}
        <div className={styles.directoryIdentityIntro}>
          提交身份申请
          <span>
            {canManage
              ? '输入你的姓名，找到与你本人对应的教师或学生名册，提交后进入身份审批队列。'
              : '输入你的姓名，找到与你本人对应的教师或学生名册，提交申请后组织管理员会处理绑定。'}
          </span>
        </div>
        <Input
          allowClear
          placeholder="输入姓名搜索教师或学生名册"
          prefix={<Search size={14} />}
          value={identityClaimSearchText}
          onChange={(event) => setIdentityClaimSearchText(event.target.value)}
        />
        {!identityClaimSearchKeyword ? (
          <Empty
            description="请输入姓名搜索可申请的教师或学生名册"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : searchedIdentityClaimTargets.length ? (
          searchedIdentityClaimTargets.map((target) => (
            <div className={styles.directoryIdentityItem} key={target.key}>
              <div className={styles.directoryIdentityItemMain}>
                <strong>{target.person.display_name}</strong>
                <span>
                  {rosterKindLabels[target.rosterKind]}名册 · {target.unitPath}
                </span>
                {target.disabledReason ? <small>{target.disabledReason}</small> : null}
              </div>
              <Button
                disabled={Boolean(target.disabledReason)}
                loading={submittingIdentityClaimKey === target.key}
                type="primary"
                onClick={() => submitIdentityClaim(target)}
              >
                申请绑定
              </Button>
            </div>
          ))
        ) : (
          <Empty description="没有匹配的教师或学生名册" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    );

    return (
      <section aria-label="组织架构工作区" className={styles.directorySurface}>
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

        <div className={styles.directoryTopbar}>
          <div>
            <h2>组织架构</h2>
            <p>统一管理人员、部门、角色、账号与邀请</p>
          </div>
          <div className={styles.directoryTopbarActions}>
            <Button loading={identityClaimsLoading} onClick={openIdentityDrawer}>
              {canManage ? '身份审批' : '提交身份申请'}
            </Button>
            <Button icon={<RefreshCw size={14} />} loading={loading} onClick={loadDirectory}>
              刷新
            </Button>
            <Button icon={<Download size={14} />} onClick={exportDirectory}>
              导出
            </Button>
            {canManage ? (
              <>
                <Popover
                  content={importContent('organization')}
                  placement="bottomRight"
                  trigger="click"
                >
                  <Button icon={<Upload size={14} />}>批量导入</Button>
                </Popover>
                <Popover
                  content={createPersonContent('organization')}
                  placement="bottomRight"
                  trigger="click"
                >
                  <Button icon={<UserRoundPlus size={14} />} type="primary">
                    新建人员
                  </Button>
                </Popover>
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.directoryCommandBar}>
          <Input
            allowClear
            placeholder="搜索姓名 / 手机 / 邮箱"
            prefix={<Search size={14} />}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className={styles.directoryFilterGroup}>
            {directoryFilterOptions.map((option) => (
              <button
                aria-label={`筛选${option.label}`}
                aria-pressed={activeFilter === option.key}
                key={option.key}
                type="button"
                className={`${styles.directoryFilterChip} ${
                  activeFilter === option.key ? styles.directoryFilterChipActive : ''
                }`}
                onClick={() => setActiveFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {canManage ? (
            <Popover
              content={invitationContent('organization')}
              placement="bottomRight"
              trigger="click"
            >
              <Button icon={<Send size={14} />}>不定向邀请</Button>
            </Popover>
          ) : null}
        </div>

        {error ? <Alert showIcon title={error} type="error" /> : null}
        {loading && !payload ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : payload ? (
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
                  <div className={styles.directoryBreadcrumb}>{selectedPathLabel}</div>
                  <div className={styles.directoryPaneTitle}>
                    {selectedUnit ? selectedUnit.name : '全部人员'}
                  </div>
                  <div className={styles.directoryPaneMeta}>
                    <span>直属 {basePeople.length} 人</span>
                    <span>邀请中 {selectedNodePendingInvites} 个</span>
                    <span>当前显示 {directoryRows.length} 人</span>
                  </div>
                </div>
                {canManage && selectedUnit ? (
                  <div className={styles.directoryNodeActions}>
                    <Popover
                      content={createPersonContent('unit')}
                      placement="bottomRight"
                      trigger="click"
                    >
                      <Button icon={<Plus size={14} />}>添加到当前节点</Button>
                    </Popover>
                    <Popover
                      content={importContent('unit')}
                      placement="bottomRight"
                      trigger="click"
                    >
                      <Button icon={<Upload size={14} />}>批量导入到当前节点</Button>
                    </Popover>
                    <Popover
                      content={invitationContent('unit')}
                      placement="bottomRight"
                      trigger="click"
                    >
                      <Button icon={<Send size={14} />}>当前节点邀请</Button>
                    </Popover>
                  </div>
                ) : null}
              </div>

              <div className={styles.directoryPeopleTable}>
                <div className={styles.directoryPeopleHeader}>
                  <span>姓名</span>
                  <span>主位置</span>
                  <span>角色</span>
                  <span>账号</span>
                  <span>邀请</span>
                  <span>更新</span>
                </div>
                {directoryRows.length ? (
                  directoryRows.map((row) => (
                    <button
                      aria-current={selectedPerson?.id === row.person.id ? 'true' : undefined}
                      key={row.person.id}
                      type="button"
                      className={`${styles.directoryPersonRow} ${
                        selectedPerson?.id === row.person.id ? styles.directoryPersonRowActive : ''
                      }`}
                      onClick={() => setSelectedPersonId(row.person.id)}
                    >
                      <span className={styles.directoryPersonIdentity}>
                        <UserRound size={16} />
                        <span>
                          <strong>{row.person.display_name}</strong>
                          <small>{row.registrationLabel}</small>
                        </span>
                      </span>
                      <Tooltip title={row.primaryPath}>
                        <span className={styles.directoryCellText}>{row.primaryPath}</span>
                      </Tooltip>
                      <span className={styles.directoryRoleStack}>
                        {row.roleBadges.length ? (
                          row.roleBadges.map((badge) => (
                            <Tooltip key={badge.key} title={badge.path || badge.label}>
                              <Tag className={styles.directoryRoleTag} data-tone={badge.tone}>
                                {badge.label}
                              </Tag>
                            </Tooltip>
                          ))
                        ) : (
                          <Tag className={styles.directoryRoleTag}>暂无角色</Tag>
                        )}
                      </span>
                      <span className={styles.directoryCellText}>{row.accountLabel}</span>
                      <span className={styles.directoryCellText}>{row.invitationLabel}</span>
                      <span className={styles.directoryCellText}>{row.updatedLabel}</span>
                    </button>
                  ))
                ) : (
                  <Empty description="当前筛选下暂无人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </section>

            <section aria-label="人员详情" className={styles.directoryPane}>
              <div className={styles.directoryInspectorHeader}>
                <div className={styles.directoryPaneTitle}>人员详情</div>
                <span>{selectedPerson ? `#${selectedPerson.id}` : ''}</span>
              </div>
              {selectedPerson ? (
                <div className={styles.directoryDetail}>
                  <section className={styles.directoryDetailHero}>
                    <div className={styles.directoryPersonAvatar}>
                      {selectedPerson.display_name.slice(0, 1)}
                    </div>
                    <div>
                      <div className={styles.directoryPersonName}>
                        {selectedPerson.display_name}
                      </div>
                      <Space wrap size={[6, 6]}>
                        <Tag
                          className={styles.directoryStatusTag}
                          data-status={selectedPerson.registration_status}
                        >
                          {registrationLabels[selectedPerson.registration_status]}
                        </Tag>
                        <Tag className={styles.directoryRoleTag}>
                          {unitPathLabel(selectedPerson.primary_org_unit_id)}
                        </Tag>
                      </Space>
                    </div>
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>基本信息</div>
                    <div className={styles.directoryInfoGrid}>
                      <span>手机号</span>
                      <strong>{selectedPerson.phone || '--'}</strong>
                      <span>邮箱</span>
                      <strong>{selectedPerson.email || '--'}</strong>
                    </div>
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>角色</div>
                    <div className={styles.directoryInspectorTags}>
                      {roleBadgesForPerson(selectedPerson.id).length ? (
                        roleBadgesForPerson(selectedPerson.id).map((badge) => (
                          <Tag
                            className={styles.directoryRoleTag}
                            data-tone={badge.tone}
                            key={badge.key}
                          >
                            {badge.path ? `${badge.label} / ${badge.path}` : badge.label}
                          </Tag>
                        ))
                      ) : (
                        <Tag className={styles.directoryRoleTag}>暂无角色</Tag>
                      )}
                    </div>
                    {canManage ? (
                      <Form
                        className={styles.directoryInlineForm}
                        form={roleForm}
                        layout="vertical"
                      >
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
                            treeNodeFilterProp="label"
                          />
                        </Form.Item>
                        <Button block loading={saving} onClick={assignRole}>
                          分配角色
                        </Button>
                      </Form>
                    ) : null}
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>账号绑定</div>
                    <div className={styles.directoryMetaLine}>
                      {selectedPerson.better_auth_user_id || '未绑定 AskCore 账号'}
                    </div>
                    {canManage ? (
                      <Form
                        className={styles.directoryInlineForm}
                        form={accountForm}
                        layout="vertical"
                      >
                        <Form.Item
                          name="better_auth_user_id"
                          rules={[{ message: '请输入 Better Auth 用户 ID', required: true }]}
                        >
                          <Input placeholder="Better Auth 用户 ID" />
                        </Form.Item>
                        <Button
                          block
                          icon={<Link2 size={14} />}
                          loading={saving}
                          onClick={bindAccount}
                        >
                          绑定账号
                        </Button>
                      </Form>
                    ) : null}
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>定向邀请</div>
                    <div className={styles.directoryMetaLine}>
                      待处理邀请 {selectedPersonPendingInvites} 个
                    </div>
                    {canManage ? (
                      <Form
                        className={styles.directoryInlineForm}
                        form={directInviteForm}
                        layout="vertical"
                      >
                        <Form.Item name="email">
                          <Input placeholder="手机号或邮箱（默认使用人员邮箱）" />
                        </Form.Item>
                        <Button
                          block
                          icon={<Mail size={14} />}
                          loading={saving}
                          onClick={createDirectedInvitation}
                        >
                          发送给此人
                        </Button>
                      </Form>
                    ) : null}
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>兼容名册</div>
                    <div className={styles.directoryInspectorTags}>
                      {selectedPersonLinks.length ? (
                        selectedPersonLinks.map((link) => (
                          <Tag className={styles.directoryRoleTag} data-tone="roster" key={link.id}>
                            {link.roster_kind === 'teacher' ? '教师' : '学生'} #{link.roster_id}
                          </Tag>
                        ))
                      ) : (
                        <Tag className={styles.directoryRoleTag}>无名册链接</Tag>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <Empty description="请选择人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </section>
          </div>
        ) : (
          <Empty description="暂无组织架构数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        <Drawer
          destroyOnClose
          open={identityDrawerOpen}
          size="default"
          title={canManage ? '身份申请与审批' : '提交身份申请'}
          onClose={() => setIdentityDrawerOpen(false)}
        >
          {identityClaimsLoading && !identityClaims.length ? (
            <div className={styles.centerPane}>
              <Spin />
            </div>
          ) : (
            identityDrawerContent
          )}
        </Drawer>
      </section>
    );
  },
);

OrganizationDirectorySection.displayName = 'OrganizationDirectorySection';
