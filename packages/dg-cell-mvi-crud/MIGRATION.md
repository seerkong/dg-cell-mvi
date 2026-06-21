# the reference crud → @dg-cell-mvi 迁移状态记事板

把 `the reference admin-element-latest`（the reference crud 官方 Element 示例）的能力迁移到 `dg-cell-mvi-crud` + `dg-cell-mvi-vue` 的进度跟踪。

**图例**：✅ 已迁移并验证 · 🟡 部分（基础能力在、变体/细节缺） · ❌ 未迁移
**优先级**：🔥 = 用户重点关注（嵌套 CRUD / 行内编辑）

> 源：`the reference admin-element-latest/src/views`（路由 `src/router/source/modules/crud.ts`）。
> 当前已迁移基线见本仓库 `dg-cell-mvi-admin-element-plus`（user/role 全 CRUD，demo 含 dict-select/switch）。

---

## 记事板 ① — 按 the reference crud 能力

| 能力 | 说明 | 对应示例页 | 状态 | 备注/缺口 |
|---|---|---|---|---|
| **🔥 嵌套 CRUD（virtual-model 一次性提交）** | 父表单含子对象数组字段，整体一次提交 | `editable/vmodel`, `form/nest` | 🟡 | ✅ FsSubTable 一次性提交已验证（admin `nest` 页：增/改/删成员行→随父对象一次提交+回填）；完整 editable.* 自由编辑子系统未做 |
| **🔥 嵌套 CRUD（multi-api 子表格）** | 父行展开/对话框内嵌独立子 CRUD（各自 api） | `advanced/nest`(+`sub-table`,`aside-table`) | ✅ | ✅ aside 主从（admin `nest-api`）+ ✅ 行展开内嵌子 CRUD（admin `sub-crud`：父行 expand→子 FsCrud 按 orderId 独立 api）；对话框内嵌变体未做 |
| **🔥 行内编辑（cell/row/free）** | 表格内单元格/整行就地编辑 | `editable/cell`,`row`,`free`,`feature/editable*` | ✅ | ✅ 三种模式全部迁移并验证（admin `editable-cell`/`editable-row`/`editable-free`）：草稿→校验→保存(本地/api)/取消/新增行；cell exclusive 互斥保存、free 默认全编辑+`全部保存`批量提交 |
| **🔥 子 CRUD（editable/sub-crud）** | 行展开为可编辑子表 | `editable/sub-crud`(+`row`) | ✅ | ✅ admin `sub-crud`：父行展开→子 editable FsCrud（独立 api 按 orderId 加载，行内编辑/新增明细/删除）。组合 expand-row + 嵌套 + 行内编辑 |
| 列表 + 分页 | 服务端分页表格 | `basis/*`, `sys/*` | ✅ | |
| 服务端排序 | sortable 列 → 重新请求 | `feature/column-sort`, `sortable` | 🟡 | 列排序 ✅；拖拽排序 ❌ |
| 查询表单 | 顶部搜索区 | `feature/search` | ✅ | |
| 多行查询 / 高级查询 | 多字段/折叠查询布局 | `feature/search-multi` | 🟡 | 基础查询在；多列布局/折叠 ❌ |
| 行选择（多选/单选） | 选择列 + selectedRowKeys | `feature/selection`,`selection-radio` | 🟡 | ✅ 多选列（type=selection）→ `commands.select` → selectedRowKeys 实时联动（admin `feature-selection`）；单选 radio 列未做 |
| 新增/编辑/查看表单 | 对话框表单 + 三种模式 | `form/base`,`form/view` | ✅ | |
| 同步校验 + 异步校验/提交钩子 | required/max/min/pattern + 钩子链 | `form/validation` | ✅ | P1：异步 async-validator + beforeValidate/beforeSubmit/doSubmit/afterSubmit/onSuccess 提交链（effect 边界）|
| valueBuilder / valueResolve | 出入参值转换 | `feature/value-builder` | ✅ | |
| 删除 + 确认 + 通知 | confirm/notify 端口 | `feature/remove` | ✅ | |
| 数据字典（静态/异步） | value→label + select options | `dict/single` | ✅ | ✅ 含树形/级联字典（cascader/tree-select 用树形 dict，单元格按叶子解析）；分发复制/共享 ❌ |
| 字典-radio/checkbox/cascade/tree | 字典驱动的其它控件 | `component/radio`,`checkbox`,`cascader`,`tree` | ✅ | ✅ 全部已验证：dict 驱动 radio-group/checkbox-group/cascader/tree-select；单元格 label 解析含 checkbox 数组拼接 + cascader/tree 叶子解析 |
| 字典分发/原型/共享 | cloneable/prototype/shared | `dict/cloneable`,`prototype`,`shared/*` | ✅ | ✅ shared（`crudOptions.dicts` + 列 `dict:{id}` → 单次加载 + 进程级单例 registry 跨页缓存，admin `dict-shared`）；cloneable/prototype（不可变设计下每列按 key 独立 state，天然隔离，admin `dict-cloneable`） |
| compute() 动态配置 | 上下文驱动的动态选项 | `basis/compute`,`compute-more` | ✅ | 同步 compute（表单项/逐行单元格）+ 异步 compute（options-on-watch）全接入；admin `comp-compute` 验证 |
| 联动 | 字段联动 | `advanced/linkage`,`basis/value-change` | ✅ | P4：`column.valueChange`（改 A 联动设 B，effect 边界一级联动 + fromValueChange 防环）；admin `comp-render-hooks`（改省份清空城市）|
| 表单组件：input/number/select/switch/date | 基础控件 | `component/text`,`number`,`select`,`switch`,`date` | ✅ | |
| 表单组件：自定义组件 | 任意 Vue 组件作表单项 | `basis/custom`,`form/custom-form` | ✅ | FsComponentRender 支持组件值/全局字符串名 + vModel；FsCell 支持 formatter |
| 表单组件：table-select/cascader/tree/code/editor/icon/json/phone/uploader | 富组件 | `component/*` | ✅ | cascader/tree-select/table-select/json/phone/code/uploader(图片) ✅（自定义 v-model 组件，全局注册按名引用）；✅ icon（IconPicker，基于 @element-plus/icons-vue，admin `comp-icon`，cellRender 按名渲染 el-icon）+ ✅ 富文本（RichTextEditor，基于 tiptap @tiptap/vue-3+starter-kit，admin `comp-richtext`，v-model HTML；view/cell 只读渲染）— track `add-crud-view-extensions` P1 |
| 表单布局（grid/flex/动态/单列/分组/分组tabs/抽屉/内嵌/新页面/独立） | 表单布局变体 | `form/*` | 🟡 | ✅ grid / flex / 单列 / 分组(group) / 分组tabs / 抽屉（`form.layout` + `form.col` + `form.group` + `form.wrapper.is='drawer'`，admin `form-*` 六页）；动态(layout)/内嵌/新页面/独立 ❌ |
| 字段帮助/字段周围 render | helper / 自定义渲染 | `form/helper`,`form/render` | ✅ | P4：helper + render/prefixRender/suffixRender/topRender/bottomRender + conditionalRender（经 FsRender）|
| watch / valueChange | 表单字段监听 | `form/watch`,`basis/value-change` | ✅ | P4：`valueChange` 字段联动（effect 边界）覆盖联动场景；被动 watch 钩子 ❌ |
| 操作列按钮 | view/edit/remove + dropdown/group | `row-handle/*` | ✅ | P7：dropdown 折叠(更多) + group(el-button-group) + 自定义按钮 onClick；tooltip 变体 ❌ |
| 工具栏 refresh/compact/列设置/导出 | 顶部工具栏 | (内置) | ✅ | refresh/compact + 列设置(P3) + CSV 导出 ✅ |
| 列设置 / 字段合并插件 | columnsFilter / 合并 | `basis/columns-set`,`column-merge-plugin` | 🟡 | P3：列设置 columnsFilter(显隐/固定/排序 + 持久化) ✅；字段合并插件 ❌ |
| 导出 | 表格导出 | `feature/export` | ✅ | ✅ 工具栏「导出」→ CSV（`exportCsv`，UTF-8 BOM；admin `feature-export`） |
| 表头分组 / 固定列 / 序号 / 展开 / 树形表 / 合并单元格 | 表格高级特性 | `feature/*` | 🟡 | ✅ 表头分组(P7，column.children 递归嵌套，admin `feature-multiheader`) / 固定列 / 序号列 / 展开行 / 树形表；合并单元格 ❌ |
| 大数据 / 大量列 / 本地分页 / card 列表 | 性能/展示变体 | `advanced/*` | 🟡 | ✅ 大数据虚拟表格（`table.mode='virtual'`→el-table-v2，admin `feature-virtual` 1000 行，虚拟滚动+排序+选择+container 高度）+ ✅ card 列表（`table.mode='card'`，admin `feature-card`，首列标题+label-value+操作区）— track `add-crud-view-extensions` P2/F18；大量列/本地分页 ❌ |
| 插槽（layout/form/search/cell/form-item） | 槽位自定义 | `slots/*` | ✅ | cell（`#cell_<key>`）、form-item（`#form_<key>`）、layout（`#header`/`#footer`）+ search 字段插槽（`#search_<key>`，P7）经 FsCrud 转发 |
| 多标签页（tabs 快速筛选） | 顶部业务 tabs | `feature/tabs` | ✅ | P6：按字段快速筛选 tab（admin `feature-tabs`）|
| i18n | 国际化 | `basis/i18n` | ✅ | P6：注入 translator 本地化内置 chrome + 回退（admin `feature-i18n` 中/EN 切换）|
| 插件机制 | settings.plugins | `basis/plugin` | ✅ | P6：构建期 config 变换链（enabled/order，admin `feature-plugins` 注入列）|
| 后台加载 crud / 对话框中 crud | 动态/内嵌 crud | `advanced/from-backend`,`in-dialog` | ❌ | |
| 权限按钮控制 | permission 谓词过滤按钮 | `sys/authority/*` | ✅ | P6：注入 `permission(code)` 谓词过滤 rowHandle/toolbar/actionbar/form 按钮（admin `feature-permission` viewer/admin 切换）|
| UI 框架适配层（ui-interface） | 抽象 Element/Antd/Naive | (架构) | 🟡 | P6：`UiAdapter` seam（集中命令式 UI 调用 + 逻辑组件名别名）→ P3(track `add-crud-view-extensions`/F19) 升为统一 **`UiRegistry`**（组件解析 `resolveComponent` + 命令式 UI `confirm/notify/message` 合一为单一可注入对象，默认 `elementUiRegistry` 行为等价，经 useCrud 注入覆盖）+ 多-UI 分包架构 **RFC**（`design/ui-registry-rfc.md`）→ **P4(F20) 落地按包分 UI**：`dg-cell-mvi-vue` 拆为 UI 中立包（`useCrud` + `UiRegistry` 接口 + 注入键 + 中立 helper，**零 element-plus**）+ 新建 **`dg-cell-mvi-element-plus`**（全部 Fs* + `elementUiRegistry`，依赖 vue+crud+element-plus），admin 改从 element-plus 导入——「按包分 UI」从 RFC **变为真实分包**。仍 🟡：仅 Element 一个 UI 包落地，Antd/Naive 等 UI 包仍未做（但架构与脚手架已就绪：复刻 `dg-cell-mvi-element-plus` 即可加 `dg-cell-mvi-antd`）|

