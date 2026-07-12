import { type SchoolIntegrationOperations, type SchoolPortalManifest } from './types';

export const SCHOOL_PORTAL_API = '/api/askcore/school/portal';
export const SCHOOL_OPERATIONS_API = '/api/askcore/school/operations';

export class SchoolPortalApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SchoolPortalApiError';
    this.status = status;
  }
}

export const fetchSchoolPortalManifest = async (): Promise<SchoolPortalManifest> => {
  const response = await fetch(SCHOOL_PORTAL_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '学校连接暂不可用');
  }
  return response.json() as Promise<SchoolPortalManifest>;
};

export const fetchSchoolIntegrationOperations = async (): Promise<SchoolIntegrationOperations> => {
  const response = await fetch(SCHOOL_OPERATIONS_API, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new SchoolPortalApiError(response.status, '集成状态暂不可用');
  }
  return response.json() as Promise<SchoolIntegrationOperations>;
};
