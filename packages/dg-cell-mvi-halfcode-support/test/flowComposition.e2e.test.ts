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
import type {
  DurableChildFlowHandle,
  DurableChildFlowResolver,
  WorkFlowSnapshot,
  WorkFlowStore,
} from 'work-flow-contract';
import {
  createHalfcodeAppRuntime,
  loadHalfcodeUnitBundle,
  type BizProcessHandle,
  type InstantFlowHandle,
  type WorkFlowHandle,
} from '../src';

function memoryResolver(files: Record<string, string>): ImportResolver {
  const directories = new Set<string>(['/']);
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`/${parts.slice(0, index).join('/')}`);
    }
  }
  return {
    readFile: (path) => files[path] ?? null,
    isDir: (path) => directories.has(path.replace(/\/$/, '') || '/'),
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

  async load(treeId: string) {
    return this.snapshots.get(treeId);
  }

  async save(snapshot: WorkFlowSnapshot) {
    this.snapshots.set(snapshot.treeId, structuredClone(snapshot));
  }

  async remove(treeId: string) {
    this.snapshots.delete(treeId);
  }
}

class MemoryTaskSpaceStore implements TaskSpaceStore {
  private readonly spaces = new Map<string, TaskSpaceDTO>();

  async load(spaceId: string) {
    return this.spaces.get(spaceId);
  }

  async save(spaceId: string, space: TaskSpaceDTO) {
    this.spaces.set(spaceId, structuredClone(space));
  }

  async remove(spaceId: string) {
    this.spaces.delete(spaceId);
  }
}

class RecordingDurableChildren implements DurableChildFlowResolver {
  readonly starts: Array<{ reference: string; treeId: string; input: unknown }> = [];
  readonly inspections: Array<{ reference: string; treeId: string }> = [];
  nextStatus: DurableChildFlowHandle['status'] = 'Waiting';

  async start(reference: string, treeId: string, input: unknown): Promise<DurableChildFlowHandle> {
    this.starts.push({ reference, treeId, input });
    return { treeId, status: 'Waiting' };
  }

  async inspect(reference: string, treeId: string): Promise<DurableChildFlowHandle> {
    this.inspections.push({ reference, treeId });
    return { treeId, status: this.nextStatus, output: { child: 'done' } };
  }
}

const files = {
  '/flow/manifest.xnl': `<AppBundle #demo.flow.Composition (
    <Units [
      <Unit kind="instant-flow" fqn="demo.flow.InstantParent" src="vfs://./parents/instant/manifest.xnl">
      <Unit kind="instant-flow" fqn="demo.flow.InstantChild" src="vfs://./children/instant/manifest.xnl">
      <Unit kind="instant-flow" fqn="demo.flow.MismatchedParent" src="vfs://./parents/mismatch/manifest.xnl">
      <Unit kind="instant-flow" fqn="demo.flow.MissingParent" src="vfs://./parents/missing/manifest.xnl">
      <Unit kind="work-flow" fqn="demo.flow.WorkSyncParent" src="vfs://./parents/work-sync/manifest.xnl">
      <Unit kind="work-flow" fqn="demo.flow.WorkDurableParent" src="vfs://./parents/work-durable/manifest.xnl">
      <Unit kind="biz-process" fqn="demo.flow.BizSyncParent" src="vfs://./parents/biz-sync/manifest.xnl">
      <Unit kind="biz-process" fqn="demo.flow.BizDurableParent" src="vfs://./parents/biz-durable/manifest.xnl">
      <Unit kind="work-flow" fqn="demo.flow.DurableChild" src="vfs://./children/durable/manifest.xnl">
    ]>
  )>`,
  '/flow/parents/instant/manifest.xnl': controlFlow(
    'InstantFlow',
    'demo.flow.InstantParent',
    '<CallFlow #child { flow = "instant-flow://demo.flow.InstantChild" }>',
  ),
  '/flow/children/instant/manifest.xnl': controlFlow(
    'InstantFlow',
    'demo.flow.InstantChild',
    '<Return #done { src = "vfs://./child-code.ts#answer" }>',
  ),
  '/flow/parents/mismatch/manifest.xnl': controlFlow(
    'InstantFlow',
    'demo.flow.MismatchedParent',
    '<CallFlow #child { flow = "work-flow://demo.flow.InstantChild" }>',
  ),
  '/flow/parents/missing/manifest.xnl': controlFlow(
    'InstantFlow',
    'demo.flow.MissingParent',
    '<CallFlow #child { flow = "instant-flow://demo.flow.Absent" }>',
  ),
  '/flow/parents/work-sync/manifest.xnl': controlFlow(
    'WorkFlow',
    'demo.flow.WorkSyncParent',
    '<CallFlow #child { flow = "instant-flow://demo.flow.InstantChild" }>',
  ),
  '/flow/parents/work-durable/manifest.xnl': controlFlow(
    'WorkFlow',
    'demo.flow.WorkDurableParent',
    '<CallFlow #child { flow = "work-flow://demo.flow.DurableChild" }>',
  ),
  '/flow/parents/biz-sync/manifest.xnl': controlFlow(
    'BizProcess',
    'demo.flow.BizSyncParent',
    '<CallFlow #child { flow = "instant-flow://demo.flow.InstantChild" }>',
  ),
  '/flow/parents/biz-sync/task.space.xnl': '<TaskSpace #tasks version=1 []>',
  '/flow/parents/biz-durable/manifest.xnl': controlFlow(
    'BizProcess',
    'demo.flow.BizDurableParent',
    '<CallFlow #child { flow = "work-flow://demo.flow.DurableChild" }>',
  ),
  '/flow/parents/biz-durable/task.space.xnl': '<TaskSpace #tasks version=1 []>',
  '/flow/children/durable/manifest.xnl': controlFlow(
    'WorkFlow',
    'demo.flow.DurableChild',
    '<ExternalJob #hold { signalKind = "child.completed" signalKey = "hold" }>',
  ),
};

