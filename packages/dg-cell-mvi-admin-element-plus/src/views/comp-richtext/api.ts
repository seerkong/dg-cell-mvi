/**
 * dg-cell-mvi-admin-element-plus · views/comp-richtext/api — RichTextEditor (tiptap) demo CRUD over the mock.
 * Each article row stores an HTML string in `content` (produced by the tiptap StarterKit editor).
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1, title: '欢迎使用', content: '<p>欢迎使用 <strong>富文本编辑器</strong>，支持 <em>斜体</em> 与列表。</p>' },
  { id: 2, title: '更新公告', content: '<p>本次更新：</p><ul><li>新增图标选择器</li><li>新增富文本编辑</li></ul>' },
  { id: 3, title: '使用须知', content: '<p>请遵守<strong>使用规范</strong>。</p>' },
  { id: 4, title: '常见问题', content: '<p>问：如何加粗？答：选中文本后点 <strong>B</strong>。</p>' },
  { id: 5, title: '版本历史', content: '<ol><li>v1.0 首发</li><li>v1.1 修复若干问题</li></ol>' },
  { id: 6, title: '联系我们', content: '<p>邮箱：<em>support@example.com</em></p>' },
  { id: 7, title: '隐私政策', content: '<p>我们重视您的<strong>隐私</strong>。</p>' },
  { id: 8, title: '服务条款', content: '<p>使用即代表您同意本条款。</p>' },
  { id: 9, title: '开发指南', content: '<p>组件经全局注册按名引用：<em>rich-text-editor</em>。</p>' },
  { id: 10, title: '反馈渠道', content: '<ul><li>工单</li><li>邮件</li></ul>' },
  { id: 11, title: '空白草稿', content: '' },
  { id: 12, title: '路线图', content: '<p>下一步：<strong>布局变体</strong>与 <strong>UI registry</strong>。</p>' },
];

const mock = buildMock('comp-richtext', seed);

export const GetList   = (query: any)                    => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => mock.UpdateObj(form);
export const DelObj    = (id: any)                       => mock.DelObj(id);
