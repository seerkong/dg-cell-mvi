import { describe, expect, it } from 'vitest';
import type { ImportResolver } from 'xnl-core';
import type { TaskSpaceDTO, TaskSpaceStore } from 'task-manager-contract';
import {
  applyOperation,
  findNode,
  findTask,
  isOperable,
  listTasks,
  terminalStatusOf,
} from 'task-manager-logic';
import type { WorkFlowSnapshot, WorkFlowStore } from 'work-flow-contract';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  type BizProcessHandle,
  type EagerDataFlowHandle,
  type InstantFlowHandle,
  type WorkFlowHandle,
} from '../src';

function memoryResolver(files: Record<string, string>): ImportResolver {
  const dirs = new Set<string>(['/']);
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      dirs.add(`/${parts.slice(0, index).join('/')}`);
    }
  }
  return {
    readFile: (path) => files[path] ?? null,
    isDir: (path) => dirs.has(path.replace(/\/$/, '') || '/'),
    readDir: (path) => {
      const prefix = `${path.replace(/\/$/, '')}/`;
      return [...new Set(Object.keys(files)
        .filter((filePath) => filePath.startsWith(prefix))
        .map((filePath) => filePath.slice(prefix.length).split('/')[0]))];
    },
  };
}

class MemoryWorkFlowStore implements WorkFlowStore {
  private readonly snapshots = new Map<string, WorkFlowSnapshot>();
  async load(treeId: string) { return this.snapshots.get(treeId); }
  async save(snapshot: WorkFlowSnapshot) { this.snapshots.set(snapshot.treeId, structuredClone(snapshot)); }
  async remove(treeId: string) { this.snapshots.delete(treeId); }
}

class MemoryTaskSpaceStore implements TaskSpaceStore {
  private readonly spaces = new Map<string, TaskSpaceDTO>();
  async load(spaceId: string) { return this.spaces.get(spaceId); }
  async save(spaceId: string, space: TaskSpaceDTO) { this.spaces.set(spaceId, structuredClone(space)); }
  async remove(spaceId: string) { this.spaces.delete(spaceId); }
}

const files = {
  '/flow/manifest.xnl': `<AppBundle #demo.flow.Runtime apiVersion="halfcode.dg-cell-mvi/v1" version="1" (
    <Units [
      <Unit kind="instant-flow" fqn="demo.flow.Instant" src="vfs://./instant.xnl">
      <Unit kind="eager-data-flow" fqn="demo.flow.Eager" src="vfs://./eager.xnl">
      <Unit kind="work-flow" fqn="demo.flow.Work" src="vfs://./work.xnl">
      <Unit kind="biz-process" fqn="demo.flow.Biz" src="vfs://./biz/manifest.xnl">
      <Unit kind="page" fqn="demo.flow.Page" src="vfs://./page/manifest.xnl">
    ]>
  )>`,
  '/flow/instant.xnl': `<InstantFlow #demo.flow.Instant apiVersion="depa.flows/v1" version="1" (
    <FlowContract #demo.flow.Instant {
      input = "vfs://./instant.types.ts#DemoInstantInput"
      output = "vfs://./instant.types.ts#DemoInstantOutput"
    }>
  ) [
    <Return #done { src = "vfs://./instant.ts#answer" }>
  ]>`,
  '/flow/instant.types.ts': `export interface DemoInstantInput { value: number }
export interface DemoInstantOutput { answer: number; scopeId: string }`,
  '/flow/eager.xnl': `<EagerDataFlow #demo.flow.Eager apiVersion="depa.flows/v1" version="1" (
    <FlowContract #demo.flow.Eager { inputPorts = [ "value" ] outputPorts = [ "result" ] }>
  ) [
    <EntryNode #entry>
    <TransformNode #double {
      inputs = { value = "flow-port://#entry/value" }
      outputs = [ "result" ]
      src = "vfs://./eager.ts#double"
    }>
    <ReturnNode #return { inputs = { result = "flow-port://#double/result" } }>
  ]>`,
  '/flow/work.xnl': `<WorkFlow #demo.flow.Work apiVersion="depa.flows/v1" version="1" (
    <FlowContract #demo.flow.Work {
      input = "vfs://./work.types.ts#DemoWorkInput"
      output = "vfs://./work.types.ts#DemoWorkOutput"
    }>
  ) [
    <CallFlow #scope-check { flow = "instant-flow://demo.flow.Instant" }>
    <ExternalJob #hold { signalKind = "job.completed" signalKey = "hold" }>
    <Return #done>
  ]>`,
  '/flow/work.types.ts': `export interface DemoWorkInput { requestId?: string }
export interface DemoWorkOutput { status: 'Completed' }`,
  '/flow/biz/manifest.xnl': `<BizProcess #demo.flow.Biz apiVersion="depa.flows/v1" version="1" (
    <FlowContract #demo.flow.Biz {
      input = "vfs://./biz.types.ts#DemoBizInput"
      output = "vfs://./biz.types.ts#DemoBizOutput"
    }>
  ) [
    <CallFlow #scope-check { flow = "instant-flow://demo.flow.Instant" }>
    <TaskStep #review-step { task = "task-space://#review" }>
    <Return #done>
  ]>`,
  '/flow/biz/biz.types.ts': `export interface DemoBizInput { requestId?: string }
export interface DemoBizOutput { status: 'Completed' }`,
  '/flow/biz/task.space.xnl': `<TaskSpace #biz-tasks version=1 [
    <Task #review { name = "Review" ownerAccount = "user:reviewer" status = "NotStarted" order = 0 }>
  ]>`,
  '/flow/page/manifest.xnl': '<Page #demo.flow.Page version="1">',
  '/flow/page/elements.xnl': `<Elements #page-elements (
    <Scope ref="page-scope">
  ) [
    <h1 #title { text = "Flow Page" }>
  ]>`,
  '/flow/page/scopes.xnl': '<Scopes #page-scopes [ <Scope #page-scope> ]>',
};

