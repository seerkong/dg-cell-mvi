import { defineComponent, h, type PropType } from 'vue';
import * as ElementPlus from 'element-plus';

interface CanonicalComponentRegistry {
  resolve(identity: unknown): unknown;
}

export interface DataTableColumn {
  field?: string;
  key?: string;
  prop?: string;
  label?: string;
  title?: string;
}

export interface StatisticCard {
  id?: string;
  key?: string;
  label?: string;
  title?: string;
  value?: unknown;
}

export interface SelectOption {
  label?: unknown;
  value?: unknown;
  disabled?: boolean;
}

export const Select = defineComponent({
  name: 'HalfcodeElementPlusSelect',
  inheritAttrs: false,
  props: {
    options: { type: Array as PropType<Array<SelectOption | string | number>>, required: false },
  },
  setup(props, { attrs }) {
    return () => h(ElementPlus.ElSelect as any, attrs as any, {
      default: () => [
        ...(props.options ?? []).map((option) => h(ElementPlus.ElOption as any, selectOptionProps(option))),
      ],
    });
  },
});

export const DataTable = defineComponent({
  name: 'HalfcodeElementPlusDataTable',
  props: {
    columns: { type: Array as PropType<DataTableColumn[]>, required: false },
    rows: { type: Array as PropType<Record<string, unknown>[]>, required: false },
    summary: { type: Object as PropType<Record<string, unknown>>, required: false },
  },
  setup(props) {
    return () => {
      const columns = props.columns ?? [];
      const rows = props.rows ?? [];
      return h('section', { class: 'dg-halfcode-data-table' }, [
        h('table', { class: 'dg-halfcode-data-table__table' }, [
          h('thead', [
            h('tr', columns.map((column) =>
              h('th', { key: columnKey(column) }, columnLabel(column)))),
          ]),
          h('tbody', rows.map((row, rowIndex) =>
            h('tr', { key: rowKey(row, rowIndex) }, columns.map((column) =>
              h('td', { key: columnKey(column) }, formatValue(row[columnField(column)]))))),
          ),
        ]),
        props.summary
          ? h('dl', { class: 'dg-halfcode-data-table__summary' },
              Object.entries(props.summary).map(([key, value]) => [
                h('dt', { key: `${key}-label` }, key),
                h('dd', { key: `${key}-value` }, formatValue(value)),
              ]),
            )
          : null,
      ]);
    };
  },
});

export const StatisticGroup = defineComponent({
  name: 'HalfcodeElementPlusStatisticGroup',
  props: {
    cards: { type: Array as PropType<StatisticCard[]>, required: false },
  },
  setup(props) {
    return () => h('section', { class: 'dg-halfcode-statistic-group' },
      (props.cards ?? []).map((card, index) =>
        h('article', { key: card.id ?? card.key ?? index, class: 'dg-halfcode-statistic-group__card' }, [
          h('div', { class: 'dg-halfcode-statistic-group__label' }, card.label ?? card.title ?? card.key ?? card.id),
          h('strong', { class: 'dg-halfcode-statistic-group__value' }, formatValue(card.value)),
        ]),
      ),
    );
  },
});

export const elementPlusCanonicalMaterials = {
  DataTable,
  StatisticGroup,
  Select,
};

export interface ElementPlusCanonicalRegistryOptions {
  extra?: Record<string, unknown>;
  elementPlus?: Record<string, unknown>;
  materials?: Record<string, unknown>;
}

export function createElementPlusCanonicalRegistry(
  options: ElementPlusCanonicalRegistryOptions = {},
): CanonicalComponentRegistry {
  const elementPlus = options.elementPlus ?? (ElementPlus as Record<string, unknown>);
  const materials: Record<string, unknown> = {
    ...elementPlusCanonicalMaterials,
    ...(options.materials ?? {}),
  };
  const aliases: Record<string, unknown> = {
    Page: 'div',
    ElFormLcd: elementPlus.ElForm,
    ElFormItemRender: elementPlus.ElFormItem,
  };

  return {
    resolve(identity) {
      if (typeof identity !== 'string') return identity;
      if (Object.prototype.hasOwnProperty.call(options.extra ?? {}, identity)) {
        return options.extra?.[identity];
      }
      if (Object.prototype.hasOwnProperty.call(materials, identity)) {
        return materials[identity];
      }
      if (Object.prototype.hasOwnProperty.call(aliases, identity)) {
        return aliases[identity];
      }
      if (identity === 'ElSelect') return Select;
      return elementPlus[identity] ?? identity;
    },
  };
}

export const elementPlusCanonicalRegistry = createElementPlusCanonicalRegistry();

function columnField(column: DataTableColumn): string {
  return String(column.field ?? column.key ?? column.prop ?? '');
}

function columnKey(column: DataTableColumn): string {
  return columnField(column) || String(column.label ?? column.title ?? '');
}

function columnLabel(column: DataTableColumn): string {
  return String(column.label ?? column.title ?? columnField(column));
}

function rowKey(row: Record<string, unknown>, index: number): string | number {
  const id = row.id ?? row.key;
  return typeof id === 'string' || typeof id === 'number' ? id : index;
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function selectOptionProps(option: SelectOption | string | number): Record<string, unknown> {
  if (typeof option === 'string' || typeof option === 'number') {
    return { key: option, label: String(option), value: option };
  }
  const value = option.value ?? option.label ?? '';
  return {
    ...option,
    key: String(value),
    label: String(option.label ?? value),
    value,
  };
}