---

## 记事板 ② — 按 the reference admin-element 示例页

### sys/authority（基础 CRUD 页）
| 示例页 | 标题 | 能力 | 状态 | 备注 |
|---|---|---|---|---|
| `sys/authority/user` | 用户管理 | 全 CRUD | ✅ | 已在 admin 复刻 |
| `sys/authority/role` | 角色管理 | 全 CRUD | ✅ | 已在 admin 复刻 |
| `sys/authority/permission` | 权限管理 | 全 CRUD + 权限 | ❌ | |

### crud/basis（基本特性）
| 示例页 | 标题 | 能力 | 状态 |
|---|---|---|---|
| `basis/first` | HelloWorld | 最简 crud | ✅ |
| `basis/table-v2` | 基于虚拟表格 | 虚拟滚动表格 | ✅ (P2：`table.mode='virtual'`→el-table-v2，admin `feature-virtual`) |
| `basis/compute` | 动态计算 | compute() | ✅ |
| `basis/compute-more` | 动态计算-更多 | compute() 进阶 | 🟡 |
| `basis/i18n` | 国际化 | i18n | ❌ |
| `basis/value-change` | ValueChange | 字段联动 | 🟡 |
| `basis/layout-card` | Card布局 | 列表卡片布局 | ✅ (P2：`table.mode='card'`→FsCardList，admin `feature-card`) |
| `basis/layout-custom` | 自定义布局 | 自定义页面布局 | ❌ |
| `basis/custom` | 自定义组件 | 自定义表单组件 | ❌ 🔥前置 |
| `basis/columns-set` | 列设置 | columnsFilter | ❌ |
| `basis/column-merge-plugin` | 字段合并插件 | 插件 | ❌ |
| `basis/reset` | ResetCrudOptions | 重建配置 | 🟡 |
| `basis/plugin` | CrudOptionsPlugin | 插件机制 | ❌ |

