# 身份

## 身份分工

| 值 | owner | 用途 |
|---|---|---|
| Domain XNL `#id` / RichDocument `nodeId` | Domain/authoring owner | tree alignment、move detection、mutation target |
| adapter-local `local:n` | 单次 transaction normalizer | 暂时指向尚无 persistent identity 的新/复制节点 |
| candidate `xnl-temporary:*` | canonical materializer | pre-authority candidate 内的 collision-safe 临时 identity |
| `copyOrigins` | materializer -> trusted host allocator handoff | 逐个 copied persistent node 的 accepted source provenance |
| occurrence `x-id` | projection/Document occurrence | mounted runtime address |
| `DocumentInstanceRef` | Document occurrence runtime | `unitInstanceId + projectionRole + xId` |
| ProseMirror position | 当前 editor state | 局部光标/step 定位，不是稳定 identity |

## `#id` 是结构对齐，不是普通更新

同一个 `#id` 在父节点或顺序变化后仍表示同一领域节点，因此 diff 应产生 move。
它不能被表达为普通 payload 更新：

```text
move:        keep #id -> TREE_MOVE / TREE_MOVE_CROSS_LEVEL
replacement: delete old #id + add fresh #id
forbidden:   SET_FIELD #id = ...
```

Candidate 到 final allocated candidate 的规则如下：

- insert：normalizer 发 `local:n`，materializer 产生 `xnl-temporary:*`，allocator 再为每个
  新增 persistent node 分配 fresh `#id`；
- copy/duplicate paste：不能相信复制来的 attrs；只有与 accepted stable node 唯一、精确
  对齐的 local claim 才形成 `sourceNodeId`。复制子树的每个 persistent descendant 都有
  独立 `copyOrigins` 条目，allocator 据此分配 fresh `#id`；
- move：materializer 保留整棵 moved subtree 的 stable `#id`，host 不调用 allocator；
- replacement：结构上是 delete + add，added side 先取得 temporary id，再由 allocator
  获得 final fresh `#id`；
- collision、reused id、unverified allocator result 或歧义对齐：fail closed。

Allocator 属于 host/authoring runtime。Tiptap transaction、local draft 和 NodeView
均不持有 allocator，也不能决定最终 persistent identity。Canonical materializer 同样不
持有 allocator；它只把 immutable candidate 与 `copyOrigins` 交给 trusted host。Temporary
ids、`copyOrigins` 和尚未 accepted 的 final candidate 都不是 Domain authority。

## `x-id` 与 Multi-role

`x-id` 只能在 persistent `#id` 已建立后由 logic 的 canonical derivation 产生。
单 role 且 URI-safe 时可等于 `#id`；unsafe/reserved single-role identity 使用
`xrd-s-*`，multi-role occurrence 使用独立的 `xrd-o-*` namespace。同一 `#id`
在不同 role 下得到不同 `x-id` 和 `DocumentInstanceRef`。

当前已验证的 multi-role 边界是：同一个 persistent node 可在**不同 projection
host/surface** 中以不同 role 同时注册，销毁一个 host 只清理自己的地址。当前
Tiptap embed attrs 不携带 role authority，因此**同一 editor 内 simultaneous
multi-role projection 尚未交付**，不能从 `data-x-id` 或 DOM 推断。

`data-x-id` 仅是 debug projection。Runtime registration、lookup 与 cleanup 不读取
DOM、不用 `querySelector`，也不允许 duplicate address 的 last-wins。
