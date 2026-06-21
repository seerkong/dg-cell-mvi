/**
 * dg-cell-mvi-admin-element-plus · views/comp-code/api — CodeEditor component demo CRUD over the in-memory mock.
 */
import { buildMock } from '../../api/mockService';

const seed = [
  { id: 1,  name: '求和函数',   script: 'function run() {\n  return 42;\n}' },
  { id: 2,  name: '打印日志',   script: 'function run() {\n  console.log("hello");\n}' },
  { id: 3,  name: '延迟执行',   script: 'async function run() {\n  await delay(1000);\n  return true;\n}' },
  { id: 4,  name: '数组过滤',   script: 'function run(list) {\n  return list.filter(x => x > 0);\n}' },
  { id: 5,  name: '对象合并',   script: 'function run(a, b) {\n  return { ...a, ...b };\n}' },
  { id: 6,  name: '字符串截取', script: 'function run(s) {\n  return s.slice(0, 10);\n}' },
  { id: 7,  name: '随机整数',   script: 'function run(max) {\n  return Math.floor(Math.random() * max);\n}' },
  { id: 8,  name: '深拷贝',     script: 'function run(obj) {\n  return JSON.parse(JSON.stringify(obj));\n}' },
  { id: 9,  name: '求最大值',   script: 'function run(arr) {\n  return Math.max(...arr);\n}' },
  { id: 10, name: '类型判断',   script: 'function run(v) {\n  return typeof v;\n}' },
  { id: 11, name: '数组去重',   script: 'function run(arr) {\n  return [...new Set(arr)];\n}' },
  { id: 12, name: '倒序排列',   script: 'function run(arr) {\n  return arr.slice().reverse();\n}' },
];

const mock = buildMock('comp-code', seed);

export const GetList   = (query: any)                    => mock.GetList(query);
export const AddObj    = (form: Record<string, any>)     => mock.AddObj(form);
export const UpdateObj = (form: Record<string, any>)     => mock.UpdateObj(form);
export const DelObj    = (id: any)                       => mock.DelObj(id);
