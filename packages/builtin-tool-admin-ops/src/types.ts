export const AdminOpsApiName = {
  bulkDeleteAcademicYearsExecute: 'bulkDeleteAcademicYearsExecute',
  bulkDeleteAcademicYearsPreview: 'bulkDeleteAcademicYearsPreview',
  bulkDeleteGradesExecute: 'bulkDeleteGradesExecute',
  bulkDeleteGradesPreview: 'bulkDeleteGradesPreview',
  bulkDeleteSchoolsExecute: 'bulkDeleteSchoolsExecute',
  bulkDeleteSchoolsPreview: 'bulkDeleteSchoolsPreview',
  bulkDeleteStudentsExecute: 'bulkDeleteStudentsExecute',
  bulkDeleteStudentsPreview: 'bulkDeleteStudentsPreview',
  bulkDeleteSubjectsExecute: 'bulkDeleteSubjectsExecute',
  bulkDeleteSubjectsPreview: 'bulkDeleteSubjectsPreview',
  createAcademicYear: 'createAcademicYear',
  createClass: 'createClass',
  createGrade: 'createGrade',
  createSchool: 'createSchool',
  createStudent: 'createStudent',
  createSubject: 'createSubject',
  createTeacher: 'createTeacher',
  deleteAcademicYear: 'deleteAcademicYear',
  deleteClass: 'deleteClass',
  deleteGrade: 'deleteGrade',
  deleteSchool: 'deleteSchool',
  deleteStudent: 'deleteStudent',
  deleteSubject: 'deleteSubject',
  deleteTeacher: 'deleteTeacher',
  importAcademicYears: 'importAcademicYears',
  importClasses: 'importClasses',
  importGrades: 'importGrades',
  importSchools: 'importSchools',
  importStudents: 'importStudents',
  importSubjects: 'importSubjects',
  importTeachers: 'importTeachers',
  listAcademicYears: 'listAcademicYears',
  listClasses: 'listClasses',
  listGrades: 'listGrades',
  listSchools: 'listSchools',
  listStudents: 'listStudents',
  listSubjects: 'listSubjects',
  listTeachers: 'listTeachers',
  sqlPatchExecute: 'sqlPatchExecute',
  sqlPatchPreview: 'sqlPatchPreview',
  updateAcademicYear: 'updateAcademicYear',
  updateClass: 'updateClass',
  updateGrade: 'updateGrade',
  updateSchool: 'updateSchool',
  updateStudent: 'updateStudent',
  updateSubject: 'updateSubject',
  updateTeacher: 'updateTeacher',
} as const;

export type ListParams = {
  after_id?: number;
  include_total?: boolean;
  page?: number;
  page_size?: number;
};

export type ListAcademicYearsParams = ListParams;

export type ListGradesParams = ListParams & {
  filters?: {
    education_level?: string;
  };
};

export type ListSubjectsParams = ListParams & {
  filters?: {
    subject_category?: string;
  };
};

export type ListSchoolsParams = ListParams & {
  filters?: {
    city?: string;
    province?: string;
  };
};

export type ListClassesParams = ListParams & {
  filters?: {
    academic_year_id?: number;
    grade?: string;
    school_id?: number;
  };
};

export type ListStudentsParams = ListParams & {
  filters?: {
    academic_year_id?: number;
    class_id?: number;
    grade?: string;
    school_id?: number;
  };
};

export type ListTeachersParams = ListParams & {
  filters?: {
    role?: 'TEACHER' | 'ADMIN' | 'PRINCIPAL';
    school_id?: number;
  };
};

export type CreateSchoolParams = {
  payload: {
    address?: string;
    city: string;
    contact_email?: string;
    contact_phone?: string;
    name: string;
    province: string;
    tags?: string[];
  };
};

export type UpdateSchoolParams = {
  patch: Partial<CreateSchoolParams['payload']>;
  school_id: number;
};

export type DeleteSchoolParams = { school_id: number };

export type CreateClassParams = {
  payload: {
    academic_year_id?: number;
    admission_year: number;
    education_level: string;
    graduation_year: number;
    name: string;
    school_id?: number;
  };
};

export type UpdateClassParams = {
  class_id: number;
  patch: Partial<CreateClassParams['payload']>;
};

export type DeleteClassParams = { class_id: number };

export type CreateTeacherParams = {
  payload: {
    password: string;
    real_name: string;
    role?: 'TEACHER' | 'ADMIN' | 'PRINCIPAL';
    school_id?: number;
    teacher_number?: string;
    username: string;
  };
};

export type UpdateTeacherParams = {
  patch: Partial<Omit<CreateTeacherParams['payload'], 'password'>>;
  teacher_id: number;
};

export type DeleteTeacherParams = { teacher_id: number };

export type CreateStudentParams = {
  payload: {
    class_id?: number;
    gender?: string;
    name: string;
    pinyin_name?: string;
    student_number: string;
  };
};

export type UpdateStudentParams = {
  patch: Partial<CreateStudentParams['payload']>;
  student_id: number;
};

export type DeleteStudentParams = { student_id: number };

export type OpenImportUiParams = Record<string, never>;

export type AcademicYearPayload = {
  end_date: string;
  name: string;
  start_date: string;
};

export type CreateAcademicYearParams = { payload: AcademicYearPayload };

export type UpdateAcademicYearParams = {
  academic_year_id: number;
  patch: Partial<AcademicYearPayload>;
};

export type DeleteAcademicYearParams = { academic_year_id: number };

export type BulkDeleteStudentsParams = {
  student_ids: number[];
};

export type BulkDeleteSchoolsParams = {
  school_ids: number[];
};

export type BulkDeleteAcademicYearsParams = {
  academic_year_ids: number[];
};

export type GradePayload = {
  education_level: string;
  grade_order: number;
  is_graduation_grade?: boolean;
  name: string;
};

export type CreateGradeParams = { payload: GradePayload };

export type UpdateGradeParams = { grade_id: number; patch: Partial<GradePayload> };

export type DeleteGradeParams = { grade_id: number };

export type BulkDeleteGradesParams = {
  grade_ids: number[];
};

export type SubjectPayload = {
  is_core_subject?: boolean;
  name: string;
  subject_category?: string | null;
};

export type CreateSubjectParams = { payload: SubjectPayload };

export type UpdateSubjectParams = { patch: Partial<SubjectPayload>; subject_id: number };

export type DeleteSubjectParams = { subject_id: number };

export type BulkDeleteSubjectsParams = {
  subject_ids: number[];
};

export type SqlPatchParams = {
  max_affected_rows: number;
  /**
   * The SQL statement to preview/execute.
   *
   * Use the placeholder `__TENANT_ID__` (recommended) and the executor will replace it
   * with the current Workbench tenant id (parsed from the presigned object key).
   */
  sql_text: string;
};
