import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ImportResolver } from 'xnl-core';
import { loadHalfcodeUnitBundle } from '../src';

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
      const names = new Set<string>();
      for (const filePath of Object.keys(files)) {
        if (filePath.startsWith(prefix)) names.add(filePath.slice(prefix.length).split('/')[0]);
      }
      return [...names];
    },
  };
}

const eagerChild = `<EagerDataFlow #demo.flow.Child apiVersion="depa.flows/v1" version="1" (
  <FlowContract #demo.flow.Child { inputPorts = [ "raw" ] outputPorts = [ "result" ] }>
) [
  <EntryNode #entry>
  <TransformNode #transform {
    inputs = { raw = "flow-port://#entry/raw" }
    outputs = [ "result" ]
    src = "vfs://./child.ts#transform"
  }>
  <ReturnNode #return { inputs = { result = "flow-port://#transform/result" } }>
]>`;

const eagerParent = `<EagerDataFlow #demo.flow.Parent apiVersion="depa.flows/v1" version="1" (
  <FlowContract #demo.flow.Parent { inputPorts = [ "raw" ] outputPorts = [ "result" ] }>
) [
  <EntryNode #entry>
  <SubFlowNode #child {
    flow = "eager-data-flow://demo.flow.Child"
    inputs = { raw = "flow-port://#entry/raw" }
  }>
  <ReturnNode #return { inputs = { result = "flow-port://#child/result" } }>
]>`;

