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
  createAssignment: 'createAssignment',
  createClass: 'createClass',
  createGrade: 'createGrade',
  createQuestion: 'createQuestion',
  createSchool: 'createSchool',
  createStudent: 'createStudent',
  createSubject: 'createSubject',
  createSubmission: 'createSubmission',
  createSubmissionQuestion: 'createSubmissionQuestion',
  createTeacher: 'createTeacher',
  deleteAcademicYear: 'deleteAcademicYear',
  deleteAssignment: 'deleteAssignment',
  deleteClass: 'deleteClass',
  deleteGrade: 'deleteGrade',
  deleteQuestion: 'deleteQuestion',
  deleteSchool: 'deleteSchool',
  deleteStudent: 'deleteStudent',
  deleteSubject: 'deleteSubject',
  deleteSubmission: 'deleteSubmission',
  deleteSubmissionQuestion: 'deleteSubmissionQuestion',
  deleteTeacher: 'deleteTeacher',
  draftCreateManual: 'draftCreateManual',
  draftPublish: 'draftPublish',
  draftSave: 'draftSave',
  importAcademicYears: 'importAcademicYears',
  importClasses: 'importClasses',
  importGrades: 'importGrades',
  importSchools: 'importSchools',
  importStudents: 'importStudents',
  importSubjects: 'importSubjects',
  importTeachers: 'importTeachers',
  listAcademicYears: 'listAcademicYears',
  listAssignments: 'listAssignments',
  listClasses: 'listClasses',
  listGrades: 'listGrades',
  listQuestions: 'listQuestions',
  listSchools: 'listSchools',
  listStudents: 'listStudents',
  listSubjects: 'listSubjects',
  listSubmissionQuestions: 'listSubmissionQuestions',
  listSubmissions: 'listSubmissions',
  listTeachers: 'listTeachers',
  resolveEntity: 'resolveEntity',
  sqlPatchExecute: 'sqlPatchExecute',
  sqlPatchPreview: 'sqlPatchPreview',
  updateAcademicYear: 'updateAcademicYear',
  updateAssignment: 'updateAssignment',
  updateClass: 'updateClass',
  updateGrade: 'updateGrade',
  updateQuestion: 'updateQuestion',
  updateSchool: 'updateSchool',
  updateStudent: 'updateStudent',
  updateSubject: 'updateSubject',
  updateSubmission: 'updateSubmission',
  updateSubmissionQuestion: 'updateSubmissionQuestion',
  updateTeacher: 'updateTeacher',
} as const;

export type ListParams = {
  after_id?: number;
  include_total?: boolean;
  page?: number;
  page_size?: number;
};

export type ResolveEntityParams = {
  entity_type:
    | 'school'
    | 'subject'
    | 'grade'
    | 'teacher'
    | 'class'
    | 'student'
    | 'assignment'
    | 'question'
    | 'submission'
    | 'submission_question';
  limit?: number;
  query: string;
  scope?: {
    assignment_id?: number;
    class_id?: number;
    grade_id?: number;
    school_id?: number;
    student_id?: number;
    subject_id?: number;
    submission_id?: number;
    teacher_id?: number;
  };
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

export type ListAssignmentsParams = ListParams & {
  filters?: {
    grade_id?: number;
    subject_id?: number;
  };
};

export type ListQuestionsParams = ListParams & {
  filters?: {
    grade_id?: number;
    question_type?: 'single_choice' | 'multiple_choice' | 'fill_in_blank' | 'problem_solving';
    subject_id?: number;
  };
};

export type ListSubmissionsParams = ListParams & {
  filters?: {
    assignment_student_id?: number;
    status?: string;
  };
};

export type ListSubmissionQuestionsParams = ListParams & {
  filters?: {
    is_correct?: boolean;
    question_id?: number;
    submission_id?: number;
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

export type CsvImportDefaults = {
  academic_year_id?: number;
  city?: string;
  class_id?: number;
  education_level?: string;
  province?: string;
  role?: 'TEACHER' | 'ADMIN' | 'PRINCIPAL';
  school_id?: number;
  tags?: string[];
};

export type OpenImportUiParams = {
  /**
   * Optional CSV filename from conversation uploads.
   * If omitted, executor derives a filename from URL or entity type.
   */
  csvFileName?: string;
  /**
   * Optional CSV file URL from conversation uploads (`<file ... url="...">`).
   * If provided, the executor will fetch this file and start import directly.
   * If omitted, the executor opens the list page and lets the user click "Import CSV".
   */
  csvFileUrl?: string;
  defaults?: CsvImportDefaults;
};

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

export type AssignmentPayload = {
  assign_date?: string;
  created_by_teachers?: number[];
  creation_type?: string;
  due_date?: string;
  file_keys?: string[];
  grade_id: number;
  subject_id: number;
  title: string;
};

export type CreateAssignmentParams = { payload: AssignmentPayload };

export type UpdateAssignmentParams = {
  assignment_id: number;
  patch: Partial<AssignmentPayload>;
};

export type DeleteAssignmentParams = { assignment_id: number };

export type QuestionPayload = {
  answer: Record<string, unknown>;
  content: Record<string, unknown>;
  created_by_teachers?: number[];
  creation_type?: string;
  difficulty?: number | null;
  extra_data?: Record<string, unknown>;
  grade_id: number;
  knowledge_points?: string[];
  question_type: 'single_choice' | 'multiple_choice' | 'fill_in_blank' | 'problem_solving';
  subject_id: number;
  thinking?: Record<string, unknown> | null;
};

export type CreateQuestionParams = { payload: QuestionPayload };

export type UpdateQuestionParams = {
  patch: Partial<QuestionPayload>;
  question_id: number;
};

export type DeleteQuestionParams = { question_id: number };

export type SubmissionPayload = {
  assignment_student_id: number;
  file_keys?: string[];
  graded_at?: string | null;
  graded_by?: string | null;
  report_path?: string | null;
  score?: number | null;
  status?: string | null;
  submitted_at?: string | null;
  total_score?: number | null;
};

export type CreateSubmissionParams = { payload: SubmissionPayload };

export type UpdateSubmissionParams = {
  patch: Partial<SubmissionPayload>;
  submission_id: number;
};

export type DeleteSubmissionParams = { submission_id: number };

export type SubmissionQuestionPayload = {
  feedback?: string | null;
  is_correct?: boolean | null;
  max_score?: number | null;
  order_index: number;
  question_id?: number | null;
  score?: number | null;
  student_answer?: string | null;
  submission_id: number;
};

export type CreateSubmissionQuestionParams = { payload: SubmissionQuestionPayload };

export type UpdateSubmissionQuestionParams = {
  patch: Partial<SubmissionQuestionPayload>;
  submission_question_id: number;
};

export type DeleteSubmissionQuestionParams = { submission_question_id: number };

export type DraftCreateManualParams = {
  dueDate?: string;
  gradeId: number;
  subjectId: number;
  title: string;
};

export type DraftSaveParams = {
  draftArtifactId: string;
  dueDate?: string;
  questions: Record<string, unknown>[];
  title?: string;
};

export type DraftPublishParams = {
  draftArtifactId: string;
  target?: {
    classIds?: number[];
    studentIds?: number[];
  };
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
