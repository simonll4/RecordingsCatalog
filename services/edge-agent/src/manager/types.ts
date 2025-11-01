export type SupervisorState = "idle" | "starting" | "running" | "stopping" | "error";

export type Overrides = {
  classesFilter: string[];
};

export type SupervisorLastExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  at: string;
  reason?: string;
};

export type ManagerSnapshot = {
  state: SupervisorState;
  lastStartTs: string | null;
  lastStopTs: string | null;
  lastExit: SupervisorLastExit | null;
  childPid: number | null;
  childUptimeMs: number | null;
  statusPort: number;
  overrides: Overrides;
};
