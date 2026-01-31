export const AssignmentAuthoringApiName = {
  draftCreateManual: 'draftCreateManual',
  draftPublish: 'draftPublish',
  draftSave: 'draftSave',
} as const;

export interface DraftCreateManualParams {
  dueDate?: string;
  gradeId: number;
  subjectId: number;
  title: string;
}

export interface DraftSaveParams {
  draftArtifactId: string;
  dueDate?: string;
  questions: Record<string, unknown>[];
  title?: string;
}

export interface DraftPublishParams {
  draftArtifactId: string;
  target?: { classIds?: number[]; studentIds?: number[] };
}