describe('Halfcode bundle-local Flow composition', () => {
  it('links InstantFlow CallFlow to the target unit code context and fails missing or mismatched refs explicitly', async () => {
    const { runtime, codeContexts } = await createRuntime();
    const parent = runtime.resolveFlow('demo.flow.InstantParent') as InstantFlowHandle;

    await expect(parent.invoke({ value: 4 })).resolves.toEqual({
      answer: 5,
      baseUri: '/flow/children/instant',
      scopeId: 'halfcode:host',
      unitFqn: 'demo.flow.InstantChild',
    });
    expect(codeContexts).toContainEqual({
      baseUri: '/flow/children/instant',
      reference: 'vfs://./child-code.ts#answer',
      unitFqn: 'demo.flow.InstantChild',
      unitPath: '/flow/children/instant/manifest.xnl',
    });

    const mismatch = runtime.resolveFlow('demo.flow.MismatchedParent') as InstantFlowHandle;
    await expect(mismatch.invoke()).rejects.toMatchObject({
      cause: {
        message: expect.stringMatching(
          /work-flow:\/\/demo\.flow\.InstantChild.*InstantFlow #demo\.flow\.InstantChild/,
        ),
      },
    });

    const missing = runtime.resolveFlow('demo.flow.MissingParent') as InstantFlowHandle;
    await expect(missing.invoke()).rejects.toMatchObject({
      cause: {
        message: expect.stringMatching(
          /instant-flow:\/\/demo\.flow\.Absent.*same AppBundle/,
        ),
      },
    });
  });

  it('supplies definition linking to durable engines for synchronous Instant children', async () => {
    const { runtime, codeContexts } = await createRuntime();
    const work = runtime.resolveFlow('demo.flow.WorkSyncParent') as WorkFlowHandle;
    const biz = runtime.resolveFlow('demo.flow.BizSyncParent') as BizProcessHandle;

    await expect(work.start('work-sync', { input: { value: 6 } })).resolves.toMatchObject({
      status: 'Completed',
    });
    await expect(biz.start('biz-sync', { input: { value: 7 } })).resolves.toMatchObject({
      status: 'Completed',
    });
    expect(codeContexts.filter(({ unitFqn }) => unitFqn === 'demo.flow.InstantChild')).toHaveLength(2);
  });

  it('forwards explicit durable child lifecycle dependencies and refresh on WorkFlow and BizProcess handles', async () => {
    const workChildren = new RecordingDurableChildren();
    const bizChildren = new RecordingDurableChildren();
    const { runtime } = await createRuntime({
      'demo.flow.WorkDurableParent': workChildren,
      'demo.flow.BizDurableParent': bizChildren,
    });
    const work = runtime.resolveFlow('demo.flow.WorkDurableParent') as WorkFlowHandle;
    const biz = runtime.resolveFlow('demo.flow.BizDurableParent') as BizProcessHandle;

    await expect(work.start('work-parent', { input: { requestId: 'work' } })).resolves.toMatchObject({
      status: 'Waiting',
    });
    await expect(biz.start('biz-parent', { input: { requestId: 'biz' } })).resolves.toMatchObject({
      status: 'Waiting',
    });
    expect(workChildren.starts).toEqual([
      expect.objectContaining({ reference: 'work-flow://demo.flow.DurableChild' }),
    ]);
    expect(bizChildren.starts).toEqual([
      expect.objectContaining({ reference: 'work-flow://demo.flow.DurableChild' }),
    ]);

    workChildren.nextStatus = 'Completed';
    bizChildren.nextStatus = 'Completed';
    await expect(work.refresh('work-parent')).resolves.toMatchObject({ status: 'Completed' });
    await expect(biz.refresh('biz-parent')).resolves.toMatchObject({ status: 'Completed' });
    expect(workChildren.inspections).toHaveLength(1);
    expect(bizChildren.inspections).toHaveLength(1);
  });
});

