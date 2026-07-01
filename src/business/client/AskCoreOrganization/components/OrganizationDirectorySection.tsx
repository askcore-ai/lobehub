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
  Save,
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

import { askCoreWorkbenchClient } from '../../AskCoreWorkbench/api';
import {
  approveAskCoreEducationIdentityClaim,
  bindAskCoreDirectoryPersonAccount,
  createAskCoreDirectoryInvitation,
  createAskCoreDirectoryPerson,
  createAskCoreDirectoryPersonRole,
  createAskCoreEducationIdentityClaim,
  createAskCoreEducationOrgUnit,
  createAskCoreOrganizationInvite,
  createAskCoreTeachingAssignment,
  deleteAskCoreEducationOrgUnit,
  fetchAskCoreEducationIdentityClaims,
  fetchAskCoreOrganizationDirectory,
  fetchAskCoreTeachingAssignments,
  importAskCoreDirectoryPeople,
  rejectAskCoreEducationIdentityClaim,
  removeAskCoreOrganizationMember,
  updateAskCoreDirectoryPerson,
  updateAskCoreEducationOrgUnit,
  uploadAskCoreCsv,
} from '../api';
import { ASKCORE_IDENTITY_CLAIM_OPEN_EVENT } from '../events';
import { styles } from '../styles';
import {
  type AskCoreDirectoryPerson,
  type AskCoreEducationIdentityClaim,
  type AskCoreEducationIdentityRosterKind,
  type AskCoreEducationOrgUnit,
  type AskCoreEducationOrgUnitType,
  type AskCoreEducationRole,
  type AskCoreOrganizationDirectoryPayload,
  type AskCoreOrganizationRole,
  type AskCoreTeachingAssignment,
} from '../types';

type DirectoryFilterKey = 'all' | 'identity_required' | 'invited' | 'student' | 'teacher';
type DirectoryActionKind = 'create' | 'import' | 'invite';
type DirectoryRoleTone =
  'admin' | 'member' | 'owner' | 'roster' | 'student' | 'teacher' | 'unknown';
type IdentityDrawerMode = 'claim' | 'review';

type SubjectOption = { label: string; value: number };

interface DirectoryRoleBadgeModel {
  key: string;
  label: string;
  path?: string;
  tone: DirectoryRoleTone;
}

interface DirectoryPersonRowModel {
  accountLabel: string;
  organizationRoleBadge: DirectoryRoleBadgeModel;
  pendingInvites: number;
  person: AskCoreDirectoryPerson;
  primaryPath: string;
  roleBadges: DirectoryRoleBadgeModel[];
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
  rosterKind: AskCoreEducationIdentityRosterKind;
  unitPath: string;
}

const unitTypeLabels: Record<AskCoreEducationOrgUnitType, string> = {
  class: '班级',
  cohort: '届别',
  department: '部门',
  organization: '组织',
  school: '学校',
};

const unitTypeOptions = (
  Object.entries(unitTypeLabels) as [AskCoreEducationOrgUnitType, string][]
)
  .filter(([value]) => value !== 'organization')
  .map(([value, label]) => ({ label, value }));

const unitTypeLabel = (unit: Pick<AskCoreEducationOrgUnit, 'subject_id' | 'unit_type'>) =>
  unit.unit_type === 'department' && unit.subject_id ? '学科组' : unitTypeLabels[unit.unit_type];

const roleLabels: Record<AskCoreEducationRole, string> = {
  grade_admin: '届别管理者',
  homeroom_teacher: '班主任',
  school_admin: '学校管理者',
  student: '学生',
  subject_lead: '学科组长',
  teacher: '教师',
};

const organizationRoleLabels: Record<AskCoreOrganizationRole, string> = {
  admin: '管理员',
  member: '成员',
  owner: '所有者',
};

const registrationLabels: Record<AskCoreDirectoryPerson['registration_status'], string> = {
  invited: '邀请中',
  registered: '已注册',
  unregistered: '未注册',
};

const roleOptionsByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole[]> = {
  class: ['homeroom_teacher', 'teacher', 'student'],
  cohort: ['grade_admin', 'teacher'],
  department: ['subject_lead', 'teacher'],
  organization: ['teacher'],
  school: ['school_admin', 'teacher'],
};

const defaultEducationRoleByUnitType: Record<AskCoreEducationOrgUnitType, AskCoreEducationRole> = {
  class: 'student',
  cohort: 'teacher',
  department: 'teacher',
  organization: 'teacher',
  school: 'teacher',
};

const identityTargetKindLabels: Record<string, string> = {
  member: '人员',
  student: '学生',
  teacher: '教师',
};

const directoryFilterOptions: { key: DirectoryFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'identity_required', label: '待补全身份' },
  { key: 'invited', label: '邀请中' },
  { key: 'teacher', label: '教师' },
  { key: 'student', label: '学生' },
];

const allRoleOptions = (Object.keys(roleLabels) as AskCoreEducationRole[]).map((role) => ({
  label: roleLabels[role],
  value: role,
}));

const sortUnits = (units: AskCoreEducationOrgUnit[]) =>
  [...units].sort(
    (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }) || a.id - b.id,
  );

const roleAllowedForUnit = (
  role: AskCoreEducationRole | undefined,
  unit: AskCoreEducationOrgUnit,
) => {
  if (!role) return true;
  if (role === 'subject_lead') return unit.unit_type === 'department' && Boolean(unit.subject_id);
  return roleOptionsByUnitType[unit.unit_type].includes(role);
};

const parentAllowedForUnitType = (
  unitType: AskCoreEducationOrgUnitType | undefined,
  parentUnit: AskCoreEducationOrgUnit | undefined,
) => {
  if (!unitType || !parentUnit) return true;
  if (unitType === 'organization') return false;
  if (unitType === 'school') return parentUnit.unit_type === 'organization';
  if (unitType === 'cohort')
    return parentUnit.unit_type === 'organization' || parentUnit.unit_type === 'school';
  if (unitType === 'class')
    return (
      parentUnit.unit_type === 'organization' ||
      parentUnit.unit_type === 'school' ||
      parentUnit.unit_type === 'cohort'
    );
  return (
    parentUnit.unit_type === 'organization' ||
    parentUnit.unit_type === 'school' ||
    parentUnit.unit_type === 'cohort' ||
    parentUnit.unit_type === 'department'
  );
};

const roleTone = (role: AskCoreEducationRole): DirectoryRoleTone => {
  if (role === 'student') return 'student';
  if (role === 'teacher' || role === 'homeroom_teacher' || role === 'subject_lead')
    return 'teacher';
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

const matchesSearch = (person: AskCoreDirectoryPerson, query: string) => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [person.display_name, person.email, person.phone, person.better_auth_user_id]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword));
};

