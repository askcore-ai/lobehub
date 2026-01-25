export const WorkbenchDemoApiName = {
  startDemoTask: 'startDemoTask',
} as const;

export type StartDemoTaskParams = {
  note?: string;
};