### crud/dict（数据字典）
| 示例页 | 标题 | 能力 | 状态 |
|---|---|---|---|
| `dict/single` | 单例 | 基础字典 | ✅ |
| `dict/cloneable` | 分发复制 | cloneable 字典 | ✅ |
| `dict/prototype` | 原型复制 | prototype 字典 | 🟡 (≈cloneable) |
| `dict/shared/manager` | 共享字典数据管理 | 跨页共享 | ✅ |
| `dict/shared/use` | 共享字典使用 | 跨页共享 | ✅ |

### crud/row-handle（操作列）
| 示例页 | 标题 | 能力 | 状态 |
|---|---|---|---|
| `row-handle/tooltip` | Tooltip | 操作按钮 tooltip | ❌ |
| `row-handle/dropdown` | 按钮折叠 | 操作按钮折叠 | ❌ |

### crud/component（组件示例）
| 示例页 | 标题 | 状态 | 示例页 | 标题 | 状态 |
|---|---|---|---|---|---|
| `component/text` | 文本输入 | ✅ | `component/select` | 选择 | ✅ |
| `component/number` | 数字 | ✅ | `component/switch` | 开关 | ✅ |
| `component/date` | 日期时间 | ✅ | `component/radio` | 单选 | ✅ |
| `component/checkbox` | 多选 | ✅ | `component/cascader` | 级联 | ✅ |
| `component/tree` | 树形选择 | ✅ | `component/table-select` | 表格选择 | ✅ |
| `component/button` | 按钮链接 | ❌ | `component/icon` | 图标 | ✅ (IconPicker/icons-vue, admin `comp-icon`) |
| `component/editor` | 富文本 | ✅ (RichTextEditor/tiptap, admin `comp-richtext`) | `component/code` | 代码编辑器 | ✅ |
| `component/json` | JsonEditor | ✅ | `component/phone` | 手机号 | ✅ |
| `component/uploader/*` | 各类上传(6) | 🟡 (图片) | `component/independent` | 组件独立使用 | ❌ |

