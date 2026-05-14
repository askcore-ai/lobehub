import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskCoreWorkbenchRoute } from './index';

describe('AskCoreWorkbenchRoute assignment detail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders assignment recipients from nested backend student and classroom fields', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/askcore/workbench/assignments/501/detail') {
        return new Response(
          JSON.stringify({
            assignment: {
              assign_date: '2026-05-14T00:00:00Z',
              assignment_id: 501,
              created_at: '2026-05-14T00:00:00Z',
              creation_type: 'manual',
              due_date: '2026-05-21T00:00:00Z',
              grade_id: 3,
              subject_id: 7,
              title: '期中练习',
            },
            files: [],
            grade: { grade_id: 3, name: '高一' },
            questions: [],
            students: [
              {
                assigned_at: '2026-05-14T00:00:00Z',
                assignment_student_id: 9001,
                classroom: {
                  class_id: 201,
                  name: '高一 1 班',
                },
                status: 'assigned',
                student: {
                  name: '张三',
                  student_id: 1001,
                  student_number: 'S1001',
                },
              },
            ],
            subject: { name: '数学', subject_id: 7 },
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          has_more: false,
          items: [],
          next_after_id: null,
          page: 1,
          page_size: 100,
          total: 0,
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/askcore/workbench?tab=assignments&route=%2Fassignments%2F501']}>
        <AskCoreWorkbenchRoute />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('发布对象')).toBeInTheDocument());

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('高一 1 班')).toBeInTheDocument();
  });
});
