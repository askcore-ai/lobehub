'use client';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Segmented,
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
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
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
  createAskCoreDirectoryBackedInvite,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  createAskCoreEducationIdentityClaim,
  createAskCoreEducationOrgUnit,
  deleteAskCoreDirectoryPersonRole,
  deleteAskCoreEducationOrgUnit,
  fetchAskCoreEducationIdentityClaims,
  fetchAskCoreOrganizationDirectory,
  importAskCoreDirectoryPeople,
  rejectAskCoreEducationIdentityClaim,
  revokeAskCoreDirectoryInvitation,
  unbindAskCoreDirectoryPersonAccount,
  updateAskCoreDirectoryPerson,
  updateAskCoreEducationOrgUnit,
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
  type AskCoreOrganizationMember,
  type AskCoreOrganizationRole,
} from '../types';

type DirectoryFilterKey = 'all' | 'student' | 'teacher' | 'todo';
type DirectoryActionKind = 'create' | 'import' | 'invite';
type DirectoryRoleTone = 'admin' | 'roster' | 'student' | 'teacher';
type IdentityDrawerMode = 'claim' | 'review';
const ALL_PEOPLE_TREE_VALUE = 0;

interface DirectoryRoleBadgeModel {
  key: string;
  label: string;
  path?: string;
  roleAssignmentId?: number;
  tone: DirectoryRoleTone;
}