describe('Halfcode AppRuntime Flow handles', () => {
  it('executes InstantFlow and EagerDataFlow handles with the bound runtime', async () => {
    const { flowExecutions, runtime } = await createRuntime();
    const instant = runtime.resolveFlow('demo.flow.Instant') as InstantFlowHandle;
    const eager = runtime.resolveFlow('demo.flow.Eager') as EagerDataFlowHandle;

    expect(Object.keys(runtime.flows).sort()).toEqual([
      'demo.flow.Biz', 'demo.flow.Eager', 'demo.flow.Instant', 'demo.flow.Work',
    ]);
    expect([instant.kind, eager.kind]).toEqual(['instant-flow', 'eager-data-flow']);
    expect(instant.spec.flowContract).toEqual({
      id: 'demo.flow.Instant',
      input: 'vfs://./instant.types.ts#DemoInstantInput',
      output: 'vfs://./instant.types.ts#DemoInstantOutput',
    });
    await expect(instant.invoke({ value: 5 })).resolves.toEqual({ answer: 6, scopeId: 'halfcode:host' });
    await expect(eager.invoke({ value: 5 })).resolves.toEqual({ result: 10 });
    const scopedInstant = runtime.resolveFlow('demo.flow.Instant', {
      unitFqn: 'demo.flow.Page',
      scopeId: 'page-scope',
    }) as InstantFlowHandle;
    const scopedEager = runtime.resolveFlow('demo.flow.Eager', {
      unitFqn: 'demo.flow.Page',
      scopeId: 'page-scope',
    }) as EagerDataFlowHandle;
    await expect(scopedInstant.invoke({ value: 8 })).resolves.toEqual({
      answer: 9,
      scopeId: 'page-scope',
    });
    await expect(scopedEager.invoke({ value: 7 })).resolves.toEqual({ result: 14 });
    expect(flowExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'vfs://./instant.ts#answer', scopeId: 'page-scope' }),
      expect.objectContaining({ reference: 'vfs://./eager.ts#double', scopeId: 'page-scope' }),
    ]));
  });

  it('constructs lifecycle handles with injected stores, clock and task operations', async () => {
    const { flowExecutions, runtime } = await createRuntime();
    const work = runtime.resolveFlow('demo.flow.Work') as WorkFlowHandle;
    const biz = runtime.resolveFlow('demo.flow.Biz') as BizProcessHandle;
    const scopedWork = runtime.resolveFlow('demo.flow.Work', {
      unitFqn: 'demo.flow.Page',
      scopeId: 'page-scope',
    }) as WorkFlowHandle;
    const scopedBiz = runtime.resolveFlow('demo.flow.Biz', {
      unitFqn: 'demo.flow.Page',
      scopeId: 'page-scope',
    }) as BizProcessHandle;

    expect(work.spec.flowContract).toEqual({
      id: 'demo.flow.Work',
      input: 'vfs://./work.types.ts#DemoWorkInput',
      output: 'vfs://./work.types.ts#DemoWorkOutput',
    });
    expect(biz.spec.flowContract).toEqual({
      id: 'demo.flow.Biz',
      input: 'vfs://./biz.types.ts#DemoBizInput',
      output: 'vfs://./biz.types.ts#DemoBizOutput',
    });

    const waiting = await work.start('work-1', { input: { value: 1 } });
    expect(waiting.status).toBe('Waiting');
    expect(typeof work.refresh).toBe('function');
    expect(typeof work.fireDueDeadlines).toBe('function');
    const wait = waiting.openWaitHandles[0];
    await expect(work.resume('work-1', {
      signalKind: wait.signalKind,
      signalKey: wait.signalKey,
      resumeToken: wait.resumeToken,
    })).resolves.toMatchObject({ status: 'Completed' });
    await expect(work.getOutcome('work-1')).resolves.toMatchObject({
      openWaitHandles: [],
      tickNo: 2,
    });

    await expect(biz.start('biz-1', { input: { value: 2 } })).resolves.toMatchObject({ status: 'Waiting' });
    expect(typeof biz.refresh).toBe('function');
    await expect(biz.tasks('biz-1')).resolves.toEqual([
      expect.objectContaining({ id: 'review', status: 'Active' }),
    ]);
    await expect(biz.operateTask('biz-1', {
      taskId: 'review',
      operation: 'complete',
      operatorAccount: 'user:reviewer',
    })).resolves.toMatchObject({
      taskStatus: 'Done',
      advancedFlow: true,
      outcome: { status: 'Completed' },
    });
    await expect(biz.getOutcome('biz-1')).resolves.toMatchObject({ openWaitHandles: [] });

    await expect(scopedWork.start('work-page-scope', { input: { value: 3 } })).resolves.toMatchObject({
      status: 'Waiting',
    });
    await expect(scopedBiz.start('biz-page-scope', { input: { value: 4 } })).resolves.toMatchObject({
      status: 'Waiting',
    });
    expect(flowExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'vfs://./instant.ts#answer', scopeId: 'halfcode:host' }),
      expect.objectContaining({ reference: 'vfs://./instant.ts#answer', scopeId: 'page-scope' }),
    ]));
  });
});

