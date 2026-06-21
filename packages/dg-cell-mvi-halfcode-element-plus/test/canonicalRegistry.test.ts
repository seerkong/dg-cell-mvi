// @vitest-environment jsdom

import { createApp, defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import * as ElementPlus from 'element-plus';
import {
  DataTable,
  StatisticGroup,
  createElementPlusCanonicalRegistry,
  elementPlusCanonicalRegistry,
} from '../src/canonicalRegistry';

function mount(component: unknown, props: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = createApp(defineComponent({
    setup() {
      return () => h(component as any, props);
    },
  }));
  app.mount(target);
  return {
    target,
    unmount() {
      app.unmount();
      target.remove();
    },
  };
}

describe('Element Plus canonical registry', () => {
  it('resolves explicit canonical materials and default Element Plus exports', () => {
    expect(elementPlusCanonicalRegistry.resolve('DataTable')).toBe(DataTable);
    expect(elementPlusCanonicalRegistry.resolve('StatisticGroup')).toBe(StatisticGroup);
    expect(elementPlusCanonicalRegistry.resolve('ElButton')).toBe(ElementPlus.ElButton);
    const objectIdentity = { component: true };
    expect(elementPlusCanonicalRegistry.resolve(objectIdentity)).toBe(objectIdentity);
  });

  it('lets host overrides win without changing the default registry', () => {
    const Override = defineComponent({ setup: () => () => h('button', 'override') });
    const registry = createElementPlusCanonicalRegistry({
      extra: { ElButton: Override },
      materials: { DataTable: 'table-adapter' },
    });

    expect(registry.resolve('ElButton')).toBe(Override);
    expect(registry.resolve('DataTable')).toBe('table-adapter');
    expect(elementPlusCanonicalRegistry.resolve('DataTable')).toBe(DataTable);
  });

  it('renders DataTable from generic columns, rows, and summary props', () => {
    const rendered = mount(DataTable, {
      columns: [
        { field: 'name', label: 'Name' },
        { field: 'score', label: 'Score' },
      ],
      rows: [
        { id: 'u-1', name: 'Ada', score: 98 },
        { id: 'u-2', name: 'Lin', score: 76 },
      ],
      summary: { total: 2 },
    });

    try {
      expect(rendered.target.querySelectorAll('th')).toHaveLength(2);
      expect(rendered.target.textContent).toContain('Name');
      expect(rendered.target.textContent).toContain('Ada');
      expect(rendered.target.textContent).toContain('98');
      expect(rendered.target.textContent).toContain('total');
      expect(rendered.target.textContent).toContain('2');
    } finally {
      rendered.unmount();
    }
  });

  it('renders StatisticGroup from generic card props', () => {
    const rendered = mount(StatisticGroup, {
      cards: [
        { key: 'active', label: 'Active users', value: 2 },
        { key: 'inactive', label: 'Inactive users', value: 1 },
      ],
    });

    try {
      expect(rendered.target.querySelectorAll('article')).toHaveLength(2);
      expect(rendered.target.textContent).toContain('Active users');
      expect(rendered.target.textContent).toContain('Inactive users');
      expect(rendered.target.textContent).toContain('2');
      expect(rendered.target.textContent).toContain('1');
    } finally {
      rendered.unmount();
    }
  });
});
