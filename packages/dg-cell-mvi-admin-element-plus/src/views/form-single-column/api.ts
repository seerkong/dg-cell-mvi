/**
 * dg-cell-mvi-admin-element-plus · views/form-single-column/api — single-column form demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  title: 'Vue 3 组合式 API 入门', author: '张三', status: 'published', summary: '介绍 Vue 3 组合式 API 的基本概念与使用方式，帮助开发者从选项式 API 平滑过渡。' },
  { id: 2,  title: 'TypeScript 高级类型技巧', author: '李四', status: 'draft',     summary: '深入探讨 TypeScript 中的条件类型、映射类型与模板字面量类型的实际应用。' },
  { id: 3,  title: 'Vite 构建优化实践', author: '王五', status: 'published', summary: '分析 Vite 在大型项目中的构建策略，包括代码分割、懒加载与依赖预构建调优。' },
  { id: 4,  title: 'Pinia 状态管理详解', author: '赵六', status: 'archived',  summary: '全面讲解 Pinia 的 store 设计、持久化方案与多模块拆分最佳实践。' },
  { id: 5,  title: 'Element Plus 主题定制', author: '张三', status: 'draft',     summary: '通过 CSS 变量与 Design Token 实现 Element Plus 组件库的多主题切换。' },
  { id: 6,  title: 'the reference crud 快速上手', author: '李四', status: 'published', summary: '演示如何用 the reference crud 在十分钟内搭建具备增删改查功能的后台管理页面。' },
  { id: 7,  title: '前端单元测试最佳实践', author: '钱七', status: 'published', summary: '结合 Vitest 与 Vue Test Utils，讲解组件、Composable 与 Store 的测试策略。' },
  { id: 8,  title: 'Monorepo 工程化指南', author: '孙八', status: 'draft',     summary: '介绍基于 pnpm workspace 的 Monorepo 方案，涵盖共享包、版本管理与 CI 流程。' },
  { id: 9,  title: 'WebSocket 实时通信方案', author: '王五', status: 'archived',  summary: '对比 WebSocket、SSE 与长轮询在即时消息、通知推送场景下的适用性与实现细节。' },
  { id: 10, title: '微前端架构落地总结', author: '赵六', status: 'published', summary: '复盘基于 qiankun 的微前端改造历程，梳理沙箱隔离、样式冲突与路由协同的解决思路。' },
];

const svc = buildMock('form-single-column', seed);

export const GetList   = (query: any)                    => svc.GetList(query);
export const AddObj    = (form: Record<string, any>)     => svc.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => svc.UpdateObj(form);
export const DelObj    = (id: any)                       => svc.DelObj(id);
