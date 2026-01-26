export const HelloPluginApiName = {
  helloRun: 'helloRun',
  helloSave: 'helloSave',
} as const;

export type HelloRunParams = {
  message: string;
};

export type HelloSaveParams = {
  baseArtifactId: string;
  content: Record<string, unknown>;
  expectedLatestArtifactId: string;
};