describe('canonical Flow products in an AppBundle', () => {
  it('loads all four products through upstream source APIs and preserves nested control topology', () => {
    const bundle = loadHalfcodeUnitBundle(memoryResolver({
      '/flow/manifest.xnl': `<AppBundle #demo.flow.App (
        <Units [
          <Unit kind="instant-flow" fqn="demo.flow.Instant" src="vfs://./instant.xnl">
          <Unit kind="work-flow" fqn="demo.flow.Work" src="vfs://./work.xnl">
          <Unit kind="biz-process" fqn="demo.flow.Biz" src="vfs://./biz.xnl">
          <Unit kind="eager-data-flow" fqn="demo.flow.Parent" src="vfs://./parent.xnl">
          <Unit kind="eager-data-flow" fqn="demo.flow.Child" src="vfs://./child.xnl">
        ]>
      )>`,
      '/flow/instant.xnl': `<InstantFlow #demo.flow.Instant apiVersion="depa.flows/v1" version="1" (
        <FlowContract #demo.flow.Instant {
          input = "vfs://./instant.types.ts#DemoInstantInput"
          output = "vfs://./instant.types.ts#DemoInstantOutput"
        }>
      ) [
        <Return #done { value = { ok = true } }>
      ]>`,
      '/flow/instant.types.ts': `export interface DemoInstantInput { requestId?: string }
export interface DemoInstantOutput { ok: true }`,
      '/flow/work.xnl': `<WorkFlow #demo.flow.Work apiVersion="depa.flows/v1" version="1" (
        <FlowContract #demo.flow.Work {
          input = "vfs://./work.types.ts#DemoWorkInput"
          output = "vfs://./work.types.ts#DemoWorkOutput"
        }>
      ) [
        <If #route (
          <Branches [
            <Branch #approved { when = "vfs://./work.ts#approved" } [
              <Run #nested { src = "vfs://./work.ts#run" }>
            ]>
            <Otherwise [ <Return #fallback> ]>
          ]>
        )>
        <Return #done>
      ]>`,
      '/flow/work.types.ts': `export interface DemoWorkInput { approved?: boolean }
export interface DemoWorkOutput { status: 'completed' | 'fallback' }`,
      '/flow/biz.xnl': `<BizProcess #demo.flow.Biz apiVersion="depa.flows/v1" version="1" (
        <FlowContract #demo.flow.Biz {
          input = "vfs://./biz.types.ts#DemoBizInput"
          output = "vfs://./biz.types.ts#DemoBizOutput"
        }>
      ) [
        <TaskStep #review { task = "task-space://#review" }>
        <Return #done>
      ]>`,
      '/flow/biz.types.ts': `export interface DemoBizInput { reviewId?: string }
export interface DemoBizOutput { status: 'completed' }`,
      '/flow/parent.xnl': eagerParent,
      '/flow/child.xnl': eagerChild,
    }), 'vfs://@/flow/', { baseDir: '/', workspaceRoot: '/' });

    expect(bundle.diagnostics).toEqual([]);
    expect(Object.values(bundle.registry).map(({ kind }) => kind)).toEqual([
      'instant-flow',
      'work-flow',
      'biz-process',
      'eager-data-flow',
      'eager-data-flow',
    ]);

    const instant = bundle.units['demo.flow.Instant'].flow;
    const work = bundle.units['demo.flow.Work'].flow;
    const biz = bundle.units['demo.flow.Biz'].flow;
    const parent = bundle.units['demo.flow.Parent'].flow;
    expect([instant?.form, work?.form, biz?.form, parent?.form]).toEqual([
      'InstantFlow',
      'WorkFlow',
      'BizProcess',
      'EagerDataFlow',
    ]);
    expect([
      instant?.form === 'InstantFlow' ? instant.flowContract : undefined,
      work?.form === 'WorkFlow' ? work.flowContract : undefined,
      biz?.form === 'BizProcess' ? biz.flowContract : undefined,
    ]).toEqual([
      {
        id: 'demo.flow.Instant',
        input: 'vfs://./instant.types.ts#DemoInstantInput',
        output: 'vfs://./instant.types.ts#DemoInstantOutput',
      },
      {
        id: 'demo.flow.Work',
        input: 'vfs://./work.types.ts#DemoWorkInput',
        output: 'vfs://./work.types.ts#DemoWorkOutput',
      },
      {
        id: 'demo.flow.Biz',
        input: 'vfs://./biz.types.ts#DemoBizInput',
        output: 'vfs://./biz.types.ts#DemoBizOutput',
      },
    ]);

    if (work?.form !== 'WorkFlow') throw new Error('expected canonical WorkFlow spec');
    const branch = work.statements[0].sections.Branches.children[0];
    expect(branch).toMatchObject({ tag: 'Branch', id: 'approved' });
    expect(branch.children[0]).toMatchObject({ tag: 'Run', id: 'nested' });

    if (parent?.form !== 'EagerDataFlow') throw new Error('expected canonical EagerDataFlow plan');
    expect(parent.subflowEdges).toEqual([
      expect.objectContaining({
        fromFlowId: 'demo.flow.Parent',
        nodeId: 'child',
        targetFlowId: 'demo.flow.Child',
        ref: 'eager-data-flow://demo.flow.Child',
      }),
    ]);
    expect(parent.nodeById.child).toMatchObject({ outputs: ['result'] });
  });

  it('rejects removed Unit kinds before loading a source', () => {
    expect(() => loadHalfcodeUnitBundle(memoryResolver({
      '/flow/manifest.xnl': `<AppBundle #demo.flow.App (
        <Units [ <Unit kind="ctrl-flow" fqn="demo.flow.Legacy" src="vfs://./legacy.xnl"> ]>
      )>`,
      '/flow/legacy.xnl': '<CtrlFlow #demo.flow.Legacy []>',
    }), 'vfs://@/flow/', { baseDir: '/', workspaceRoot: '/' })).toThrow(
      /instant-flow\/work-flow\/biz-process\/eager-data-flow/,
    );
  });

  it('delegates old root and scheme rejection to upstream diagnostics', () => {
    const legacyRoots = loadHalfcodeUnitBundle(memoryResolver({
      '/flow/manifest.xnl': `<AppBundle #demo.flow.App (
        <Units [
          <Unit kind="instant-flow" fqn="demo.flow.LegacyCtrl" src="vfs://./ctrl.xnl">
          <Unit kind="eager-data-flow" fqn="demo.flow.LegacyData" src="vfs://./data.xnl">
        ]>
      )>`,
      '/flow/ctrl.xnl': '<CtrlFlow #demo.flow.LegacyCtrl [ <Return #done> ]>',
      '/flow/data.xnl': '<DataFlow #demo.flow.LegacyData []>',
    }), 'vfs://@/flow/', { baseDir: '/', workspaceRoot: '/' });

    expect(legacyRoots.diagnostics.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[legacy-ctrl-flow-root]'),
        expect.stringContaining('[legacy-data-flow-root]'),
      ]),
    );

    const legacyScheme = loadHalfcodeUnitBundle(memoryResolver({
      '/flow/manifest.xnl': `<AppBundle #demo.flow.App (
        <Units [ <Unit kind="eager-data-flow" fqn="demo.flow.BadRef" src="vfs://./bad.xnl"> ]>
      )>`,
      '/flow/bad.xnl': eagerParent
        .replaceAll('demo.flow.Parent', 'demo.flow.BadRef')
        .replace('eager-data-flow://demo.flow.Child', 'data-flow://demo.flow.Child'),
    }), 'vfs://@/flow/', { baseDir: '/', workspaceRoot: '/' });

    expect(legacyScheme.diagnostics.map(({ message }) => message)).toContainEqual(
      expect.stringContaining('[invalid-subflow-ref]'),
    );
  });

  it('contains no Halfcode-owned Flow compiler, topology validator, or linker', () => {
    const source = readFileSync(resolve(__dirname, '../src/xnlUnitBundle.ts'), 'utf8');
    expect(source).not.toMatch(
      /\b(compileFlowAuthoringPlan|validateDataFlowTopology|linkDataFlowPlans)\b/,
    );
  });
});