function controlFlow(
  form: 'InstantFlow' | 'WorkFlow' | 'BizProcess',
  fqn: string,
  statements: string,
): string {
  return `<${form} #${fqn} apiVersion="depa.flows/v1" version="1" (
    <FlowContract #${fqn}>
  ) [${statements}]>`;
}

async function createRuntime(
  durableChildren: Readonly<Record<string, DurableChildFlowResolver>> = {},
) {
  const bundle = loadHalfcodeUnitBundle(memoryResolver(files), 'vfs://@/flow/', {
    baseDir: '/',
    workspaceRoot: '/',
  });
  expect(bundle.diagnostics).toEqual([]);
  const codeContexts: Array<{
    baseUri?: string;
    reference: string;
    unitFqn: string;
    unitPath: string;
  }> = [];
  const workStores = new Map<string, MemoryWorkFlowStore>();
  const bizStores = new Map<string, MemoryWorkFlowStore>();
  const taskStores = new Map<string, MemoryTaskSpaceStore>();
  const runtime = await createHalfcodeAppRuntime(bundle, {
    resolveSymbol: () => undefined,
    flows: {
      resolveCode: (request, { unit }) => {
        codeContexts.push({
          baseUri: request.baseUri,
          reference: request.reference,
          unitFqn: unit.fqn,
          unitPath: unit.path,
        });
        if (!request.reference.endsWith('#answer')) {
          throw new Error(`Unexpected flow code ref: ${request.reference}`);
        }
        return (scopeRuntime, input) => ({
          answer: Number((input as { value: number }).value) + 1,
          baseUri: request.baseUri,
          scopeId: (scopeRuntime as { scopeId: string }).scopeId,
          unitFqn: unit.fqn,
        });
      },
      resolveWorkFlowDependencies: (unit) => ({
        store: getOrCreate(workStores, unit.fqn, () => new MemoryWorkFlowStore()),
        durableChildren: durableChildren[unit.fqn],
      }),
      resolveBizProcessDependencies: (unit) => ({
        store: getOrCreate(bizStores, unit.fqn, () => new MemoryWorkFlowStore()),
        taskStore: getOrCreate(taskStores, unit.fqn, () => new MemoryTaskSpaceStore()),
        tasks: { applyOperation, findNode, findTask, isOperable, listTasks, terminalStatusOf },
        durableChildren: durableChildren[unit.fqn],
      }),
    },
  });
  return { codeContexts, runtime };
}

function getOrCreate<TKey, TValue>(
  values: Map<TKey, TValue>,
  key: TKey,
  create: () => TValue,
): TValue {
  const existing = values.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  values.set(key, value);
  return value;
}