### crud/form（表单）
| 示例页 | 标题 | 状态 | 示例页 | 标题 | 状态 |
|---|---|---|---|---|---|
| `form/base` | 基本表单 | ✅ | `form/validation` | 表单校验 | ✅ |
| `form/view` | 查看表单 | ✅ | `form/helper` | 字段帮助 | 🟡 |
| `form/layout-grid` | Grid布局 | ✅ | `form/layout-flex` | Flex布局 | ✅ |
| `form/layout` | 动态布局 | ❌ | `form/single-column` | 单列模式 | ✅ |
| `form/drawer` | 抽屉表单 | ✅ | `form/group` | 表单分组 | ✅ |
| `form/group-tabs` | 分组(tabs) | ✅ | `form/custom-form` | 自定义表单 | ❌ |
| `form/inner`(+`area`) | 页面内弹出 | ❌ | `form/new-page`(+`edit`) | 新页面编辑 | ❌ |
| `form/independent` | 独立使用表单 | ❌ | `form/render` | 字段周围render | ❌ |
| `form/watch` | 字段监听 | 🟡 | **`form/nest`** | **表单嵌套数据** | **❌ 🔥** |

### crud/editable（行内编辑）— 🔥 优先
| 示例页 | 标题 | 能力 | 状态 |
|---|---|---|---|
| `editable/cell` | 单元格编辑 | 单元格就地编辑 | ✅ 🔥 |
| `editable/row` | 行编辑 | 整行就地编辑 | ✅ 🔥 |
| `editable/free` | 自由编辑 | 自由模式编辑 | ✅ 🔥 |
| **`editable/vmodel`**(+`free`) | **虚拟model** | **一次性提交含子对象** | **❌ 🔥** |
| **`editable/sub-crud`**(+`row`) | **子CRUD** | **行展开可编辑子表** | **✅ 🔥** |

### crud/advanced（复杂需求）
| 示例页 | 标题 | 能力 | 状态 |
|---|---|---|---|
| **`advanced/nest`**(+`sub-table`,`aside-table`) | **嵌套子表格** | **multi-api 子 CRUD** | **✅ 🔥**（aside→`nest-api`，sub-table→`sub-crud`） |
| `advanced/linkage` | 选择联动 | 字段联动 | 🟡 |
| `advanced/from-backend` | 后台加载crud | 动态配置 | ❌ |
| `advanced/local-pagination` | 本地分页 | 本地模式 | ❌ |
| `advanced/in-dialog` | 对话框中显示crud | 内嵌 crud | ❌ |
| `advanced/big-data` | 大量数据 | 性能 | ✅ (P2：虚拟表格 `table.mode='virtual'`，admin `feature-virtual` 1000 行) |
| `advanced/many-columns` | 大量列 | 性能 | ❌ |
| `advanced/card` | card方式显示 | 卡片列表 | ✅ (P2：`table.mode='card'`，admin `feature-card`) |

### crud/feature（表格特性）
| 示例页 | 能力 | 状态 | 示例页 | 能力 | 状态 |
|---|---|---|---|---|---|
| `feature/search` | 查询 | ✅ | `feature/search-multi` | 多行查询 | 🟡 |
| `feature/selection` | 多选 | ✅ | `feature/selection-radio` | 单选 | ❌ |
| `feature/remove` | 删除 | ✅ | `feature/value-builder` | 值构建 | ✅ |
| `feature/column-sort` | 列排序 | 🟡 | `feature/sortable` | 拖拽排序 | ❌ |
| `feature/fixed` | 固定列 | ✅ | `feature/header` | 表头 | ❌ |
| `feature/header-group` | 表头分组 | ❌ | `feature/expand` | 展开行 | 🟡 (FsCrud `#expand` 槽，sub-crud 已用) |
| `feature/tree` | 树形表格 | ✅ | `feature/merge` | 合并单元格 | ❌ |
| `feature/height` | 高度 | ❌ | `feature/hide` | 隐藏列 | ❌ |
| `feature/index` | 序号列 | ✅ | `feature/filter` | 列筛选 | ❌ |
| `feature/export` | 导出 | ✅ | `feature/tabs` | 顶部tabs | ❌ |
| `feature/editable`(+`-row`) | 行内编辑 | 🟡 🔥 | `feature/cell-widget` | 单元格组件 | ❌ |
| `feature/local`(+`-import`,`-v-model`) | 本地模式 | ❌ | | | |

