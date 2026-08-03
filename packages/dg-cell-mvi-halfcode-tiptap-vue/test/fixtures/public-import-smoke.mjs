import {
  createXnlRichDocumentTiptapSchema,
  createXnlRichDocumentTiptapDraft,
  bindXnlRichDocumentTiptapDraftToEditorState,
  createXnlRichDocumentEmbeddedPresenterCapability,
  createXnlRichDocumentHalfcodeNodeViewHost,
  createXnlRichDocumentMermaidNodeViewHost,
  createXnlRichDocumentTiptapBrowserHost,
  assembleXnlRichDocumentHalfcodeNodeViewOccurrence,
  normalizeTiptapTransaction,
  XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID,
} from 'dg-cell-mvi-halfcode-tiptap-vue';

if (XNL_RICH_DOCUMENT_TIPTAP_SCHEMA_ID.length === 0) process.exit(1);
if (createXnlRichDocumentTiptapSchema().status !== 'ready') process.exit(1);
if (typeof normalizeTiptapTransaction !== 'function') process.exit(1);
if (typeof createXnlRichDocumentTiptapDraft !== 'function') process.exit(1);
if (typeof bindXnlRichDocumentTiptapDraftToEditorState !== 'function') process.exit(1);
if (typeof createXnlRichDocumentEmbeddedPresenterCapability !== 'function') process.exit(1);
if (typeof createXnlRichDocumentHalfcodeNodeViewHost !== 'function') process.exit(1);
if (typeof createXnlRichDocumentMermaidNodeViewHost !== 'function') process.exit(1);
if (typeof createXnlRichDocumentTiptapBrowserHost !== 'function') process.exit(1);
if (typeof assembleXnlRichDocumentHalfcodeNodeViewOccurrence !== 'function') process.exit(1);
