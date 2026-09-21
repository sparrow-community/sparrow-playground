// Copyright 2026 The Sparrow community and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Browser host API exposed as globalThis.sparrow after the WASM module loads.
 * Authoritative contract for Playground and other JS consumers.
 */
export interface SparrowEngine {
  /**
   * On failure the WASM host returns `{ $error: string }` instead of throwing;
   * the Playground wrapper turns that into a thrown Error.
   */
  deploy(bpmnXml: string): { deploymentId: string; processId: string };
  createInstance(req: {
    deploymentId?: string;
    processId?: string;
    processVersion?: number;
    variables?: Record<string, unknown>;
  }): { instanceId: string };
  complete(req: {
    instanceId: string;
    elementId: string;
    tokenId: string;
    variables?: Record<string, unknown>;
  }): { ok: boolean };
  throwError(req: {
    instanceId: string;
    elementId: string;
    tokenId: string;
    errorCode: string;
  }): { ok: boolean };
  resolveIncident(req: {
    instanceId: string;
    elementId: string;
    tokenId: string;
  }): { ok: boolean };
  fireDue(): { ok: boolean };
  /** Earliest armed timer due (unix ms), or 0 if none. */
  nextDueUnixMs(): number;
  /** Inject engine clock; pass 0/null/undefined to restore Date.now. */
  setNowUnixMs(ms?: number | null): { ok: boolean; nowUnixMs?: number };
  publishMessage(req: {
    name: string;
    instanceId?: string;
    correlationKeys?: Record<string, unknown>;
    variables?: Record<string, unknown>;
  }): { delivered: number };
  publishSignal(req: {
    name: string;
    instanceId?: string;
    variables?: Record<string, unknown>;
  }): { delivered: number };
  evaluateConditions(req: {
    instanceId?: string;
    variables?: Record<string, unknown>;
  }): { fired: number };
  evaluateConditionalStarts(req: {
    deploymentId?: string;
    processId?: string;
    processVersion?: number;
    variables?: Record<string, unknown>;
  }): { started: number };
  /** wait is ignored (forced to 0) in the browser host. */
  activate(req: {
    jobType: string;
    maxJobs?: number;
    workerId?: string;
    lockDurationMs?: number;
  }): { jobs: SparrowJob[] };
  fail(req: {
    instanceId: string;
    elementId: string;
    tokenId: string;
    message?: string;
    noRetry?: boolean;
  }): { ok: boolean };
  heartbeat(req: {
    instanceId: string;
    tokenId: string;
    workerId?: string;
    lockDurationMs?: number;
  }): { ok: boolean };
  getDeployment(deploymentId: string): {
    deploymentId: string;
    processId: string;
    bpmnXml: string;
  };
  getInstance(instanceId: string): SparrowInstance;
  listInstanceIds(): string[];
  listEvents(instanceId: string): { events: unknown[] };
}

export interface SparrowJob {
  jobType: string;
  instanceId: string;
  deploymentId: string;
  elementId: string;
  tokenId: string;
  variables: Record<string, string>;
  workerId: string;
  lockDeadline: number;
  scriptFormat: string;
  script: string;
}

export interface SparrowInstance {
  instanceId: string;
  deploymentId: string;
  processId: string;
  version: number;
  status: string;
  parentProcessInstanceId?: string;
  parentElementId?: string;
  parentTokenId?: string;
  variables: Record<string, string>;
  tokens: Record<string, SparrowToken>;
  elementIntent: Record<string, string>;
}

export interface SparrowToken {
  id: string;
  elementId: string;
  status: string;
  jobType?: string;
  dueUnixMs?: number;
  timerText?: string;
  messageName?: string;
  signalName?: string;
  boundaryId?: string;
  scopeHost?: boolean;
  calledProcessInstanceId?: string;
  loopInstanceIndex?: number;
  multiInstanceHost?: boolean;
  boundaryWaits?: Array<{
    boundaryId: string;
    kind: string;
    dueUnixMs: number;
    timerText?: string;
    messageName?: string;
    signalName?: string;
  }>;
  jobFailCount?: number;
  incidentErrorMessage?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var sparrow: SparrowEngine | undefined;
}

export {};