### crud/slots（插槽）
| 示例页 | 标题 | 状态 |
|---|---|---|
| `slots/layout` | 页面占位插槽 | ✅ (`#header`/`#footer`) |
| `slots/form` | 表单占位插槽 | 🟡 (form-item 已做) |
| `slots/search` | 查询字段插槽 | ❌ |
| `slots/cell` | 单元格插槽 | ✅ |
| `slots/form-item` | 表单字段插槽 | ✅ |

### crud/debug
| 示例页 | 能力 | 状态 |
|---|---|---|
| `debug/select` | select 调试 | ❌ |

---

## 记事板 ③ — 按 crudOptions 配置项（与 the reference crud 配置能力逐项对比）

> 源：the reference crud 类型定义 `packages/the reference crud/src/d/crud.ts`（+ `expose*.ts` / `compute.ts` / `fs.ts` / `use-dict-define.ts`）。
> 对照：本仓库 `dg-cell-mvi-crud/src/contract/crudOptions.ts` + 各 slice 实现。
> 架构说明：本架构为不可变 MVI——the reference crud 的命令式 `crudExpose.*` → 本架构 `commands` 派发 + viewModel；组件实例 `getXxxRef` 类能力为**架构性不适用**（用 state 不用 ref）。
> 粗略覆盖：核心 CRUD/请求/表单布局/表格/字典/行内编辑/插槽 配置 ≈ 已覆盖。✅ **track `add-crud-advanced-config` P1–P7 全部完成**：提交钩子链+异步校验(P1)、compute/DynamicType(P2)、列设置+持久化+x-table透传(P3)、渲染钩子+valueChange(P4)、删除钩子链+wrapper高级+自定义buttons(P5)、UiAdapter适配seam/tabs/i18n/settings.plugins/权限按钮(P6)、editable readonly/activeTrigger/update-cell + rowHandle dropdown/group + dict labelBuilder/onReady + search col/valueResolve/autoSearchTrigger/插槽 + 多级表头 + 列级exportable(P7)。框架补齐 F1–F17 见 `codument/tracks/add-crud-advanced-config/framework-additions.md`。**续作 track `add-crud-view-extensions`**：✅ P1 富组件 icon(IconPicker/@element-plus/icons-vue)+富文本(RichTextEditor/tiptap)（纯 demo 包，经既有 FsComponentRender 按名解析 + cellRender 单元格只读渲染，无框架改动）；✅ P2 布局变体（`table.mode='table'|'virtual'|'card'` 列表渲染模式 + `container` 外层容器，纯 projector+视图，未配置与现状字节等价；FsVirtualTable/el-table-v2 + FsCardList；框架补齐 F18；admin `feature-virtual`/`feature-card`）。**剩余（旁路/超范围）**：完整多-UI registry(本架构按包分 UI，已留 UiAdapter seam)、大量列、settings 其余项/logger。（infoRequest 打开回填经查证已在框架层实现，仅文档过期，已修正为 ✅。）

### CrudOptions 根
| 配置 | 状态 | 说明/缺口 |
|---|---|---|
| `columns` / `request` / `pagination` | ✅ | pagination 仅 show/pageSize/pageSizes，其余 x-pagination 透传 ❌ |
| `form`/`addForm`/`editForm`/`viewForm` | ✅ | 见 form 段 |
| `table` / `search` / `rowHandle` / `actionbar` / `toolbar` | 🟡 | 见各段 |
| `mode`（local/remote, isMergeWhenUpdate, isAppendWhenAdd） | 🟡 | name 已用；isMergeWhenUpdate / isAppendWhenAdd 声明未实现 |
| `data`（本地数据直注入） | 🟡 | 经 pageRequest；无直接 data 注入 |
| `id`（表格唯一 id） | ✅ | P3：table.id 驱动 columnsFilter / saveDraft 持久化 key |
| `settings`（viewFormUseCellComponent / searchCopyFormProps / onUseCrud / plugins） | 🟡 | P6：`settings.plugins`（构建期 config 变换链，enabled/order）✅；viewFormUseCellComponent/searchCopyFormProps/onUseCrud ❌ |
| `tabs`（顶部快速筛选 tab） | ✅ | P6：按字段快速筛选（addAll + static/dict options + 查询合并，search 胜出键冲突）|
| `container`（外层容器配置） | ✅ | P2：`CrudOptions.container`（height/class/style/透传）→ projector 透出 `vm.container` → FsCrud 外层包裹应用（admin `feature-virtual` container.height=560px）|

### request
| 配置 | 状态 | 说明 |
|---|---|---|
| pageRequest / addRequest / editRequest / delRequest | ✅ | |
| transformQuery / transformRes | ✅ | limit/offset 契约已验证 |
| infoRequest（打开编辑/查看时回填） | ✅ | 已接入：`reduceForm` open 分支 `config.request.infoRequest && mode!=='add'` → `infoRequestEffect` → 拉全行 → 重建 initialForm → `formOpened`（handler `formEffects.ts` 已注册 `crud.fx.infoRequest`）|