interface DirectoryPersonRowModel {
  accountLabel: string;
  educationStatusLabel: string;
  invitationLabel: string;
  organizationRoleLabel: string;
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

const unitTypeOptions = (
  Object.entries(unitTypeLabels) as [AskCoreEducationOrgUnitType, string][]
).map(([value, label]) => ({ label, value }));

const roleLabels: Record<AskCoreEducationRole, string> = {
  grade_admin: '届别管理者',
  homeroom_teacher: '班主任',
  school_admin: '学校管理者',
  student: '学生',
  teacher: '教师',
};

const organizationRoleLabels: Record<AskCoreOrganizationRole, string> = {
  admin: '组织管理员',
  member: '普通成员',
  owner: '组织所有者',
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

const defaultEducationRoleByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole> = {
  class: 'student',
  cohort: 'teacher',
  department: 'teacher',
  school: 'teacher',
};

const rosterKindOptions: { label: string; value: AskCoreDirectoryRosterKind }[] = [
  { label: '教师', value: 'teacher' },
  { label: '学生', value: 'student' },
];

const rosterKindLabels: Record<AskCoreDirectoryRosterKind, string> = {
  student: '学生',
  teacher: '教师',
};

const rosterKindForEducationRole = (role?: AskCoreEducationRole): AskCoreDirectoryRosterKind =>
  role === 'student' ? 'student' : 'teacher';

const directoryFilterOptions: { key: DirectoryFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待处理' },
  { key: 'teacher', label: '教师' },
  { key: 'student', label: '学生' },
];

const allRoleOptions = (Object.keys(roleLabels) as AskCoreEducationRole[]).map((role) => ({
  label: roleLabels[role],
  value: role,
}));

const invitationRoleOptions = (
  rosterKind: AskCoreDirectoryRosterKind | undefined,
  options: { label: string; value: AskCoreEducationRole }[],
) => {
  if (rosterKind === 'student') return options.filter((option) => option.value === 'student');
  if (rosterKind === 'teacher') return options.filter((option) => option.value !== 'student');
  return options;
};

const sortUnits = (units: AskCoreEducationOrgUnit[]) =>
  [...units].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

const roleAllowedForUnit = (
  role: AskCoreEducationRole | undefined,
  unit: AskCoreEducationOrgUnit,
) => !role || roleOptionsByUnitType[unit.unit_type].includes(role);

const parentAllowedForUnitType = (
  unitType: AskCoreEducationOrgUnitType | undefined,
  parentUnit: AskCoreEducationOrgUnit | undefined,
) => {
  if (!unitType || !parentUnit) return true;
  if (unitType === 'school') return false;
  if (unitType === 'cohort') return parentUnit.unit_type === 'school';
  if (unitType === 'class')
    return parentUnit.unit_type === 'school' || parentUnit.unit_type === 'cohort';
  return parentUnit.unit_type === 'school' || parentUnit.unit_type === 'department';
};

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
  members: AskCoreOrganizationMember[];
}

export const OrganizationDirectorySection = memo<OrganizationDirectorySectionProps>(
  ({ canManage, members }) => {
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
    const [includeDescendants, setIncludeDescendants] = useState(true);
    const [unitCreateOpen, setUnitCreateOpen] = useState(false);
    const [unitEditOpen, setUnitEditOpen] = useState(false);
    const [orgActionOpen, setOrgActionOpen] = useState(false);
    const [unitActionOpen, setUnitActionOpen] = useState(false);
    const [activeOrgAction, setActiveOrgAction] = useState<DirectoryActionKind>('create');
    const [activeUnitAction, setActiveUnitAction] = useState<DirectoryActionKind>('create');
    const orgImportInputRef = useRef<HTMLInputElement>(null);
    const unitImportInputRef = useRef<HTMLInputElement>(null);
    const consumedIdentityActionLocationKeyRef = useRef<string | null>(null);
    const [unitCreateForm] = Form.useForm();
    const [unitEditForm] = Form.useForm();
    const [orgPersonForm] = Form.useForm();
    const [unitPersonForm] = Form.useForm();
    const [orgInviteForm] = Form.useForm();
    const [unitInviteForm] = Form.useForm();
    const [orgImportForm] = Form.useForm();
    const [unitImportForm] = Form.useForm();
    const [accountForm] = Form.useForm();
    const [roleForm] = Form.useForm();
    const [directInviteForm] = Form.useForm();
    const watchedCreateUnitType = Form.useWatch('unit_type', unitCreateForm) as
      AskCoreEducationOrgUnitType | undefined;
    const watchedEditUnitType = Form.useWatch('unit_type', unitEditForm) as
      AskCoreEducationOrgUnitType | undefined;
    const watchedRole = Form.useWatch('role', roleForm) as AskCoreEducationRole | undefined;
    const watchedAccountRole = Form.useWatch('role', accountForm) as
      AskCoreEducationRole | undefined;
    const watchedDirectInviteRole = Form.useWatch('role', directInviteForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgImportRole = Form.useWatch('default_role', orgImportForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgPersonRole = Form.useWatch('education_role', orgPersonForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgInviteRole = Form.useWatch('role', orgInviteForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgInviteRosterKind = Form.useWatch('roster_kind', orgInviteForm) as
      AskCoreDirectoryRosterKind | undefined;
    const watchedUnitInviteRosterKind = Form.useWatch('roster_kind', unitInviteForm) as
      AskCoreDirectoryRosterKind | undefined;

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
    const memberByUserId = useMemo(
      () => new Map(members.map((member) => [member.userId, member])),
      [members],
    );
    const memberSummaryByUserId = useMemo(
      () => new Map(Object.entries(payload?.member_summaries ?? {})),
      [payload?.member_summaries],
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
    const descendantUnitIds = useMemo(() => {
      if (!selectedUnitId) return new Set<number>();
      const ids = new Set<number>([selectedUnitId]);
      const visit = (parentId: number) => {
        for (const child of childrenByParent.get(parentId) || []) {
          ids.add(child.id);
          visit(child.id);
        }
      };
      visit(selectedUnitId);
      return ids;
    }, [childrenByParent, selectedUnitId]);
    const directPeople = useMemo(
      () =>
        selectedUnitId
          ? people.filter((person) => person.primary_org_unit_id === selectedUnitId)
          : people,
      [people, selectedUnitId],
    );
    const basePeople = useMemo(
      () =>
        selectedUnitId
          ? people.filter((person) =>
              includeDescendants
                ? person.primary_org_unit_id !== null &&
                  person.primary_org_unit_id !== undefined &&
                  descendantUnitIds.has(person.primary_org_unit_id)
                : person.primary_org_unit_id === selectedUnitId,
            )
          : people,
      [descendantUnitIds, includeDescendants, people, selectedUnitId],
    );
    const descendantPeopleCount = useMemo(
      () =>
        selectedUnitId
          ? people.filter(
              (person) =>
                person.primary_org_unit_id !== null &&
                person.primary_org_unit_id !== undefined &&
                descendantUnitIds.has(person.primary_org_unit_id),
            ).length
          : people.length,
      [descendantUnitIds, people, selectedUnitId],
    );
    const peopleCountByUnitId = useMemo(() => {
      const map = new Map<number, number>();
      for (const person of people) {
        if (!person.primary_org_unit_id) continue;
        const unitPath = makeUnitPath(person.primary_org_unit_id, unitById);
        for (const unit of unitPath) map.set(unit.id, (map.get(unit.id) || 0) + 1);
      }
      return map;
    }, [people, unitById]);
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
        [
          target.person.display_name,
          target.person.email,
          target.person.phone,
          target.unitPath,
          target.rosterId,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(identityClaimSearchKeyword)),
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
            roleAssignmentId: role.id,
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
    const personNeedsEducationIdentity = useCallback(
      (person: AskCoreDirectoryPerson) =>
        person.registration_status === 'registered' &&
        Boolean(person.better_auth_user_id) &&
        (rolesByPersonId.get(person.id) || []).length === 0,
      [rolesByPersonId],
    );

    const filteredPeople = useMemo(
      () =>
        basePeople.filter((person) => {
          const badges = roleBadgesForPerson(person.id);
          const keyword = searchText.trim().toLowerCase();
          if (
            keyword &&
            !matchesSearch(person, searchText) &&
            !unitPathLabel(person.primary_org_unit_id).toLowerCase().includes(keyword) &&
            !badges.some((badge) =>
              [badge.label, badge.path]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(keyword)),
            )
          ) {
            return false;
          }
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          if (activeFilter === 'all') return true;
          if (activeFilter === 'todo')
            return (
              personNeedsEducationIdentity(person) ||
              pendingInvites > 0 ||
              person.registration_status === 'invited'
            );
          if (activeFilter === 'teacher') {
            return badges.some((badge) => badge.tone === 'teacher' || badge.label.includes('教师'));
          }
          if (activeFilter === 'student') {
            return badges.some((badge) => badge.tone === 'student' || badge.label.includes('学生'));
          }
          return pendingInvites > 0;
        }),
      [
        activeFilter,
        basePeople,
        pendingInvitationsByPersonId,
        personNeedsEducationIdentity,
        roleBadgesForPerson,
        searchText,
        unitPathLabel,
      ],
    );

    const selectedPerson =
      filteredPeople.find((person) => person.id === selectedPersonId) || filteredPeople[0] || null;
    const selectedPersonLinks = selectedPerson ? linksByPersonId.get(selectedPerson.id) || [] : [];
    const selectedPersonRoleAssignments = selectedPerson
      ? rolesByPersonId.get(selectedPerson.id) || []
      : [];
    const selectedPersonPendingInvitationItems = selectedPerson
      ? invitations.filter(
          (invite) => invite.status === 'pending' && invite.person_id === selectedPerson.id,
        )
      : [];
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
    const todoCounts = useMemo(() => {
      let identityRequired = 0;
      let invited = 0;
      const todoPersonIds = new Set<number>();
      for (const person of basePeople) {
        if (personNeedsEducationIdentity(person)) {
          identityRequired += 1;
          todoPersonIds.add(person.id);
        }
        if (
          person.registration_status === 'invited' ||
          (pendingInvitationsByPersonId.get(person.id) || 0) > 0
        ) {
          invited += 1;
          todoPersonIds.add(person.id);
        }
      }
      return {
        identityClaims: pendingIdentityClaims.length,
        identityRequired,
        invited,
        total: todoPersonIds.size + pendingIdentityClaims.length,
      };
    }, [
      basePeople,
      pendingIdentityClaims.length,
      pendingInvitationsByPersonId,
      personNeedsEducationIdentity,
    ]);

    const directoryRows = useMemo<DirectoryPersonRowModel[]>(
      () =>
        filteredPeople.map((person) => {
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          const member = person.better_auth_user_id
            ? memberByUserId.get(person.better_auth_user_id)
            : undefined;
          const memberSummary = person.better_auth_user_id
            ? memberSummaryByUserId.get(person.better_auth_user_id)
            : undefined;
          const needsIdentity = personNeedsEducationIdentity(person);
          return {
            accountLabel: person.better_auth_user_id ? '已绑定' : '未绑定',
            educationStatusLabel: needsIdentity ? '待补全教育身份' : '教育身份已配置',
            invitationLabel: pendingInvites ? `邀请中 ${pendingInvites}` : '未发送',
            organizationRoleLabel:
              memberSummary?.organization_role || member
                ? organizationRoleLabels[(memberSummary?.organization_role || member?.role)!]
                : '非注册成员',
            pendingInvites,
            person,
            primaryPath: unitPathLabel(person.primary_org_unit_id),
            registrationLabel: registrationLabels[person.registration_status],
            roleBadges: needsIdentity
              ? [
                  {
                    key: `identity-required-${person.id}`,
                    label: '待补全教育身份',
                    tone: 'roster',
                  },
                ]
              : roleBadgesForPerson(person.id),
            updatedLabel: personTimestamp(person),
          };
        }),
      [
        filteredPeople,
        memberByUserId,
        memberSummaryByUserId,
        pendingInvitationsByPersonId,
        personNeedsEducationIdentity,
        roleBadgesForPerson,
        unitPathLabel,
      ],
    );
    const selectedPersonRow = selectedPerson
      ? directoryRows.find((row) => row.person.id === selectedPerson.id)
      : undefined;

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

    const buildUnitParentTreeData = useCallback(
      (
        unitType?: AskCoreEducationOrgUnitType,
        excludedUnitId?: number,
        parentId: number | null = null,
        parentBlocked = false,
      ): DirectoryTreeSelectNode[] =>
        (childrenByParent.get(parentId) || []).map((unit) => {
          const path = unitPathLabel(unit.id);
          const typeLabel = unitTypeLabels[unit.unit_type];
          const blocked = parentBlocked || unit.id === excludedUnitId;
          return {
            disabled: blocked || !parentAllowedForUnitType(unitType, unit),
            key: unit.id,
            label: `${path} / ${typeLabel}`,
            title: `${path} / ${typeLabel}`,
            value: unit.id,
            children: buildUnitParentTreeData(unitType, excludedUnitId, unit.id, blocked),
          };
        }),
      [childrenByParent, unitPathLabel],
    );

    const roleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedRole),
      [buildUnitTreeData, watchedRole],
    );
    const accountRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedAccountRole),
      [buildUnitTreeData, watchedAccountRole],
    );
    const directInviteRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedDirectInviteRole),
      [buildUnitTreeData, watchedDirectInviteRole],
    );
    const orgImportRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgImportRole),
      [buildUnitTreeData, watchedOrgImportRole],
    );
    const orgPersonRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgPersonRole),
      [buildUnitTreeData, watchedOrgPersonRole],
    );
    const orgInviteTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgInviteRole),
      [buildUnitTreeData, watchedOrgInviteRole],
    );
    const plainTreeData = useMemo(() => buildUnitTreeData(), [buildUnitTreeData]);
    const createUnitParentTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => [
        {
          disabled: false,
          key: ALL_PEOPLE_TREE_VALUE,
          label: '全部人员',
          title: '全部人员',
          value: ALL_PEOPLE_TREE_VALUE,
        },
        ...buildUnitParentTreeData(watchedCreateUnitType),
      ],
      [buildUnitParentTreeData, watchedCreateUnitType],
    );
    const editUnitParentTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => [
        {
          disabled: false,
          key: ALL_PEOPLE_TREE_VALUE,
          label: '全部人员',
          title: '全部人员',
          value: ALL_PEOPLE_TREE_VALUE,
        },
        ...buildUnitParentTreeData(watchedEditUnitType, selectedUnit?.id),
      ],
      [buildUnitParentTreeData, selectedUnit?.id, watchedEditUnitType],
    );
    const orgInvitePositionTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => orgInviteTreeData,
      [orgInviteTreeData],
    );
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
    const selectedUnitDefaultRole = selectedUnit
      ? defaultEducationRoleByUnitType[selectedUnit.unit_type]
      : undefined;
    const selectedUnitPresetLabel =
      selectedUnit && selectedUnitDefaultRole
        ? `${roleLabels[selectedUnitDefaultRole]} · ${selectedUnit.name}`
        : undefined;

    const applyActionDefaults = (scope: 'organization' | 'unit', action: DirectoryActionKind) => {
      const isUnitScope = scope === 'unit' && selectedUnit && selectedUnitDefaultRole;
      if (action === 'create') {
        const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
        form.resetFields();
        if (isUnitScope) {
          form.setFieldsValue({
            education_role: selectedUnitDefaultRole,
            roster_kind: rosterKindForEducationRole(selectedUnitDefaultRole),
          });
        }
        return;
      }
      if (action === 'invite') {
        const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
        form.resetFields();
        if (isUnitScope) {
          form.setFieldsValue({
            role: selectedUnitDefaultRole,
            roster_kind: rosterKindForEducationRole(selectedUnitDefaultRole),
          });
        }
        return;
      }
      const form = scope === 'organization' ? orgImportForm : unitImportForm;
      form.resetFields();
      if (isUnitScope) {
        form.setFieldsValue({
          default_role: selectedUnitDefaultRole,
          roster_kind: rosterKindForEducationRole(selectedUnitDefaultRole),
        });
      }
    };

    const selectAction = (scope: 'organization' | 'unit', action: DirectoryActionKind) => {
      if (scope === 'organization') setActiveOrgAction(action);
      else setActiveUnitAction(action);
      applyActionDefaults(scope, action);
    };

    const openActionPopover = (scope: 'organization' | 'unit', open: boolean) => {
      if (scope === 'organization') setOrgActionOpen(open);
      else setUnitActionOpen(open);
      if (open)
        applyActionDefaults(scope, scope === 'organization' ? activeOrgAction : activeUnitAction);
    };

    const copyInviteLink = (link: string) => {
      void navigator.clipboard?.writeText(link).catch(() => undefined);
    };

    const validateEducationScope = (
      role: AskCoreEducationRole | undefined,
      unitId: number | null | undefined,
    ) => {
      if (!role) {
        message.error('请选择教育身份');
        return null;
      }
      if (!unitId) {
        message.error('教育身份必须选择作用范围');
        return null;
      }
      const targetUnit = unitById.get(unitId);
      if (!targetUnit) {
        message.error('请选择有效的作用范围');
        return null;
      }
      if (!roleAllowedForUnit(role, targetUnit)) {
        message.error(`${roleLabels[role]}不能分配到${unitTypeLabels[targetUnit.unit_type]}`);
        return null;
      }
      return targetUnit;
    };

    const createUnit = async () => {
      const values = await unitCreateForm.validateFields();
      const createdParentId =
        values.parent_id === ALL_PEOPLE_TREE_VALUE
          ? null
          : values.parent_id
            ? Number(values.parent_id)
            : undefined;
      setSaving(true);
      try {
        const created = await createAskCoreEducationOrgUnit({
          description: values.description || undefined,
          entry_year: values.unit_type === 'cohort' ? values.entry_year || undefined : undefined,
          name: values.name,
          parent_id: createdParentId,
          sort_order: values.sort_order ?? 0,
          unit_type: values.unit_type,
        });
        setUnitCreateOpen(false);
        unitCreateForm.resetFields();
        setSelectedUnitId(created.id);
        await loadDirectory();
        message.success('组织节点已创建');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '组织节点创建失败');
      } finally {
        setSaving(false);
      }
    };

    const updateUnit = async () => {
      if (!selectedUnit) return;
      const values = await unitEditForm.validateFields();
      const nextParentId =
        values.parent_id === ALL_PEOPLE_TREE_VALUE
          ? null
          : values.parent_id
            ? Number(values.parent_id)
            : undefined;
      setSaving(true);
      try {
        const updated = await updateAskCoreEducationOrgUnit(selectedUnit.id, {
          description: values.description || undefined,
          entry_year: values.unit_type === 'cohort' ? values.entry_year || undefined : undefined,
          name: values.name,
          parent_id: nextParentId,
          sort_order: values.sort_order ?? 0,
          unit_type: values.unit_type,
        });
        setUnitEditOpen(false);
        setSelectedUnitId(updated.id);
        await loadDirectory();
        message.success('组织节点已更新');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '组织节点更新失败');
      } finally {
        setSaving(false);
      }
    };

    const deleteUnit = async () => {
      if (!selectedUnit) return;
      setSaving(true);
      try {
        await deleteAskCoreEducationOrgUnit(selectedUnit.id);
        setSelectedUnitId(null);
        await loadDirectory();
        message.success('组织节点已删除');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '组织节点删除失败');
      } finally {
        setSaving(false);
      }
    };

    const createPerson = async (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
      const values = await form.validateFields();
      const educationRole = values.education_role as AskCoreEducationRole | undefined;
      const roleScopeId =
        scope === 'unit'
          ? selectedUnitId
          : values.education_org_unit_id
            ? Number(values.education_org_unit_id)
            : null;
      if (!validateEducationScope(educationRole, roleScopeId)) return;
      setSaving(true);
      try {
        await createAskCoreDirectoryPerson({
          display_name: values.display_name,
          email: values.email || undefined,
          education_org_unit_id: roleScopeId!,
          education_role: educationRole!,
          primary_org_unit_id:
            scope === 'unit'
              ? selectedUnitId || undefined
              : values.primary_org_unit_id === ALL_PEOPLE_TREE_VALUE
                ? null
                : values.primary_org_unit_id || undefined,
          roster_kind: values.roster_kind || (educationRole === 'student' ? 'student' : 'teacher'),
        });
        form.resetFields();
        await loadDirectory();
        message.success('人员已创建');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '人员创建失败');
      } finally {
        setSaving(false);
      }
    };

    const createOpenInvitation = async (scope: 'organization' | 'unit') => {
      if (!payload) return;
      const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
      const values = await form.validateFields();
      const rosterKind = values.roster_kind as AskCoreDirectoryRosterKind | undefined;
      if (!rosterKind) {
        message.error('请选择教师或学生名册');
        return;
      }
      const rawPrimaryOrgUnitId = scope === 'unit' ? selectedUnitId : values.primary_org_unit_id;
      const primaryOrgUnitId =
        rawPrimaryOrgUnitId === ALL_PEOPLE_TREE_VALUE
          ? null
          : rawPrimaryOrgUnitId
            ? Number(rawPrimaryOrgUnitId)
            : null;
      const targetUnit = primaryOrgUnitId ? unitById.get(primaryOrgUnitId) : undefined;
      if (rosterKind === 'student' && targetUnit?.unit_type !== 'class') {
        message.error('学生邀请必须选择班级');
        return;
      }
      const presetRole = (values.role as AskCoreEducationRole | undefined) || rosterKind;
      if (!validateEducationScope(presetRole, primaryOrgUnitId)) return;
      setSaving(true);
      try {
        const invite = await createAskCoreDirectoryBackedInvite(payload.org_id, {
          channel: values.email ? 'email' : 'link',
          email: values.email || undefined,
          expiresIn: '7d',
          invitation_kind: 'open',
          member_role: 'member',
          preset_roles: [presetRole],
          primary_org_unit_id: primaryOrgUnitId,
          roster_kind: rosterKind,
        });
        copyInviteLink(invite.link);
        form.resetFields();
        await loadDirectory();
        message.success(
          scope === 'unit' ? '当前节点邀请链接已创建并复制' : '不定向邀请已创建并复制',
        );
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '邀请创建失败');
      } finally {
        setSaving(false);
      }
    };

    const handleCsvImport = async (scope: 'organization' | 'unit', file: File) => {
      const form = scope === 'organization' ? orgImportForm : unitImportForm;
      const values = await form.validateFields();
      const defaultRole = values.default_role as AskCoreEducationRole | undefined;
      const roleScopeId =
        scope === 'unit'
          ? selectedUnitId
          : values.primary_org_unit_id
            ? Number(values.primary_org_unit_id)
            : null;
      if (!validateEducationScope(defaultRole, roleScopeId)) return;
      setSaving(true);
      try {
        const objectKey = await uploadAskCoreCsv(file);
        const result = await importAskCoreDirectoryPeople({
          csv_ref: {
            locator: { kind: 'object_store', object_key: objectKey },
            media_type: 'text/csv',
            purpose: 'csv',
          },
          default_role: defaultRole,
          primary_org_unit_id: roleScopeId!,
          roster_kind: values.roster_kind || (defaultRole === 'student' ? 'student' : 'teacher'),
          scope,
        });
        await loadDirectory();
        const errorText = result.errors.length ? `，${result.errors.length} 行失败` : '';
        message.success(`批量导入完成：新增 ${result.created_count} 人${errorText}`);
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '批量导入失败');
      } finally {
        setSaving(false);
      }
    };

    const bindAccount = async () => {
      if (!selectedPerson) return;
      const values = await accountForm.validateFields();
      const educationRole = values.role as AskCoreEducationRole | undefined;
      const roleScopeId = values.org_unit_id ? Number(values.org_unit_id) : null;
      if (!validateEducationScope(educationRole, roleScopeId)) return;
      setSaving(true);
      try {
        await bindAskCoreDirectoryPersonAccount(selectedPerson.id, {
          better_auth_user_id: values.better_auth_user_id,
          education_org_unit_id: roleScopeId!,
          education_role: educationRole!,
        });
        accountForm.resetFields();
        await loadDirectory();
        message.success('账号已绑定');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '账号绑定失败');
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
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '角色分配失败');
      } finally {
        setSaving(false);
      }
    };

    const createDirectedInvitation = async () => {
      if (!payload || !selectedPerson) return;
      const rosterLink =
        selectedPersonLinks.find((link) => link.roster_kind === 'teacher') ||
        selectedPersonLinks[0];
      if (!rosterLink) {
        message.error('此人员还没有教师或学生名册链接，不能发送定向邀请');
        return;
      }
      const values = await directInviteForm.validateFields();
      const email = values.email || selectedPerson.email || undefined;
      const presetRole: AskCoreEducationRole =
        rosterLink.roster_kind === 'student'
          ? 'student'
          : (values.role as AskCoreEducationRole | undefined) || 'teacher';
      const roleScopeId =
        values.org_unit_id !== undefined && values.org_unit_id !== null
          ? Number(values.org_unit_id)
          : selectedPerson.primary_org_unit_id;
      if (!validateEducationScope(presetRole, roleScopeId)) return;
      setSaving(true);
      try {
        const invite = await createAskCoreDirectoryBackedInvite(payload.org_id, {
          channel: email ? 'email' : 'link',
          email,
          invitation_kind: 'directed',
          member_role: 'member',
          person_id: selectedPerson.id,
          expiresIn: '7d',
          preset_roles: [presetRole],
          primary_org_unit_id: roleScopeId!,
          roster_kind: rosterLink.roster_kind,
        });
        copyInviteLink(invite.link);
        directInviteForm.resetFields();
        await loadDirectory();
        message.success('定向邀请已创建并复制');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '定向邀请创建失败');
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
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '身份申请提交失败');
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
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '身份申请处理失败');
      } finally {
        setReviewingIdentityClaimId(null);
      }
    };

    const removeRole = async (roleAssignmentId: number) => {
      if (!selectedPerson) return;
      setSaving(true);
      try {
        await deleteAskCoreDirectoryPersonRole(selectedPerson.id, roleAssignmentId);
        await loadDirectory();
        message.success('教育角色已删除');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '教育角色删除失败');
      } finally {
        setSaving(false);
      }
    };

    const unbindAccount = async () => {
      if (!selectedPerson) return;
      setSaving(true);
      try {
        await unbindAskCoreDirectoryPersonAccount(selectedPerson.id);
        await loadDirectory();
        message.success('账号已解绑');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '账号解绑失败');
      } finally {
        setSaving(false);
      }
    };

    const moveSelectedPersonToAllPeople = async () => {
      if (!selectedPerson) return;
      setSaving(true);
      try {
        await updateAskCoreDirectoryPerson(selectedPerson.id, { primary_org_unit_id: null });
        await loadDirectory();
        message.success('主位置已移回全部人员');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '主位置更新失败');
      } finally {
        setSaving(false);
      }
    };

    const archiveSelectedPerson = async () => {
      if (!selectedPerson) return;
      setSaving(true);
      try {
        await updateAskCoreDirectoryPerson(selectedPerson.id, { archived: true });
        await loadDirectory();
        message.success('人员已归档');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '人员归档失败');
      } finally {
        setSaving(false);
      }
    };

    const revokeInvitation = async (token: string) => {
      setSaving(true);
      try {
        await revokeAskCoreDirectoryInvitation(token);
        await loadDirectory();
        message.success('邀请已撤销');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '邀请撤销失败');
      } finally {
        setSaving(false);
      }
    };

    const exportDirectory = () => {
      if (!payload) return;
      const header = ['姓名', '注册状态', '组织身份', '教育身份', '主位置'];
      const rows = people.map((person) => [
        person.display_name,
        registrationLabels[person.registration_status],
        (() => {
          if (!person.better_auth_user_id) return '非注册成员';
          const summaryRole = memberSummaryByUserId.get(
            person.better_auth_user_id,
          )?.organization_role;
          const memberRole = memberByUserId.get(person.better_auth_user_id)?.role;
          return summaryRole || memberRole
            ? organizationRoleLabels[(summaryRole || memberRole)!]
            : '非注册成员';
        })(),
        (rolesByPersonId.get(person.id) || [])
          .map((role) => `${roleLabels[role.role]}@${unitPathLabel(role.org_unit_id)}`)
          .join(';'),
        unitPathLabel(person.primary_org_unit_id),
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

    const openUnitCreatePanel = (open: boolean) => {
      setUnitCreateOpen(open);
      if (!open) return;
      unitCreateForm.resetFields();
      unitCreateForm.setFieldsValue({
        parent_id: selectedUnitId ?? undefined,
        sort_order: 0,
      });
    };

    const openUnitEditPanel = (open: boolean) => {
      setUnitEditOpen(open);
      if (!open || !selectedUnit) return;
      unitEditForm.setFieldsValue({
        description: selectedUnit.description || undefined,
        entry_year: selectedUnit.entry_year || undefined,
        name: selectedUnit.name,
        parent_id: selectedUnit.parent_id ?? ALL_PEOPLE_TREE_VALUE,
        sort_order: selectedUnit.sort_order ?? 0,
        unit_type: selectedUnit.unit_type,
      });
    };

    const unitFormContent = (mode: 'create' | 'edit') => {
      const form = mode === 'create' ? unitCreateForm : unitEditForm;
      const watchedType = mode === 'create' ? watchedCreateUnitType : watchedEditUnitType;
      const parentTreeData = mode === 'create' ? createUnitParentTreeData : editUnitParentTreeData;
      return (
        <div className={styles.directoryActionPanel}>
          <div className={styles.directoryActionPanelTitle}>
            {mode === 'create' ? '新建组织节点' : '编辑组织节点'}
          </div>
          <Form className={styles.directoryActionForm} form={form} layout="vertical">
            <Form.Item
              label="名称"
              name="name"
              rules={[{ message: '请输入节点名称', required: true }]}
            >
              <Input placeholder="输入节点名称" />
            </Form.Item>
            <Form.Item
              label="节点类型"
              name="unit_type"
              rules={[{ message: '请选择节点类型', required: true }]}
            >
              <Select
                options={unitTypeOptions}
                placeholder="选择节点类型"
                onChange={() => form.resetFields(['entry_year', 'parent_id'])}
              />
            </Form.Item>
            <Form.Item label="上级节点" name="parent_id">
              <TreeSelect
                allowClear
                showSearch
                treeDefaultExpandAll
                placeholder="选择上级节点"
                treeData={parentTreeData}
                treeNodeFilterProp="label"
              />
            </Form.Item>
            {watchedType === 'cohort' ? (
              <Form.Item label="入学年份" name="entry_year">
                <InputNumber min={1900} placeholder="例如 2026" style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
            <Form.Item label="说明" name="description">
              <Input placeholder="节点说明" />
            </Form.Item>
            <Form.Item label="排序" name="sort_order">
              <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
            </Form.Item>
            <Button
              block
              loading={saving}
              type="primary"
              onClick={() => (mode === 'create' ? createUnit() : updateUnit())}
            >
              {mode === 'create' ? '确认新建' : '保存节点'}
            </Button>
          </Form>
        </div>
      );
    };

    const createPersonContent = (scope: 'organization' | 'unit') => {
      const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
      return (
        <div className={styles.directoryActionPanel}>
          <div className={styles.directoryActionPanelTitle}>
            {scope === 'unit' ? '新建当前范围人员' : '新建人员'}
          </div>
          {scope === 'unit' && selectedUnitPresetLabel ? (
            <div className={styles.directoryPresetSummary}>{selectedUnitPresetLabel}</div>
          ) : null}
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
            <Form.Item
              label="教育身份"
              name="education_role"
              rules={[{ message: '请选择教育身份', required: true }]}
            >
              <Select
                options={scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions}
                placeholder="选择教育身份"
                onChange={() => {
                  if (scope === 'organization')
                    orgPersonForm.resetFields(['education_org_unit_id']);
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="教育身份作用范围"
                name="education_org_unit_id"
                rules={[{ message: '请选择教育身份作用范围', required: true }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择作用范围"
                  treeData={orgPersonRoleScopedTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
            <Form.Item label="名册" name="roster_kind">
              <Select allowClear options={rosterKindOptions} placeholder="默认按教育身份推断" />
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
            <Form.Item
              label="名册类型"
              name="roster_kind"
              rules={[{ message: '请选择教师或学生名册', required: true }]}
            >
              <Select
                options={rosterKindOptions}
                placeholder="选择教师或学生"
                onChange={() => form.resetFields(['role', 'primary_org_unit_id'])}
              />
            </Form.Item>
            <Form.Item
              label="教育身份"
              name="role"
              rules={[{ message: '请选择教育身份', required: true }]}
            >
              <Select
                placeholder="选择教育身份"
                options={invitationRoleOptions(
                  scope === 'unit' ? watchedUnitInviteRosterKind : watchedOrgInviteRosterKind,
                  scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions,
                )}
                onChange={() => {
                  if (scope === 'organization') orgInviteForm.resetFields(['primary_org_unit_id']);
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="邀请位置"
                name="primary_org_unit_id"
                rules={[
                  {
                    message: '请选择教育身份作用范围',
                    required: true,
                  },
                ]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择教育身份作用范围"
                  treeData={orgInvitePositionTreeData}
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
            <Form.Item
              label="默认教育身份"
              name="default_role"
              rules={[{ message: '请选择默认教育身份', required: true }]}
            >
              <Select
                options={roleOptions}
                placeholder="选择默认教育身份"
                onChange={() => {
                  if (scope === 'organization') orgImportForm.resetFields(['primary_org_unit_id']);
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="默认作用范围"
                name="primary_org_unit_id"
                rules={[{ message: '请选择默认作用范围', required: true }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择默认作用范围"
                  treeData={orgImportRoleScopedTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
            <Form.Item
              label="默认名册"
              name="roster_kind"
              rules={[{ message: '请选择默认名册', required: true }]}
            >
              <Select options={rosterKindOptions} placeholder="选择教师或学生名册" />
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

    const actionHubContent = (scope: 'organization' | 'unit') => {
      const activeAction = scope === 'organization' ? activeOrgAction : activeUnitAction;
      return (
        <div className={styles.directoryActionHub}>
          <div className={styles.directoryActionMenu}>
            <Button
              block
              type={activeAction === 'create' ? 'primary' : 'default'}
              onClick={() => selectAction(scope, 'create')}
            >
              新建人员
            </Button>
            <Button
              block
              type={activeAction === 'invite' ? 'primary' : 'default'}
              onClick={() => selectAction(scope, 'invite')}
            >
              邀请加入
            </Button>
            <Button
              block
              type={activeAction === 'import' ? 'primary' : 'default'}
              onClick={() => selectAction(scope, 'import')}
            >
              批量导入名单
            </Button>
          </div>
          {activeAction === 'create'
            ? createPersonContent(scope)
            : activeAction === 'invite'
              ? invitationContent(scope)
              : importContent(scope)}
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
              <Popover
                content={actionHubContent('organization')}
                open={orgActionOpen}
                placement="bottomRight"
                trigger="click"
                onOpenChange={(open) => openActionPopover('organization', open)}
              >
                <Button icon={<UserRoundPlus size={14} />} type="primary">
                  添加人员
                </Button>
              </Popover>
            ) : null}
          </div>
        </div>

        <div className={styles.directoryCommandBar}>
          <Input
            allowClear
            placeholder="搜索姓名 / 手机 / 邮箱 / 班级路径 / 工号学号"
            prefix={<Search size={14} />}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className={styles.directoryFilterGroup}>
            {directoryFilterOptions.map((option) => (
              <button
                aria-label={option.key === 'todo' ? option.label : `筛选${option.label}`}
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
        </div>

        <div className={styles.directoryTodoStrip}>
          <button
            aria-pressed={activeFilter === 'todo'}
            type="button"
            onClick={() => setActiveFilter('todo')}
          >
            待处理 {todoCounts.total}
          </button>
          <button type="button" onClick={() => setActiveFilter('todo')}>
            待补全身份 {todoCounts.identityRequired}
          </button>
          <button type="button" onClick={() => setActiveFilter('todo')}>
            邀请中 {todoCounts.invited}
          </button>
          <button type="button" onClick={openIdentityDrawer}>
            身份待审 {todoCounts.identityClaims}
          </button>
        </div>

        {error ? (
          <Alert
            showIcon
            title={error}
            type="error"
            action={
              <Button loading={loading} size="small" onClick={loadDirectory}>
                重试
              </Button>
            }
          />
        ) : null}
        {loading && !payload ? (
          <div className={styles.centerPane}>
            <Spin />
          </div>
        ) : payload ? (
          <div className={styles.directoryWorkspace}>
            <section aria-label="组织树" className={styles.directoryPane}>
              <div className={styles.directoryTreeHeader}>
                <div className={styles.directoryTreeHeaderTitle}>组织树</div>
                {canManage ? (
                  <div className={styles.directoryNodeActions}>
                    <Popover
                      content={unitFormContent('create')}
                      open={unitCreateOpen}
                      placement="bottomLeft"
                      trigger="click"
                      onOpenChange={openUnitCreatePanel}
                    >
                      <Button icon={<Plus size={14} />} size="small">
                        新建节点
                      </Button>
                    </Popover>
                    {selectedUnit ? (
                      <>
                        <Popover
                          content={unitFormContent('edit')}
                          open={unitEditOpen}
                          placement="bottomLeft"
                          trigger="click"
                          onOpenChange={openUnitEditPanel}
                        >
                          <Button icon={<Pencil size={14} />} size="small">
                            编辑节点
                          </Button>
                        </Popover>
                        <Popconfirm
                          okButtonProps={{ danger: true, loading: saving }}
                          okText="删除"
                          title="确认删除这个空节点？"
                          onConfirm={() => void deleteUnit()}
                        >
                          <Button danger icon={<Trash2 size={14} />} size="small">
                            删除节点
                          </Button>
                        </Popconfirm>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
                    <span>直属 {directPeople.length} 人</span>
                    <span>含下级 {descendantPeopleCount} 人</span>
                    <span>邀请中 {selectedNodePendingInvites} 个</span>
                    <span>当前显示 {directoryRows.length} 人</span>
                  </div>
                </div>
                <div className={styles.directoryNodeActions}>
                  {selectedUnit ? (
                    <Segmented
                      size="small"
                      value={includeDescendants ? 'descendants' : 'direct'}
                      options={[
                        { label: '含下级', value: 'descendants' },
                        { label: '直属', value: 'direct' },
                      ]}
                      onChange={(value) => setIncludeDescendants(value === 'descendants')}
                    />
                  ) : null}
                  {canManage && selectedUnit ? (
                    <Popover
                      content={actionHubContent('unit')}
                      open={unitActionOpen}
                      placement="bottomRight"
                      trigger="click"
                      onOpenChange={(open) => openActionPopover('unit', open)}
                    >
                      <Button icon={<Plus size={14} />}>添加到当前范围</Button>
                    </Popover>
                  ) : null}
                </div>
              </div>

              <div className={styles.directoryPeopleTable}>
                <div className={styles.directoryPeopleHeader}>
                  <span>姓名</span>
                  <span>主位置</span>
                  <span>教育身份</span>
                  <span>组织身份</span>
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
                      <span className={styles.directoryCellText}>
                        {row.organizationRoleLabel}
                        <small>{row.accountLabel}</small>
                      </span>
                      <span className={styles.directoryCellText}>{row.invitationLabel}</span>
                      <span className={styles.directoryCellText}>{row.updatedLabel}</span>
                    </button>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      searchText
                        ? '没有找到匹配人员'
                        : activeFilter === 'all'
                          ? '当前范围暂无人员'
                          : '当前筛选下暂无人员'
                    }
                  >
                    <Space wrap>
                      {searchText || activeFilter !== 'all' ? (
                        <Button
                          onClick={() => {
                            setSearchText('');
                            setActiveFilter('all');
                          }}
                        >
                          清除筛选
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Popover
                          content={actionHubContent(selectedUnit ? 'unit' : 'organization')}
                          open={selectedUnit ? unitActionOpen : orgActionOpen}
                          placement="bottomRight"
                          trigger="click"
                          onOpenChange={(open) =>
                            openActionPopover(selectedUnit ? 'unit' : 'organization', open)
                          }
                        >
                          <Button icon={<UserRoundPlus size={14} />} type="primary">
                            {selectedUnit ? '在当前范围添加人员' : '添加人员'}
                          </Button>
                        </Popover>
                      ) : null}
                    </Space>
                  </Empty>
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
                        <Tag className={styles.directoryRoleTag}>
                          {selectedPersonRow?.organizationRoleLabel || '非注册成员'}
                        </Tag>
                        <Tag
                          className={styles.directoryRoleTag}
                          data-tone={
                            selectedPersonRow?.educationStatusLabel === '待补全教育身份'
                              ? 'roster'
                              : 'admin'
                          }
                        >
                          {selectedPersonRow?.educationStatusLabel || '教育身份未配置'}
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
                      <span>主位置</span>
                      <strong>{unitPathLabel(selectedPerson.primary_org_unit_id)}</strong>
                      <span>组织身份</span>
                      <strong>{selectedPersonRow?.organizationRoleLabel || '非注册成员'}</strong>
                    </div>
                    {canManage ? (
                      <Space wrap size={[8, 8]} style={{ marginTop: 10 }}>
                        <Button
                          disabled={!selectedPerson.primary_org_unit_id}
                          size="small"
                          onClick={moveSelectedPersonToAllPeople}
                        >
                          移回全部人员
                        </Button>
                        <Popconfirm
                          okButtonProps={{ danger: true, loading: saving }}
                          okText="归档"
                          title="确认归档此人员？已绑定账号或仍有教育角色时后端会拒绝，需要先解绑或删除角色。"
                          onConfirm={() => void archiveSelectedPerson()}
                        >
                          <Button danger size="small">
                            归档人员
                          </Button>
                        </Popconfirm>
                      </Space>
                    ) : null}
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>
                      教育角色 {selectedPersonRoleAssignments.length}
                    </div>
                    <div className={styles.directoryInspectorTags}>
                      {selectedPersonRow?.roleBadges.length ? (
                        selectedPersonRow.roleBadges.map((badge) => (
                          <Space key={badge.key} size={4}>
                            <Tag className={styles.directoryRoleTag} data-tone={badge.tone}>
                              {badge.path ? `${badge.label} / ${badge.path}` : badge.label}
                            </Tag>
                            {canManage && badge.roleAssignmentId ? (
                              <Popconfirm
                                okButtonProps={{ danger: true, loading: saving }}
                                okText="删除"
                                title="确认删除这个教育角色？"
                                onConfirm={() => void removeRole(badge.roleAssignmentId!)}
                              >
                                <Button danger size="small" type="text">
                                  删除
                                </Button>
                              </Popconfirm>
                            ) : null}
                          </Space>
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
                        <Form.Item
                          name="role"
                          rules={[{ message: '请选择教育身份', required: true }]}
                        >
                          <Select
                            options={allRoleOptions}
                            placeholder="绑定后补全教育身份"
                            onChange={() => accountForm.resetFields(['org_unit_id'])}
                          />
                        </Form.Item>
                        <Form.Item
                          name="org_unit_id"
                          rules={[{ message: '请选择作用范围', required: true }]}
                        >
                          <TreeSelect
                            showSearch
                            treeDefaultExpandAll
                            placeholder="教育身份作用范围"
                            treeData={accountRoleScopedTreeData}
                            treeNodeFilterProp="label"
                          />
                        </Form.Item>
                        <Button
                          block
                          icon={<Link2 size={14} />}
                          loading={saving}
                          onClick={bindAccount}
                        >
                          绑定账号
                        </Button>
                        {selectedPerson.better_auth_user_id ? (
                          <Popconfirm
                            okButtonProps={{ danger: true, loading: saving }}
                            okText="解绑"
                            title="确认解绑此账号？"
                            onConfirm={() => void unbindAccount()}
                          >
                            <Button block danger>
                              解绑账号
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </Form>
                    ) : null}
                  </section>

                  <section className={styles.directoryDetailSection}>
                    <div className={styles.directoryDetailTitle}>定向邀请</div>
                    <div className={styles.directoryMetaLine}>
                      待处理邀请 {selectedPersonPendingInvites} 个
                    </div>
                    {selectedPersonPendingInvitationItems.length ? (
                      <div className={styles.directoryInspectorTags}>
                        {selectedPersonPendingInvitationItems.map((invite) => (
                          <Space key={invite.token} size={4}>
                            <Tag className={styles.directoryRoleTag}>
                              {invite.email || '链接邀请'} / {invite.token.slice(0, 8)}
                            </Tag>
                            {canManage ? (
                              <Popconfirm
                                okButtonProps={{ danger: true, loading: saving }}
                                okText="撤销"
                                title="确认撤销这条邀请？"
                                onConfirm={() => void revokeInvitation(invite.token)}
                              >
                                <Button danger size="small" type="text">
                                  撤销
                                </Button>
                              </Popconfirm>
                            ) : null}
                          </Space>
                        ))}
                      </div>
                    ) : null}
                    {canManage ? (
                      <Form
                        className={styles.directoryInlineForm}
                        form={directInviteForm}
                        layout="vertical"
                      >
                        <Form.Item name="email">
                          <Input placeholder="手机号或邮箱（默认使用人员邮箱）" />
                        </Form.Item>
                        <Form.Item
                          name="role"
                          rules={[{ message: '请选择教育身份', required: true }]}
                        >
                          <Select
                            placeholder="教育身份"
                            options={
                              selectedPersonLinks.some((link) => link.roster_kind === 'student')
                                ? allRoleOptions.filter((option) => option.value === 'student')
                                : allRoleOptions.filter((option) => option.value !== 'student')
                            }
                            onChange={() => directInviteForm.resetFields(['org_unit_id'])}
                          />
                        </Form.Item>
                        <Form.Item
                          name="org_unit_id"
                          rules={[{ message: '请选择作用范围', required: true }]}
                        >
                          <TreeSelect
                            showSearch
                            treeDefaultExpandAll
                            placeholder="教育身份作用范围"
                            treeData={directInviteRoleScopedTreeData}
                            treeNodeFilterProp="label"
                          />
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
          <Empty
            description={error ? '组织架构加载失败' : '暂无组织架构数据'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {error ? (
              <Button loading={loading} onClick={loadDirectory}>
                重试
              </Button>
            ) : null}
          </Empty>
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
