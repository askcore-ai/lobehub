'use client';

import { Flexbox } from '@lobehub/ui';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { memo, useMemo } from 'react';

export type HelloTableContent = {
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
};

export const HelloTableList = memo<{ content: HelloTableContent }>(({ content }) => {
  const columns = Array.isArray(content.columns) ? content.columns : [];
  const rows = Array.isArray(content.rows) ? content.rows : [];
  return (
    <Typography.Text type="secondary">
      {rows.length} rows · {columns.length} cols
    </Typography.Text>
  );
});

export const HelloTableDetail = memo<{ content: HelloTableContent }>(({ content }) => {
  const columns = Array.isArray(content.columns) ? content.columns : [];
  const rows = Array.isArray(content.rows) ? content.rows : [];

  const tableColumns = useMemo<ColumnsType<Record<string, unknown>>>(() => {
    return columns.map((key) => ({
      dataIndex: key,
      key,
      title: key,
    }));
  }, [columns]);

  return (
    <Flexbox gap={8}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        Hello Table
      </Typography.Title>
      <Table
        columns={tableColumns}
        dataSource={rows.map((row, idx) => ({ _rowKey: String(idx), ...row }))}
        pagination={false}
        rowKey={(row) => String((row as any)._rowKey)}
        size="small"
      />
    </Flexbox>
  );
});

export default HelloTableDetail;