### table（TableProps）
| 配置 | 状态 | 说明 |
|---|---|---|
| editable（cell/row/free） | ✅ | P7：readonly / activeTrigger(click·dblclick) / update-cell command ✅；updateColumn(整列)/editable.addForm ❌ |
| index / selection / tree（序号/多选/树形） | ✅ | 本架构列能力 |
| 列 fixed / sortable / width / align | ✅ | 列级 column.* |
| remove（noConfirm / confirmFn / confirmTitle / afterRemove / onRemoved / handle …） | ✅ | P5：removeChain 钩子链 beforeRemove/doRemove(覆盖)/afterRemove/onRemoved + confirmTitle/Message/showConfirm（effect 边界，镜像 submitChain）|
| slots（#cell_<key>） | 🟡 | Vue 插槽方式，非 table.slots 配置 |
| x-table 透传（stripe / border / height / scroll / maxHeight …） | ✅ | P3：table 非框架键 → `nativeProps` → FsTable `v-bind` 到 el-table |
| `mode`（列表渲染模式 table/virtual/card） | ✅ | P2：`table.mode`→projector `vm.table.mode`→FsCrud 分派 FsTable/FsVirtualTable(el-table-v2)/FsCardList；框架键，排除出 nativeProps；未配置='table' 等价（F18）|
| onRefreshed / disableLoading / conditionalRender / maxHeightAdjust | ❌ | |

### column 组合（ColumnCompositionProps）
| 配置 | 状态 | 说明 |
|---|---|---|
| title / key / type / order | ✅ | |
| column（单元格）：show/width/align/fixed/sortable/formatter | ✅ | |
| column：component / cellRender / valueChange / columnSetDisabled / columnSlots | ✅ | P4：`cellRender` 钩子（agnostic 透传 fn ref，仅 vue 层 CALL）+ `valueChange` 字段联动（effect 边界，fromValueChange 防环）✅；columnSetDisabled/columnSlots ❌ |
| form / addForm / editForm / viewForm | ✅ | |
| search（show/title/component） | ✅ | P7：col(grid span) / valueResolve(查询前转换) / autoSearchTrigger(change 自动查) ✅；valueChange ❌ |
| dict / valueBuilder / valueResolve | ✅ | |
| children（多级表头） / exportable（列级导出开关） | ✅ | P7：多级表头(递归 el-table-column 嵌套，叶子仍走 FsCell) + 列级 exportable(CSV 排除 exportable:false) |

### form（FormProps / FormItemProps / wrapper）
| 配置 | 状态 | 说明 |
|---|---|---|
| 布局 display(flex/grid) / col / group / group-tabs | ✅ | layout=default/flex/group/group-tabs |
| wrapper.is（dialog/drawer）+ width/size/direction | ✅ | |
| FormItem：title/component/col/value/helper/order/show/rules | ✅ | |
| 校验 required/max/min/pattern/sync-validator | ✅ | P1：异步 async-validator ✅（effect 边界 `validateFormAsync`，await Promise validator）|
| 字段插槽 `form_<key>` | ✅ | |
| 表单级 prefix/suffix → `#header`/`#footer` | 🟡 | 布局级插槽近似 |
| initialForm（整体注入） | 🟡 | 现由列 value 构建 |
| 提交钩子 beforeValidate / beforeSubmit / doSubmit / afterSubmit / onSuccess / doReset | ✅ | P1：完整提交链（effect 边界 submitChain，中止/覆盖/成功/异步校验分支均测）|
| 字段渲染 render / prefixRender / suffixRender / topRender / bottomRender | ✅ | P4：经 `FsRender`（vue 层 CALL fn ref），agnostic 层仅按引用透传 |
| FormItem：blank / submit(false 排除) / valueChange / conditionalRender | 🟡 | P4：`valueChange`(一级联动) + `conditionalRender`(match→render 替换) ✅；blank / submit(false 排除) ❌ |
| wrapper：draggable / fullscreen / saveRemind / saveDraft / inner / onOpen / beforeClose / 自定义 buttons | ✅ | P5：全部实现（脏值追踪 initial 快照→dirty；saveDraft 注入 storage port；onOpen/onClosed 经 `watch(vm.form.open)` 驱动—F9 修 v-if 卸载致事件不触发）|

### search（SearchProps）
| 配置 | 状态 | 说明 |
|---|---|---|
| show / collapse | ✅ | |
| 字段 show/title/component | ✅ | P7：col(grid span) / valueResolve(查询前转换，可拆分键) / autoSearchTrigger(change 防抖自动查) ✅ |
| buttons（查询/重置/自定义） | 🟡 | 内置查询/重置；自定义 ❌ |
| 多行布局 / container（layout/action/collapseButton） / `search_<key>` 插槽 | 🟡 | P7：`search_<key>` 插槽 + el-row/el-col 网格(col.span) ✅；container/collapseButton ❌ |