async function createRuntime() {
  const flowExecutions: Array<{ reference: string; scopeId: string }> = [];
  const bundle = loadHalfcodeUnitBundle(memoryResolver(files), 'vfs://@/flow/', {
    baseDir: '/',
    workspaceRoot: '/',
  });
  expect(bundle.diagnostics).toEqual([]);
  const runtime = await createHalfcodeAppRuntime(bundle, {
    resolveSymbol: () => undefined,
    flows: {
      resolveCode: async (request) => {
        if (request.reference.endsWith('#answer')) {
          return (runtime, input) => {
            flowExecutions.push({
              reference: request.reference,
              scopeId: (runtime as { scopeId: string }).scopeId,
            });
            return {
              answer: Number((input as { value: number }).value) + 1,
              scopeId: (runtime as { scopeId: string }).scopeId,
            };
          };
        }
        if (request.reference.endsWith('#double')) {
          return (runtime, input) => {
            flowExecutions.push({
              reference: request.reference,
              scopeId: (runtime as { scopeId: string }).scopeId,
            });
            return { result: Number((input as { value: number }).value) * 2 };
          };
        }
        throw new Error(`Unexpected flow code ref: ${request.reference}`);
      },
      resolveWorkFlowDependencies: () => ({
        store: new MemoryWorkFlowStore(),
        clock: { now: () => 1234 },
      }),
      resolveBizProcessDependencies: () => ({
        store: new MemoryWorkFlowStore(),
        taskStore: new MemoryTaskSpaceStore(),
        tasks: { applyOperation, findNode, findTask, isOperable, listTasks, terminalStatusOf },
        clock: { now: () => 1234 },
      }),
    },
  });
  return { flowExecutions, runtime };
}
