import type {
  XnlRichDocumentInlineRun,
  XnlRichDocumentLocalNodeRef,
  XnlRichDocumentSemanticEdit,
  XnlRichDocumentSemanticNode,
  XnlRichDocumentStableNodeRef,
} from 'dg-cell-mvi-halfcode-contract';
import type {
  XnlRichDocumentTiptapInlineRun,
  XnlRichDocumentTiptapLocalNodeRef,
  XnlRichDocumentTiptapSemanticEdit,
  XnlRichDocumentTiptapSemanticNode,
  XnlRichDocumentTiptapStableNodeRef,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type AdapterInlineRunsAreCanonicalAlias = Expect<Equal<
  XnlRichDocumentInlineRun,
  XnlRichDocumentTiptapInlineRun
>>;

type AdapterStableRefIsCanonicalAlias = Expect<Equal<
  XnlRichDocumentTiptapStableNodeRef,
  XnlRichDocumentStableNodeRef
>>;
type AdapterLocalRefIsCanonicalAlias = Expect<Equal<
  XnlRichDocumentTiptapLocalNodeRef,
  XnlRichDocumentLocalNodeRef
>>;

type AdapterSemanticNodeIsCanonicalAlias = Expect<Equal<
  XnlRichDocumentTiptapSemanticNode,
  XnlRichDocumentSemanticNode
>>;
type AdapterSemanticEditIsCanonicalAlias = Expect<Equal<
  XnlRichDocumentTiptapSemanticEdit,
  XnlRichDocumentSemanticEdit
>>;

type CompatibilityAssertions = [
  AdapterInlineRunsAreCanonicalAlias,
  AdapterStableRefIsCanonicalAlias,
  AdapterLocalRefIsCanonicalAlias,
  AdapterSemanticNodeIsCanonicalAlias,
  AdapterSemanticEditIsCanonicalAlias,
];

void (undefined as unknown as CompatibilityAssertions);