const isRootDirectPerson = (person: AskCoreDirectoryPerson, rootUnitId: number | null) =>
  rootUnitId
    ? person.primary_org_unit_id === rootUnitId ||
      person.primary_org_unit_id === null ||
      person.primary_org_unit_id === undefined
    : person.primary_org_unit_id === null || person.primary_org_unit_id === undefined;

const normalizeOrganizationRole = (role?: string | null): AskCoreOrganizationRole | null => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'member')
    return normalized;
  return null;
};

const canRemoveOrganizationMember = (
  actorRole: AskCoreOrganizationRole | undefined,
  targetRole: AskCoreOrganizationRole | null,
) => actorRole === 'owner' || (actorRole === 'admin' && targetRole === 'member');

const UnitTree = memo<{
  activeAncestorIds: Set<number>;
  canManage: boolean;
  peopleCountByUnitId: Map<number, number>;
  renderNodeActions: (unit: AskCoreEducationOrgUnit | null) => ReactNode;
  rootUnit: AskCoreEducationOrgUnit | null;
  rootLabel: string;
  selectedUnitId: number | null;
  totalPeopleCount: number;
  unitDisplayName: (unit: AskCoreEducationOrgUnit) => string;
  units: AskCoreEducationOrgUnit[];
  onSelect: (unitId: number | null) => void;
}>(
  ({
    activeAncestorIds,
    canManage,
    peopleCountByUnitId,
    renderNodeActions,
    rootUnit,
    rootLabel,
    selectedUnitId,
    totalPeopleCount,
    unitDisplayName,
    units,
    onSelect,
  }) => {
    const childrenByParent = useMemo(() => makeChildrenByParent(units), [units]);

    const renderBranch = (parentId: number | null, depth = 0): ReactNode[] =>
      (childrenByParent.get(parentId) || []).flatMap((unit) => {
        const active = selectedUnitId === unit.id;
        const ancestor = activeAncestorIds.has(unit.id) && !active;
        return [
          <div
            key={unit.id}
            style={{ paddingInlineStart: 12 + depth * 16 }}
            className={`${styles.directoryTreeNodeRow} ${
              active ? styles.directoryTreeNodeRowActive : ''
            } ${ancestor ? styles.directoryTreeNodeAncestor : ''}`}
          >
            <button
              aria-current={active ? 'true' : undefined}
              className={styles.directoryTreeNode}
              type="button"
              onClick={() => onSelect(unit.id)}
            >
              <span className={styles.directoryTreeNodeLabel}>
                <span>{unitDisplayName(unit)}</span>
                <small>{unitTypeLabel(unit)}</small>
              </span>
              <span className={styles.directoryTreeCount}>
                {peopleCountByUnitId.get(unit.id) || 0}
              </span>
            </button>
            {canManage ? renderNodeActions(unit) : null}
          </div>,
          ...renderBranch(unit.id, depth + 1),
        ];
      });

    return (
      <div className={styles.directoryTree}>
        {rootUnit ? (
          <>
            <div
              className={`${styles.directoryTreeNodeRow} ${
                selectedUnitId === rootUnit.id ? styles.directoryTreeNodeRowActive : ''
              }`}
            >
              <button
                aria-current={selectedUnitId === rootUnit.id ? 'true' : undefined}
                className={styles.directoryTreeNode}
                type="button"
                onClick={() => onSelect(rootUnit.id)}
              >
                <span className={styles.directoryTreeNodeLabel}>
                  <span>{rootLabel}</span>
                  <small>组织</small>
                </span>
                <span className={styles.directoryTreeCount}>
                  {peopleCountByUnitId.get(rootUnit.id) || 0}
                </span>
              </button>
              {canManage ? renderNodeActions(rootUnit) : null}
            </div>
            {renderBranch(rootUnit.id, 1)}
          </>
        ) : (
          <>
            <div
              className={`${styles.directoryTreeNodeRow} ${
                selectedUnitId === null ? styles.directoryTreeNodeRowActive : ''
              }`}
            >
              <button
                aria-current={selectedUnitId === null ? 'true' : undefined}
                className={styles.directoryTreeNode}
                type="button"
                onClick={() => onSelect(null)}
              >
                <span className={styles.directoryTreeNodeLabel}>
                  <span>{rootLabel}</span>
                  <small>组织</small>
                </span>
                <span className={styles.directoryTreeCount}>{totalPeopleCount}</span>
              </button>
              {canManage ? renderNodeActions(null) : null}
            </div>
            {renderBranch(null)}
          </>
        )}
      </div>
    );
  },
);

UnitTree.displayName = 'UnitTree';

interface OrganizationDirectorySectionProps {
  canManage: boolean;
  currentOrganizationRole?: AskCoreOrganizationRole;
  organizationName?: string;
}

