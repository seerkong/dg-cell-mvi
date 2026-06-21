<template>
  <div class="halfcode-unit-bundles">
    <el-alert v-if="loadError" type="error" :title="loadError" show-icon :closable="false" />

    <template v-else-if="preview">
      <header class="page-head">
        <div>
          <h1>v3 分层单元 Bundle · {{ preview.bundleId }}</h1>
          <p>{{ preview.productName }} · loader → compileHalfcodeUnitBundle → plans</p>
        </div>
        <el-tag type="success" effect="plain">xnl-bundles/basic-admin</el-tag>
      </header>

      <el-alert
        v-for="diagnostic in preview.diagnostics"
        :key="`${diagnostic.source}:${diagnostic.code}:${diagnostic.message}`"
        :type="diagnostic.severity === 'error' ? 'error' : 'warning'"
        :title="`[${diagnostic.source}] ${diagnostic.code}: ${diagnostic.message}`"
        show-icon
        :closable="false"
      />

      <section class="plan-section">
        <div class="section-head">
          <h2>AdminShellPlanV3 · 路由</h2>
          <span>{{ preview.routes.length }} routes（嵌套已展开）</span>
        </div>
        <el-table :data="preview.routes" size="small" row-key="id">
          <el-table-column label="route">
            <template #default="{ row }">
              <span :style="{ paddingLeft: `${row.depth * 18}px` }">#{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="path" label="path" />
          <el-table-column prop="title" label="title（覆盖/回落已解析）" />
          <el-table-column prop="pageFqn" label="page FQN" />
          <el-table-column prop="menu" label="menu" />
          <el-table-column prop="permissionRef" label="permissionRef" />
        </el-table>
      </section>

      <section class="plan-section">
        <div class="section-head">
          <h2>菜单投影</h2>
          <span>routes × menu 元数据</span>
        </div>
        <ul class="menu-list">
          <li v-for="item in preview.menu" :key="item.routeId">
            <el-tag size="small" effect="plain">{{ item.icon || 'no-icon' }}</el-tag>
            {{ item.title }} → #{{ item.routeId }}
            <span v-if="item.order !== undefined" class="dim">(order {{ item.order }})</span>
          </li>
        </ul>
      </section>

      <section class="plan-section">
        <div class="section-head">
          <h2>WiringPlan</h2>
          <span>{{ preview.wires.length }} wire(s)</span>
        </div>
        <ul class="menu-list">
          <li v-for="wire in preview.wires" :key="wire"><code>{{ wire }}</code></li>
        </ul>
      </section>

      <section v-for="tree in preview.renderTrees" :key="tree.unitFqn" class="plan-section">
        <div class="section-head">
          <h2>UnitRenderPlan · {{ tree.unitFqn }}</h2>
          <span>{{ tree.unitKind }}<template v-if="tree.title"> · {{ tree.title }}</template></span>
        </div>
        <pre class="render-tree">{{ tree.lines.join('\n') }}</pre>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createHalfcodeUnitBundlePreview, type UnitBundlePreviewModel } from './preview';

// In-memory VFS from the canonical FrontendApp fixtures; the page never
// touches the real filesystem.
const rawFiles = import.meta.glob(
  '../../../../dg-cell-mvi-halfcode-support/test/fixtures/xnl-bundles/**/*.xnl',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const files = Object.fromEntries(
  Object.entries(rawFiles).map(([file, content]) => {
    const marker = '/xnl-bundles/';
    const index = file.indexOf(marker);
    return [index >= 0 ? `/${file.slice(index + marker.length)}` : file, content];
  }),
);

const preview = ref<UnitBundlePreviewModel>();
const loadError = ref('');

try {
  preview.value = createHalfcodeUnitBundlePreview(files, 'vfs://@/basic-admin/');
} catch (error) {
  loadError.value = error instanceof Error ? error.message : String(error);
}
</script>

<style scoped>
.halfcode-unit-bundles {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-head,
.plan-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.page-head h1,
.section-head h2 {
  margin: 0;
  color: var(--el-text-color-primary);
}

.page-head h1 {
  font-size: 20px;
  line-height: 1.3;
}

.page-head p,
.section-head span {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.plan-section {
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-head h2 {
  font-size: 16px;
}

.menu-list {
  margin: 0;
  padding-left: 18px;
  color: var(--el-text-color-primary);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.menu-list .dim {
  color: var(--el-text-color-secondary);
}

.render-tree {
  margin: 0;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
}
</style>