### rowHandle / actionbar / toolbar / button
| 配置 | 状态 | 说明 |
|---|---|---|
| rowHandle.buttons(view/edit/remove) + show/width/fixed | ✅ | |
| actionbar.buttons(add) | ✅ | |
| toolbar refresh / compact / export(CSV) | ✅ | |
| rowHandle dropdown(折叠更多) / group(按钮组切换) | ✅ | P7：dropdown(atLeast 内联+更多下拉) + group(相邻同组聚为 el-button-group)；group 互斥激活切换层未做 |
| toolbar columnsFilter(列设置弹窗) / storage(持久化) | ✅ | P3：列设置弹窗(显隐/固定/排序) + localStorage 持久化(依赖 table.id) |
| button：text/type/order/show/disabled/click | ✅ | |
| button：icon 渲染 / circle / iconRight / dropdown | 🟡 | icon 仅透传字符串 |

### editable（行内编辑）
| 配置 | 状态 | 说明 |
|---|---|---|
| enabled / mode(cell/row/free) / exclusive / exclusiveEffect / activeDefault | ✅ | |
| updateCell / updateRow（本地·api persist）/ isEditable / addRow / removeRow / saveAll | ✅ | updateRow 为本架构等价（the reference crud 用 row.save/doSave 回调） |
| updateColumn(整列批量) / readonly / activeTrigger / editable.addForm·editForm | 🟡 | P7：readonly(`column.editable:false`/`{readonly:true}`) / activeTrigger(click·dblclick) / `editableUpdateCell` 程序化 set-value command ✅；updateColumn(整列)/editable.addForm·editForm ❌（后者部分为 ref API 架构性不适用）|

### dict（DictOptions）
| 配置 | 状态 | 说明 |
|---|---|---|
| data / url / getData / getNodesByValues | ✅ | |
| value / label / children / isTree / cache | ✅ | |
| shared（id 共享 + 单例 registry 跨页缓存） | ✅ | 本架构形式 |
| cloneable / prototype（按列隔离） | ✅ | 不可变设计天然隔离；prototype 语义 ≈ cloneable |
| color / labelBuilder / onReady / immediate / custom | 🟡 | P7：`labelBuilder`(自定义 label 构建，cell+form+select 三处) + `onReady`(数据就绪回调，effect 边界，每次加载一次) ✅；color/immediate/custom ❌ |

### compute / 动态配置
| 配置 | 状态 | 说明 |
|---|---|---|
| compute() / asyncCompute() / resolveCompute + 投影层接入 | ✅ | projectFormColumns(表单项 component/show 按 {form,mode,row}) + FsCell(逐行单元格按 {row,index,value}) 同步求值 |
| DynamicType（任意配置字段可为 compute/asyncCompute，按上下文求值） | ✅ | 异步 options-on-watch 经 computeAsync 切片+resolveAsyncCompute effect；admin `comp-compute` 三类验证 |

### expose 命令式 API → commands 映射
| 能力 | 状态 | 说明 |
|---|---|---|
| doRefresh/doSearch/setPage/setSort/select | ✅ | commands |
| openAdd/openEdit/openView/openCopy/closeForm/doSubmit/setFormField | ✅ | commands |
| doRemove / setTableData / loadDict / setCompact / editable.* | ✅ | commands |
| getFormData/setFormData(整体) / 通用 insert·updateTableRow | 🟡 | 有 setTableData/setFormField；通用单行 insert/update ❌ |
| getXxxRef（组件实例 ref） | ❌ | 架构性不适用（MVI 用 state） |

### 全局安装（FsSetupOptions）
| 配置 | 状态 | 说明 |
|---|---|---|
| commonOptions（全局默认配置） | ✅ | useCrud commonOptions |
| dictRequest（全局字典请求） | ✅ | registry dictRequest |
| customComponents（全局组件） | 🟡 | 手动全局注册（main.ts，如 FsSubTable/TableSelect…） |
| ui（UiInterface 适配 element/antd/naive） | 🟡 | P6：`UiAdapter` seam（命令式 message/notify/confirm + 逻辑组件名别名 input→el-input…）→ P3(track `add-crud-view-extensions`/F19) 升为统一 **`UiRegistry`**：组件解析（`resolveComponent`/`resolveComponentSpec`，原 FsComponentRender NAME_MAP+别名整表搬入）+ 命令式 UI 合一为单一可注入对象（默认 `elementUiRegistry` 行为等价，经 useCrud `uiRegistry` 注入覆盖；`uiAdapter` 仍作向后兼容别名）+ 多-UI 分包架构 **RFC**（`design/ui-registry-rfc.md`）→ **P4(F20) 按包分 UI 落地**：`dg-cell-mvi-vue` 瘦身为 UI 中立（`useCrud`+`UiRegistry` 接口+注入键+中立 helper，**源与 package.json 零 element-plus**），`elementUiRegistry`+全部 Fs* 迁入新建 **`dg-cell-mvi-element-plus`**（依赖 vue+crud+element-plus；其 `useCrud` 包装默认注入 `elementUiRegistry`，admin 单点从此包导入）——「按包分 UI」**已是真实分包**，非仅 RFC。仍 🟡：仅落地 Element 一个 UI 包，Element 以外（antd/naive）UI 包未做（脚手架已就绪：复刻 element-plus 包即可新增）|
| i18n / logger | 🟡 | P6：i18n（注入 translator 本地化内置 chrome 新增/查看/编辑/删除/查询/重置/列设置… + 回退默认中文）✅；logger ❌ |