export const OrganizationDirectorySection = memo<OrganizationDirectorySectionProps>(
  ({ canManage, currentOrganizationRole, organizationName }) => {
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
    const [unitCreateOpen, setUnitCreateOpen] = useState(false);
    const [unitEditOpen, setUnitEditOpen] = useState(false);
    const [unitActionTarget, setUnitActionTarget] = useState<'root' | number | null>(null);
    const [orgActionOpen, setOrgActionOpen] = useState(false);
    const [unitActionOpen, setUnitActionOpen] = useState(false);
    const [activeOrgAction, setActiveOrgAction] = useState<DirectoryActionKind>('create');
    const [activeUnitAction, setActiveUnitAction] = useState<DirectoryActionKind>('create');
    const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
    const [teachingAssignments, setTeachingAssignments] = useState<AskCoreTeachingAssignment[]>([]);
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
    const [personProfileForm] = Form.useForm();
    const [roleForm] = Form.useForm();
    const [teachingAssignmentForm] = Form.useForm();
    const [directInviteForm] = Form.useForm();
    const watchedCreateUnitType = Form.useWatch('unit_type', unitCreateForm) as
      AskCoreEducationOrgUnitType | undefined;
    const watchedEditUnitType = Form.useWatch('unit_type', unitEditForm) as
      AskCoreEducationOrgUnitType | undefined;
    const watchedRole = Form.useWatch('role', roleForm) as AskCoreEducationRole | undefined;
    const watchedOrgImportRole = Form.useWatch('default_role', orgImportForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgPersonRole = Form.useWatch('education_role', orgPersonForm) as
      AskCoreEducationRole | undefined;
    const watchedOrgInviteRole = Form.useWatch('role', orgInviteForm) as
      AskCoreEducationRole | undefined;

    const shouldOpenIdentityDrawer =
      new URLSearchParams(location.search).get('action') === 'identity-claim';

    const loadDirectory = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
        const next = await fetchAskCoreOrganizationDirectory();
        setPayload(next);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '组织架构加载失败');
      } finally {
        setLoading(false);
      }
    }, []);

    const loadSubjects = useCallback(async () => {
      const rows = await askCoreWorkbenchClient.listAllResource('subjects').catch(() => []);
      setSubjectOptions(
        rows
          .map((row) => ({
            label: String(row.name || row.subject_name || row.id || '').trim(),
            value: Number(row.subject_id || row.id || 0),
          }))
          .filter((option) => option.value > 0 && option.label),
      );
    }, []);

    const loadTeachingAssignments = useCallback(async () => {
      const next = await fetchAskCoreTeachingAssignments().catch(() => ({ items: [] }));
      setTeachingAssignments(Array.isArray(next.items) ? next.items : []);
    }, []);

    useEffect(() => {
      void loadDirectory();
      void loadSubjects();
      void loadTeachingAssignments();
    }, [loadDirectory, loadSubjects, loadTeachingAssignments]);

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
    const organizationRootUnit = useMemo(
      () =>
        units.find((unit) => unit.unit_type === 'organization' && !unit.parent_id) ||
        units.find((unit) => unit.unit_type === 'organization') ||
        null,
      [units],
    );
    const rootUnitId = organizationRootUnit?.id ?? null;
    const rootNodeLabel = organizationName || organizationRootUnit?.name || '当前组织';
    const roleAssignments = useMemo(
      () => payload?.authorizations ?? [],
      [payload?.authorizations],
    );
    const invitations = useMemo(() => payload?.invitations ?? [], [payload?.invitations]);
    const memberSummaries = useMemo(
      () => payload?.member_summaries ?? {},
      [payload?.member_summaries],
    );
    const personById = useMemo(
      () => new Map(people.map((person) => [person.id, person])),
      [people],
    );
    const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
    const unitDisplayName = useCallback(
      (unit: AskCoreEducationOrgUnit) =>
        unit.unit_type === 'organization' && unit.id === rootUnitId ? rootNodeLabel : unit.name,
      [rootNodeLabel, rootUnitId],
    );
    const subjectNameById = useMemo(
      () => new Map(subjectOptions.map((subject) => [subject.value, subject.label])),
      [subjectOptions],
    );
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
    useEffect(() => {
      if (!payload) return;
      if (rootUnitId && (selectedUnitId === null || !unitById.has(selectedUnitId))) {
        setSelectedUnitId(rootUnitId);
        return;
      }
      if (!rootUnitId && selectedUnitId && !unitById.has(selectedUnitId)) {
        setSelectedUnitId(null);
      }
    }, [payload, rootUnitId, selectedUnitId, unitById]);
    const unitPathLabel = useCallback(
      (unitId?: number | null) => {
        if (unitId === null || unitId === undefined) return rootNodeLabel;
        const path = makeUnitPath(unitId, unitById);
        return path.length ? path.map((unit) => unitDisplayName(unit)).join(' / ') : rootNodeLabel;
      },
      [rootNodeLabel, unitById, unitDisplayName],
    );
    const selectedPathLabel = selectedUnit ? unitPathLabel(selectedUnit.id) : rootNodeLabel;
    const classUnitOptions = useMemo(
      () =>
        units
          .filter((unit) => unit.unit_type === 'class')
          .map((unit) => ({ label: unitPathLabel(unit.id), value: unit.id })),
      [unitPathLabel, units],
    );
    const rootPeople = useMemo(
      () => people.filter((person) => isRootDirectPerson(person, rootUnitId)),
      [people, rootUnitId],
    );
    const directPeople = useMemo(
      () =>
        selectedUnitId
          ? people.filter(
              (person) =>
                person.primary_org_unit_id === selectedUnitId ||
                (selectedUnitId === rootUnitId && isRootDirectPerson(person, rootUnitId)),
            )
          : rootPeople,
      [people, rootPeople, rootUnitId, selectedUnitId],
    );
    const basePeople = directPeople;
    const peopleCountByUnitId = useMemo(() => {
      const map = new Map<number, number>();
      for (const person of people) {
        const unitId = person.primary_org_unit_id || rootUnitId;
        if (unitId) {
          map.set(unitId, (map.get(unitId) || 0) + 1);
        }
      }
      return map;
    }, [people, rootUnitId]);
    const rolesByPersonId = useMemo(() => {
      const map = new Map<number, typeof roleAssignments>();
      for (const role of roleAssignments) {
        if (!role.person_id) continue;
        map.set(role.person_id, [...(map.get(role.person_id) || []), role]);
      }
      return map;
    }, [roleAssignments]);
    const pendingInvitationsByPersonId = useMemo(() => {
      const map = new Map<number, number>();
      for (const invite of invitations) {
        if (invite.status !== 'pending' || !invite.person_id) continue;
        map.set(invite.person_id, (map.get(invite.person_id) || 0) + 1);
      }
      return map;
    }, [invitations]);
    const personNeedsEducationIdentity = useCallback(
      (person: AskCoreDirectoryPerson) =>
        person.registration_status === 'registered' &&
        Boolean(person.better_auth_user_id) &&
        (rolesByPersonId.get(person.id) || []).length === 0,
      [rolesByPersonId],
    );
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
        people.map((person) => {
          const key = `member:${person.id}`;
          const disabledReason = person.better_auth_user_id
            ? '已绑定账号'
            : pendingIdentityClaimKeys.has(key)
              ? canManage
                ? '已提交待审批'
                : '申请处理中'
              : undefined;
          return {
            disabledReason,
            key,
            person,
            rosterId: person.id,
            rosterKind: 'member',
            unitPath: unitPathLabel(person.primary_org_unit_id),
          };
        }),
      [canManage, pendingIdentityClaimKeys, people, unitPathLabel],
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

    const organizationRoleBadgeForPerson = useCallback(
      (person: AskCoreDirectoryPerson): DirectoryRoleBadgeModel => {
        const userId = String(person.better_auth_user_id || '').trim();
        if (!userId) {
          return {
            key: `organization-role-none-${person.id}`,
            label: '未加入组织',
            tone: 'unknown',
          };
        }
        const memberSummary = memberSummaries[userId];
        const organizationRole = normalizeOrganizationRole(memberSummary?.organization_role);
        if (!organizationRole) {
          return {
            key: `organization-role-unsynced-${person.id}`,
            label: '待修复',
            path: '成员身份待修复',
            tone: 'unknown',
          };
        }
        const memberLabel = [memberSummary?.name, memberSummary?.email].filter(Boolean).join(' · ');
        return {
          key: `organization-role-${person.id}`,
          label: organizationRoleLabels[organizationRole],
          path: memberLabel || undefined,
          tone: organizationRole,
        };
      },
      [memberSummaries],
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
        return [];
      },
      [rolesByPersonId, unitPathLabel],
    );

    const filteredPeople = useMemo(
      () =>
        basePeople.filter((person) => {
          if (!matchesSearch(person, searchText)) return false;
          const badges = roleBadgesForPerson(person.id);
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          if (activeFilter === 'all') return true;
          if (activeFilter === 'identity_required') return personNeedsEducationIdentity(person);
          if (activeFilter === 'invited')
            return pendingInvites > 0 || person.registration_status === 'invited';
          if (activeFilter === 'teacher') {
            return badges.some((badge) => badge.tone === 'teacher' || badge.label.includes('教师'));
          }
          if (activeFilter === 'student') {
            return badges.some((badge) => badge.tone === 'student' || badge.label.includes('学生'));
          }
          return false;
        }),
      [
        activeFilter,
        basePeople,
        pendingInvitationsByPersonId,
        personNeedsEducationIdentity,
        roleBadgesForPerson,
        searchText,
      ],
    );

    const selectedPerson = selectedPersonId
      ? filteredPeople.find((person) => person.id === selectedPersonId) || null
      : null;
    const selectedPersonTeachingAssignments = selectedPerson
      ? teachingAssignments.filter(
          (assignment) => assignment.person_id === selectedPerson.id,
        )
      : [];
    const selectedPersonCanTeach = selectedPerson
      ? (rolesByPersonId.get(selectedPerson.id) || []).some((role) =>
          ['grade_admin', 'homeroom_teacher', 'school_admin', 'subject_lead', 'teacher'].includes(
            role.role,
          ),
        )
      : false;
    const selectedPersonPendingInvites = selectedPerson
      ? pendingInvitationsByPersonId.get(selectedPerson.id) || 0
      : 0;
    const selectedPersonUserId = String(selectedPerson?.better_auth_user_id || '').trim();
    const selectedPersonMemberSummary = selectedPersonUserId
      ? memberSummaries[selectedPersonUserId]
      : undefined;
    const selectedPersonOrganizationRole = normalizeOrganizationRole(
      selectedPersonMemberSummary?.organization_role,
    );
    const selectedPersonCanRemoveOrganizationMember =
      canManage &&
      Boolean(selectedPersonMemberSummary?.member_id) &&
      canRemoveOrganizationMember(currentOrganizationRole, selectedPersonOrganizationRole);
    const selectedPersonRemoveDisabledReason = !selectedPerson?.better_auth_user_id
      ? undefined
      : !selectedPersonMemberSummary?.member_id
        ? '未找到组织成员记录'
        : !selectedPersonCanRemoveOrganizationMember
          ? '只有所有者可以移除所有者或管理员'
          : undefined;
    const selectedNodePendingInvites = invitations.filter((invite) => {
      if (invite.status !== 'pending') return false;
      const targetUnitId = selectedUnitId || rootUnitId;
      if (!targetUnitId) {
        if (invite.primary_org_unit_id !== null && invite.primary_org_unit_id !== undefined)
          return false;
        if (!invite.person_id) return invite.invitation_kind === 'open';
        const invitedPerson = personById.get(invite.person_id);
        return invitedPerson ? isRootDirectPerson(invitedPerson, rootUnitId) : false;
      }
      if (invite.primary_org_unit_id === targetUnitId) return true;
      if (targetUnitId === rootUnitId && invite.primary_org_unit_id == null) return true;
      if (!invite.person_id) return false;
      const invitedPerson = people.find((person) => person.id === invite.person_id);
      return invitedPerson
        ? invitedPerson.primary_org_unit_id === targetUnitId ||
            (targetUnitId === rootUnitId && isRootDirectPerson(invitedPerson, rootUnitId))
        : false;
    }).length;
    const directoryRows = useMemo<DirectoryPersonRowModel[]>(
      () =>
        filteredPeople.map((person) => {
          const pendingInvites = pendingInvitationsByPersonId.get(person.id) || 0;
          return {
            accountLabel: person.better_auth_user_id ? '已绑定' : '未绑定',
            organizationRoleBadge: organizationRoleBadgeForPerson(person),
            pendingInvites,
            person,
            primaryPath: unitPathLabel(person.primary_org_unit_id),
            roleBadges: roleBadgesForPerson(person.id),
          };
        }),
      [
        filteredPeople,
        organizationRoleBadgeForPerson,
        pendingInvitationsByPersonId,
        roleBadgesForPerson,
        unitPathLabel,
      ],
    );

    useEffect(() => {
      if (selectedPersonId && !filteredPeople.some((person) => person.id === selectedPersonId))
        setSelectedPersonId(null);
    }, [filteredPeople, selectedPersonId]);

    useEffect(() => {
      if (!selectedPerson) return;
      personProfileForm.setFieldsValue({
        display_name: selectedPerson.display_name,
        email: selectedPerson.email || '',
        phone: selectedPerson.phone || '',
      });
    }, [personProfileForm, selectedPerson]);

    const buildUnitTreeData = useCallback(
      (role?: AskCoreEducationRole, parentId: number | null = null): DirectoryTreeSelectNode[] =>
        (childrenByParent.get(parentId) || []).map((unit) => {
          const path = unitPathLabel(unit.id);
          const allowed = roleAllowedForUnit(role, unit);
          const typeLabel = unitTypeLabel(unit);
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
          const typeLabel = unitTypeLabel(unit);
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
    const orgInviteTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgInviteRole),
      [buildUnitTreeData, watchedOrgInviteRole],
    );
    const orgImportRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgImportRole),
      [buildUnitTreeData, watchedOrgImportRole],
    );
    const orgPersonRoleScopedTreeData = useMemo(
      () => buildUnitTreeData(watchedOrgPersonRole),
      [buildUnitTreeData, watchedOrgPersonRole],
    );
    const plainTreeData = useMemo(() => buildUnitTreeData(), [buildUnitTreeData]);
    const createUnitParentTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => buildUnitParentTreeData(watchedCreateUnitType),
      [buildUnitParentTreeData, watchedCreateUnitType],
    );
    const editUnitParentTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => buildUnitParentTreeData(watchedEditUnitType, selectedUnit?.id),
      [buildUnitParentTreeData, selectedUnit?.id, watchedEditUnitType],
    );
    const orgInvitePositionTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => orgInviteTreeData,
      [orgInviteTreeData],
    );
    const personPrimaryUnitTreeData = useMemo<DirectoryTreeSelectNode[]>(
      () => plainTreeData,
      [plainTreeData],
    );
    const selectedUnitRoleOptions = (
      selectedUnit
        ? roleOptionsByUnitType[selectedUnit.unit_type].filter((role) =>
            roleAllowedForUnit(role, selectedUnit),
          )
        : []
    ).map((role) => ({ label: roleLabels[role], value: role }));
    const selectedUnitDefaultRole = selectedUnit
      ? defaultEducationRoleByUnitType[selectedUnit.unit_type]
      : undefined;
    const selectedUnitPresetLabel =
      selectedUnit && selectedUnitDefaultRole
        ? `${roleLabels[selectedUnitDefaultRole]} · ${unitDisplayName(selectedUnit)}`
        : undefined;

    const rootTeacherDefaults = () =>
      rootUnitId && organizationRootUnit
        ? {
            education_org_unit_id: rootUnitId,
            education_role: 'teacher',
            primary_org_unit_id: rootUnitId,
          }
        : {};

    const applyActionDefaults = (scope: 'organization' | 'unit', action: DirectoryActionKind) => {
      const isUnitScope = scope === 'unit' && selectedUnit && selectedUnitDefaultRole;
      if (action === 'create') {
        const form = scope === 'organization' ? orgPersonForm : unitPersonForm;
        form.resetFields();
        if (scope === 'organization') {
          form.setFieldsValue(rootTeacherDefaults());
        }
        if (isUnitScope) {
          form.setFieldsValue({
            education_role: selectedUnitDefaultRole,
          });
        }
        return;
      }
      if (action === 'invite') {
        const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
        form.resetFields();
        if (scope === 'organization' && rootUnitId) {
          form.setFieldsValue({
            primary_org_unit_id: rootUnitId,
            role: 'teacher',
          });
        }
        if (isUnitScope) {
          form.setFieldsValue({
            role: selectedUnitDefaultRole,
          });
        }
        return;
      }
      const form = scope === 'organization' ? orgImportForm : unitImportForm;
      form.resetFields();
      if (scope === 'organization' && rootUnitId) {
        form.setFieldsValue({
          default_role: 'teacher',
          primary_org_unit_id: rootUnitId,
        });
      }
      if (isUnitScope) {
        form.setFieldsValue({
          default_role: selectedUnitDefaultRole,
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
        message.error('请选择角色');
        return null;
      }
      if (!unitId) {
        message.error('角色必须选择范围');
        return null;
      }
      const targetUnit = unitById.get(unitId);
      if (!targetUnit) {
        message.error('请选择有效的角色范围');
        return null;
      }
      if (!roleAllowedForUnit(role, targetUnit)) {
        message.error(`${roleLabels[role]}不能分配到${unitTypeLabel(targetUnit)}`);
        return null;
      }
      return targetUnit;
    };

    const createUnit = async () => {
      const values = await unitCreateForm.validateFields();
      const createdParentId = values.parent_id ? Number(values.parent_id) : rootUnitId || undefined;
      setSaving(true);
      try {
        const created = await createAskCoreEducationOrgUnit({
          entry_year: values.unit_type === 'cohort' ? values.entry_year || undefined : undefined,
          name: values.name,
          parent_id: createdParentId,
          subject_id:
            values.unit_type === 'department' && values.subject_id
              ? Number(values.subject_id)
              : undefined,
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
        selectedUnit.unit_type === 'organization'
          ? null
          : values.parent_id
            ? Number(values.parent_id)
            : rootUnitId || undefined;
      setSaving(true);
      try {
        const updated = await updateAskCoreEducationOrgUnit(selectedUnit.id, {
          entry_year: values.unit_type === 'cohort' ? values.entry_year || undefined : undefined,
          name: values.name,
          parent_id: nextParentId,
          subject_id:
            values.unit_type === 'department' && values.subject_id
              ? Number(values.subject_id)
              : undefined,
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

    const deleteUnit = async (unit: AskCoreEducationOrgUnit | null = selectedUnit) => {
      if (!unit) return;
      setSaving(true);
      try {
        await deleteAskCoreEducationOrgUnit(unit.id);
        setSelectedUnitId((current) => (current === unit.id ? rootUnitId : current));
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
      const educationRole =
        (values.education_role as AskCoreEducationRole | undefined) ||
        (scope === 'unit' ? selectedUnitDefaultRole : undefined);
      const roleScopeId =
        scope === 'unit'
          ? selectedUnitId
          : values.education_org_unit_id
            ? Number(values.education_org_unit_id)
            : rootUnitId;
      if (!validateEducationScope(educationRole, roleScopeId)) return;
      setSaving(true);
      try {
        await createAskCoreDirectoryPerson({
          display_name: values.display_name,
          email: values.email || undefined,
          education_org_unit_id: roleScopeId,
          education_role: educationRole,
          primary_org_unit_id:
            scope === 'unit'
              ? selectedUnitId || rootUnitId || undefined
              : values.primary_org_unit_id
                ? Number(values.primary_org_unit_id)
                : rootUnitId || undefined,
        });
        form.resetFields();
        await loadDirectory();
        message.success('人员已创建');
      } finally {
        setSaving(false);
      }
    };

    const createOpenInvitation = async (scope: 'organization' | 'unit') => {
      if (!payload) return;
      const form = scope === 'organization' ? orgInviteForm : unitInviteForm;
      const values = await form.validateFields();
      const rawPrimaryOrgUnitId = scope === 'unit' ? selectedUnitId : values.primary_org_unit_id;
      const primaryOrgUnitId = rawPrimaryOrgUnitId ? Number(rawPrimaryOrgUnitId) : rootUnitId;
      const presetRole =
        (values.role as AskCoreEducationRole | undefined) ||
        (scope === 'unit' ? selectedUnitDefaultRole : undefined);
      if (!validateEducationScope(presetRole, primaryOrgUnitId)) return;
      if (!presetRole) return;
      setSaving(true);
      try {
        const directoryInvitation = await createAskCoreDirectoryInvitation({
          email: values.email || undefined,
          invitation_kind: 'open',
          primary_org_unit_id: primaryOrgUnitId,
          preset_roles: [presetRole],
        });
        const invite = await createAskCoreOrganizationInvite(payload.org_id, {
          channel: values.email ? 'email' : 'link',
          directory_invitation_token: directoryInvitation.token,
          email: values.email || undefined,
          expiresIn: '7d',
          preset_roles: [presetRole],
          primary_org_unit_id: primaryOrgUnitId,
          role: 'member',
        });
        copyInviteLink(invite.link);
        form.resetFields();
        await loadDirectory();
        message.success(
          scope === 'unit' ? '当前节点邀请链接已创建并复制' : '不定向邀请已创建并复制',
        );
      } finally {
        setSaving(false);
      }
    };

    const handleCsvImport = async (scope: 'organization' | 'unit', file: File) => {
      const form = scope === 'organization' ? orgImportForm : unitImportForm;
      const values = await form.validateFields();
      const defaultRole =
        (values.default_role as AskCoreEducationRole | undefined) ||
        (scope === 'unit' ? selectedUnitDefaultRole : undefined);
      const roleScopeId =
        scope === 'unit'
          ? selectedUnitId
          : values.primary_org_unit_id
            ? Number(values.primary_org_unit_id)
            : rootUnitId;
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
          primary_org_unit_id: roleScopeId,
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

    const removeSelectedOrganizationMember = async () => {
      if (!payload || !selectedPerson || !selectedPersonMemberSummary?.member_id) {
        message.error('未找到组织成员记录');
        return;
      }
      setSaving(true);
      try {
        await removeAskCoreOrganizationMember(payload.org_id, selectedPersonMemberSummary.member_id);
        await loadDirectory();
        message.success('成员已移出组织');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '成员移出失败');
      } finally {
        setSaving(false);
      }
    };

    const savePersonProfile = async () => {
      if (!selectedPerson) return;
      const values = await personProfileForm.validateFields(['display_name', 'email', 'phone']);
      const normalizeOptional = (value: unknown) => {
        const text = String(value || '').trim();
        return text || null;
      };
      setSaving(true);
      try {
        await updateAskCoreDirectoryPerson(selectedPerson.id, {
          display_name: String(values.display_name || '').trim(),
          email: normalizeOptional(values.email),
          phone: normalizeOptional(values.phone),
        });
        await loadDirectory();
        message.success('人员资料已更新');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '人员资料更新失败');
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
      if (!payload || !selectedPerson) return;
      const selectedRoles = rolesByPersonId.get(selectedPerson.id) || [];
      if (!selectedRoles.length) {
        message.error('请先为此人员分配角色');
        return;
      }
      const values = await directInviteForm.validateFields();
      const email = values.email || selectedPerson.email || undefined;
      setSaving(true);
      try {
        const directoryInvitation = await createAskCoreDirectoryInvitation({
          email,
          invitation_kind: 'directed',
          person_id: selectedPerson.id,
        });
        const invite = await createAskCoreOrganizationInvite(payload.org_id, {
          channel: email ? 'email' : 'link',
          directory_invitation_token: directoryInvitation.token,
          email,
          expiresIn: '7d',
          person_id: selectedPerson.id,
          preset_roles: selectedRoles.map((role) => role.role),
          primary_org_unit_id: selectedPerson.primary_org_unit_id ?? null,
          role: 'member',
        });
        copyInviteLink(invite.link);
        directInviteForm.resetFields();
        await loadDirectory();
        message.success('定向邀请已创建并复制');
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

    const createTeachingAssignment = async () => {
      if (!selectedPerson || !selectedPersonCanTeach) {
        message.error('请选择具备教师角色的人员');
        return;
      }
      const values = await teachingAssignmentForm.validateFields();
      const subjectId = Number(values.subject_id || selectedUnit?.subject_id || 0);
      const classOrgUnitId = Number(values.class_org_unit_id || 0);
      if (!classOrgUnitId) {
        message.error('请选择任课班级');
        return;
      }
      if (!subjectId) {
        message.error('请选择任课学科');
        return;
      }
      setSaving(true);
      try {
        await createAskCoreTeachingAssignment({
          class_org_unit_id: classOrgUnitId,
          person_id: selectedPerson.id,
          subject_id: subjectId,
        });
        teachingAssignmentForm.resetFields();
        await Promise.all([loadTeachingAssignments(), loadDirectory()]);
        message.success('任课关系已添加');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '任课关系添加失败');
      } finally {
        setSaving(false);
      }
    };

    const exportDirectory = () => {
      if (!payload) return;
      const header = ['姓名', '归属', '权限', '角色', '账号'];
      const rows = people.map((person) => [
        person.display_name,
        unitPathLabel(person.primary_org_unit_id),
        organizationRoleBadgeForPerson(person).label,
        (rolesByPersonId.get(person.id) || [])
          .map((role) => `${roleLabels[role.role]}@${unitPathLabel(role.org_unit_id)}`)
          .join(';'),
        person.better_auth_user_id ? '已绑定' : '未绑定',
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

    const openUnitCreatePanel = (open: boolean, parentId: number | null = selectedUnitId) => {
      setUnitCreateOpen(open);
      if (!open) {
        setUnitActionTarget(null);
        return;
      }
      setUnitEditOpen(false);
      const resolvedParentId = parentId ?? rootUnitId;
      setUnitActionTarget(resolvedParentId ?? 'root');
      setSelectedUnitId(resolvedParentId);
      unitCreateForm.resetFields();
      unitCreateForm.setFieldsValue({
        parent_id: resolvedParentId || undefined,
      });
    };

    const openUnitEditPanel = (
      open: boolean,
      unit: AskCoreEducationOrgUnit | null = selectedUnit,
    ) => {
      setUnitEditOpen(open);
      if (!open) {
        setUnitActionTarget(null);
        return;
      }
      if (!unit) return;
      setUnitCreateOpen(false);
      setUnitActionTarget(unit.id);
      setSelectedUnitId(unit.id);
      unitEditForm.setFieldsValue({
        entry_year: unit.entry_year || undefined,
        name: unit.name,
        parent_id: unit.parent_id ?? rootUnitId ?? undefined,
        subject_id: unit.subject_id || undefined,
        unit_type: unit.unit_type,
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
                onChange={() => form.resetFields(['entry_year', 'parent_id', 'subject_id'])}
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
            {watchedType === 'department' ? (
              <Form.Item extra="选择科目后，此节点会作为学科组。" label="学科" name="subject_id">
                <Select allowClear showSearch options={subjectOptions} placeholder="选择学科" />
              </Form.Item>
            ) : null}
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
              <Form.Item label="归属" name="primary_org_unit_id">
                <TreeSelect
                  allowClear
                  showSearch
                  treeDefaultExpandAll
                  placeholder="放入组织节点"
                  treeData={personPrimaryUnitTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
            <Form.Item
              label="角色"
              name="education_role"
              rules={[{ message: '请选择角色', required: true }]}
            >
              <Select
                options={scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions}
                placeholder="选择角色"
                onChange={(nextRole: AskCoreEducationRole) => {
                  if (scope === 'organization') {
                    if (
                      rootUnitId &&
                      organizationRootUnit &&
                      roleAllowedForUnit(nextRole, organizationRootUnit)
                    ) {
                      orgPersonForm.setFieldsValue({ education_org_unit_id: rootUnitId });
                    } else {
                      orgPersonForm.resetFields(['education_org_unit_id']);
                    }
                  }
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                extra="决定这个角色在哪个学校、届别、班级或部门生效。"
                label="角色范围"
                name="education_org_unit_id"
                rules={[{ message: '请选择角色范围', required: true }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择角色范围"
                  treeData={orgPersonRoleScopedTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
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
              label="角色"
              name="role"
              rules={[{ message: '请选择角色', required: true }]}
            >
              <Select
                options={scope === 'unit' ? selectedUnitRoleOptions : allRoleOptions}
                placeholder="选择角色"
                onChange={(nextRole: AskCoreEducationRole) => {
                  if (scope === 'organization') {
                    if (
                      rootUnitId &&
                      organizationRootUnit &&
                      roleAllowedForUnit(nextRole, organizationRootUnit)
                    ) {
                      orgInviteForm.setFieldsValue({ primary_org_unit_id: rootUnitId });
                    } else {
                      orgInviteForm.resetFields(['primary_org_unit_id']);
                    }
                  }
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="邀请位置"
                name="primary_org_unit_id"
                rules={[
                  {
                    message: '请选择角色范围',
                    required: true,
                  },
                ]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择角色范围"
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
              label="默认角色"
              name="default_role"
              rules={[{ message: '请选择默认角色', required: true }]}
            >
              <Select
                options={roleOptions}
                placeholder="选择默认角色"
                onChange={(nextRole: AskCoreEducationRole) => {
                  if (scope === 'organization') {
                    if (
                      rootUnitId &&
                      organizationRootUnit &&
                      roleAllowedForUnit(nextRole, organizationRootUnit)
                    ) {
                      orgImportForm.setFieldsValue({ primary_org_unit_id: rootUnitId });
                    } else {
                      orgImportForm.resetFields(['primary_org_unit_id']);
                    }
                  }
                }}
              />
            </Form.Item>
            {scope === 'organization' ? (
              <Form.Item
                label="默认角色范围"
                name="primary_org_unit_id"
                rules={[{ message: '请选择默认角色范围', required: true }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  placeholder="选择默认角色范围"
                  treeData={orgImportRoleScopedTreeData}
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            ) : null}
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

    const renderTreeNodeActions = (unit: AskCoreEducationOrgUnit | null) => {
      const targetKey = unit?.id ?? 'root';
      const nodeName = unit ? unitDisplayName(unit) : rootNodeLabel;
      const isOrganizationRoot = unit?.unit_type === 'organization';
      return (
        <div
          className={styles.directoryTreeNodeActions}
          data-directory-tree-actions="true"
          onClick={(event) => event.stopPropagation()}
        >
          <Popover
            content={unitFormContent('create')}
            open={unitCreateOpen && unitActionTarget === targetKey}
            placement="rightTop"
            trigger="click"
            onOpenChange={(open) => openUnitCreatePanel(open, unit?.id ?? null)}
          >
            <Tooltip title={`在${nodeName}下新建节点`}>
              <Button
                aria-label={`在${nodeName}下新建节点`}
                icon={<Plus size={13} />}
                size="small"
                type="text"
              />
            </Tooltip>
          </Popover>
          {unit && !isOrganizationRoot ? (
            <>
              <Popover
                content={unitFormContent('edit')}
                open={unitEditOpen && unitActionTarget === unit.id}
                placement="rightTop"
                trigger="click"
                onOpenChange={(open) => openUnitEditPanel(open, unit)}
              >
                <Tooltip title={`编辑${nodeName}`}>
                  <Button
                    aria-label={`编辑${nodeName}`}
                    icon={<Pencil size={13} />}
                    size="small"
                    type="text"
                  />
                </Tooltip>
              </Popover>
              <Popconfirm
                okButtonProps={{ danger: true, loading: saving }}
                okText="删除"
                title={`确认删除“${nodeName}”？`}
                onConfirm={() => void deleteUnit(unit)}
              >
                <Tooltip title={`删除${nodeName}`}>
                  <Button
                    danger
                    aria-label={`删除${nodeName}`}
                    icon={<Trash2 size={13} />}
                    size="small"
                    type="text"
                  />
                </Tooltip>
              </Popconfirm>
            </>
          ) : null}
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
                  <strong>{target?.person.display_name || `人员 #${claim.roster_id}`}</strong>
                  <span>
                    {identityTargetKindLabels[claim.roster_kind] || '人员'} ·{' '}
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
              ? '输入你的姓名，找到与你本人对应的人员身份，提交后进入身份审批队列。'
              : '输入你的姓名，找到与你本人对应的人员身份，提交申请后组织管理员会处理绑定。'}
          </span>
        </div>
        <Input
          allowClear
          placeholder="输入姓名搜索人员"
          prefix={<Search size={14} />}
          value={identityClaimSearchText}
          onChange={(event) => setIdentityClaimSearchText(event.target.value)}
        />
        {!identityClaimSearchKeyword ? (
          <Empty
            description="请输入姓名搜索可申请的人员"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : searchedIdentityClaimTargets.length ? (
          searchedIdentityClaimTargets.map((target) => (
            <div className={styles.directoryIdentityItem} key={target.key}>
              <div className={styles.directoryIdentityItemMain}>
                <strong>{target.person.display_name}</strong>
                <span>
                  {identityTargetKindLabels[target.rosterKind] || '人员'} · {target.unitPath}
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
          <Empty description="没有匹配的教师或学生" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
              </div>
              <UnitTree
                activeAncestorIds={activeAncestorIds}
                canManage={canManage}
                peopleCountByUnitId={peopleCountByUnitId}
                renderNodeActions={renderTreeNodeActions}
                rootLabel={rootNodeLabel}
                rootUnit={organizationRootUnit}
                selectedUnitId={selectedUnitId}
                totalPeopleCount={rootPeople.length}
                unitDisplayName={unitDisplayName}
                units={units}
                onSelect={setSelectedUnitId}
              />
            </section>

            <section aria-label="当前节点工作区" className={styles.directoryPane}>
              <div className={styles.directoryPaneHeader}>
                <div>
                  <div className={styles.directoryBreadcrumb}>{selectedPathLabel}</div>
                  <div className={styles.directoryPaneTitle}>
                    {selectedUnit ? unitDisplayName(selectedUnit) : rootNodeLabel}
                  </div>
                  <div className={styles.directoryPaneMeta}>
                    <span>直属 {directPeople.length} 人</span>
                    <span>邀请中 {selectedNodePendingInvites} 个</span>
                    <span>当前显示 {directoryRows.length} 人</span>
                  </div>
                </div>
                <div className={styles.directoryNodeActions}>
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
                  <span>归属</span>
                  <span>权限</span>
                  <span>角色</span>
                  <span>账号</span>
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
                        </span>
                      </span>
                      <Tooltip title={row.primaryPath}>
                        <span className={styles.directoryCellText}>{row.primaryPath}</span>
                      </Tooltip>
                      <span className={styles.directoryRoleStack}>
                        <Tooltip
                          title={row.organizationRoleBadge.path || row.organizationRoleBadge.label}
                        >
                          <Tag
                            className={styles.directoryRoleTag}
                            data-tone={row.organizationRoleBadge.tone}
                          >
                            {row.organizationRoleBadge.label}
                          </Tag>
                        </Tooltip>
                      </span>
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
                          <Tag className={styles.directoryRoleTag}>待指定</Tag>
                        )}
                      </span>
                      <span className={styles.directoryCellText}>{row.accountLabel}</span>
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

            <Drawer
              destroyOnClose
              open={Boolean(selectedPerson)}
              size="default"
              title={selectedPerson ? `人员详情 #${selectedPerson.id}` : '人员详情'}
              onClose={() => setSelectedPersonId(null)}
            >
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
                    {canManage ? (
                      <Form
                        className={styles.directoryInlineForm}
                        form={personProfileForm}
                        layout="vertical"
                      >
                        <Form.Item
                          label="姓名"
                          name="display_name"
                          rules={[{ message: '请输入姓名', required: true }]}
                        >
                          <Input placeholder="姓名" />
                        </Form.Item>
                        <Form.Item label="邮箱" name="email" rules={[{ type: 'email' }]}>
                          <Input placeholder="邮箱" />
                        </Form.Item>
                        <Form.Item label="手机号" name="phone">
                          <Input placeholder="手机号" />
                        </Form.Item>
                        <Button
                          block
                          icon={<Save size={14} />}
                          loading={saving}
                          onClick={savePersonProfile}
                        >
                          保存资料
                        </Button>
                      </Form>
                    ) : (
                      <div className={styles.directoryInfoGrid}>
                        <span>手机号</span>
                        <strong>{selectedPerson.phone || '--'}</strong>
                        <span>邮箱</span>
                        <strong>{selectedPerson.email || '--'}</strong>
                      </div>
                    )}
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
                        <Tag className={styles.directoryRoleTag}>待指定</Tag>
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
                          rules={[{ message: '请选择角色范围', required: true }]}
                        >
                          <TreeSelect
                            showSearch
                            treeDefaultExpandAll
                            placeholder="角色范围"
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

                  {selectedPersonCanTeach ? (
                    <section className={styles.directoryDetailSection}>
                      <div className={styles.directoryDetailTitle}>任课班级</div>
                      <div className={styles.directoryInspectorTags}>
                        {selectedPersonTeachingAssignments.length ? (
                          selectedPersonTeachingAssignments.map((assignment) => (
                            <Tag
                              className={styles.directoryRoleTag}
                              data-tone="teacher"
                              key={assignment.id}
                            >
                              {unitPathLabel(assignment.class_org_unit_id)} /{' '}
                              {subjectNameById.get(assignment.subject_id) ||
                                `科目 #${assignment.subject_id}`}
                            </Tag>
                          ))
                        ) : (
                          <Tag className={styles.directoryRoleTag}>暂无任课班级</Tag>
                        )}
                      </div>
                      {canManage ? (
                        <Form
                          className={styles.directoryInlineForm}
                          form={teachingAssignmentForm}
                          initialValues={{ subject_id: selectedUnit?.subject_id || undefined }}
                          key={`teaching-${selectedPerson.id}-${selectedUnit?.subject_id || 'none'}`}
                          layout="vertical"
                        >
                          <Form.Item
                            name="class_org_unit_id"
                            rules={[{ message: '请选择任课班级', required: true }]}
                          >
                            <Select
                              showSearch
                              options={classUnitOptions}
                              placeholder="任课班级"
                            />
                          </Form.Item>
                          <Form.Item
                            name="subject_id"
                            rules={[{ message: '请选择任课学科', required: true }]}
                          >
                            <Select
                              showSearch
                              options={subjectOptions}
                              placeholder="任课学科"
                            />
                          </Form.Item>
                          <Button block loading={saving} onClick={createTeachingAssignment}>
                            添加任课关系
                          </Button>
                        </Form>
                      ) : null}
                    </section>
                  ) : null}

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

                  {canManage && selectedPerson.better_auth_user_id ? (
                    <section className={styles.directoryDetailSection}>
                      <div className={styles.directoryDetailTitle}>组织成员</div>
                      <div className={styles.directoryMetaLine}>
                        当前权限：
                        {selectedPersonOrganizationRole
                          ? organizationRoleLabels[selectedPersonOrganizationRole]
                          : '未同步'}
                      </div>
                      <div className={styles.directoryMetaLine}>
                        移出后该账号将失去当前组织访问权限，人员档案仍保留在目录中。
                      </div>
                      {selectedPersonCanRemoveOrganizationMember ? (
                        <Popconfirm
                          description="该操作不会删除人员档案，但会撤销账号的组织访问权。"
                          okText="移出组织"
                          okType="danger"
                          title={`确认将“${selectedPerson.display_name}”移出组织？`}
                          onConfirm={removeSelectedOrganizationMember}
                        >
                          <Button block danger icon={<Trash2 size={14} />} loading={saving}>
                            移出组织
                          </Button>
                        </Popconfirm>
                      ) : (
                        <>
                          <Button block danger disabled icon={<Trash2 size={14} />}>
                            移出组织
                          </Button>
                          {selectedPersonRemoveDisabledReason ? (
                            <div className={styles.directoryMetaLine}>
                              {selectedPersonRemoveDisabledReason}
                            </div>
                          ) : null}
                        </>
                      )}
                    </section>
                  ) : null}

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
                </div>
              ) : null}
            </Drawer>
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