### ComponentProps（组件描述）
| 配置 | 状态 | 说明 |
|---|---|---|
| name（字符串或组件）/ props / vModel | ✅ | 全局注册名按 FsComponentRender 解析（含富组件 IconPicker/RichTextEditor，track `add-crud-view-extensions` P1） |
| on/events（事件监听）/ slots / render | 🟡 | attrs 透传部分事件；slots/render ❌ |

---

## 下一步迁移顺序（按用户优先级）

- [x] **🔥 自定义表单组件**（嵌套前置）— `FsComponentRender`/`FsForm` 支持 `component` 为任意 Vue 组件 + vModel；demo：`basis/custom`。
- [x] **🔥 virtual-model 嵌套 CRUD** — `FsSubTable` 本地数组编辑器；admin `nest` 页已验证（增/改/删成员行→随父对象一次提交+回填）。
- [x] **🔥 multi-api 子表格嵌套** — admin `nest-api` 主从页（点父行→子表按父 id 走独立 api）。
- [x] **字典控件 radio/checkbox/cascader/tree-select** — admin `comp-*` 四页；单元格 label 解析（含数组拼接、树叶解析）。
- [x] **表单布局 grid + 抽屉** — admin `form-grid`/`form-drawer` 两页（`form.col.span` + `form.wrapper.is='drawer'`）。
- [x] **🔥 行内编辑 cell + row + free** — `editable` 状态切片 + reduceEditable + table.editable 投影 + FsCell/FsTable 编辑控件；admin `editable-cell`/`editable-row`/`editable-free` 三页（草稿/校验/保存(本地·api)/取消/新增行/exclusive/批量 saveAll）；12 个 reducer 单测。
- [x] **🔥 子 CRUD（editable/sub-crud）** — FsTable expand 列 + FsCrud `#expand` 槽；admin `sub-crud`：父行展开→子 editable FsCrud（独立 api 按 orderId 加载，行内编辑/新增/删除）。

- [x] **表单布局 flex/单列/分组/分组tabs** — `FsForm` 按 `form.layout` 渲染 + `FsFormItem` 抽取；admin `form-flex`/`form-single-column`/`form-group`/`form-group-tabs` 四页（dynamic workflow 批量）。
- [x] **表格特性 序号/多选/固定列/树形表/导出** — FsTable index/selection/fixed/tree-props 列 + `exportCsv` 工具栏；admin `feature-index`/`feature-selection`/`feature-fixed`/`feature-tree`/`feature-export` 五页（dynamic workflow 批量）。
- [x] **dict 变体 + slots** — shared 字典（id + 单例 registry）+ cloneable 隔离；cell/form-item/layout 插槽转发；admin `dict-shared`/`dict-cloneable`/`slots-cell`/`slots-layout` 四页（dynamic workflow 批量）。
- [x] **富表单组件 table-select/uploader/json/phone/code** — 自定义 v-model 组件（admin/src/components/rich，全局注册按名引用）；admin `comp-table-select`/`comp-uploader`/`comp-json`/`comp-phone`/`comp-code` 五页。icon/富文本待第三方库。

> 🔥 全部完成：嵌套 CRUD（virtual-model + multi-api + 行展开子 CRUD）、行内编辑（cell/row/free）。

接下来（codument track `add-crud-advanced-config`，按价值；对齐记事板 ③ 配置缺口）：

- [x] **P0** 预存类型债清理（全包 tsc 全绿）
- [x] **P1** 表单提交钩子链 beforeValidate/beforeSubmit/doSubmit/afterSubmit/onSuccess + 异步校验（effect 边界）
- [x] **P2** compute / DynamicType 动态配置（同步：表单项+逐行单元格；异步：options-on-watch）
- [x] **P3** 列设置 columnsFilter + 持久化 storage（依赖 `table.id`）+ 表格 x-table 属性透传（stripe/border/height/scroll）— F5
- [x] **P4** 字段/单元格渲染钩子 render/prefix/suffix/top/bottomRender + conditionalRender + valueChange — F6
- [x] **P5** 删除钩子链 + 表单 wrapper 高级（fullscreen/draggable/saveRemind/saveDraft/inner/onOpen/beforeClose）+ 自定义 buttons — F7/F8（+F9 生命周期修复）
- [x] **P6** 架构项：UI 适配 seam（UiAdapter）、i18n、插件机制（settings.plugins）、tabs 快速筛选、权限按钮 — F10/F11/F12/F13/F14
- [x] **P7** 较小项：editable readonly/activeTrigger/update-cell、rowHandle dropdown/group、dict labelBuilder/onReady、search col/valueResolve/autoSearchTrigger+插槽、多级表头、列级 exportable — F15/F16/F17
- 旁路：富组件 icon（需 `@element-plus/icons-vue`）、富文本 editor（需 Quill），表单布局动态/内嵌/新页面/独立。
