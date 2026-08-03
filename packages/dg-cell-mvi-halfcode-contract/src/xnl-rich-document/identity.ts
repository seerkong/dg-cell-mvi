declare const XNL_RICH_DOCUMENT_DOMAIN_NODE_ID: unique symbol;
declare const XNL_RICH_DOCUMENT_OCCURRENCE_X_ID: unique symbol;
declare const XNL_RICH_DOCUMENT_ADAPTER_POSITION: unique symbol;

/** Persistent Domain `#id`; used for tree alignment and move identity. */
export type XnlRichDocumentDomainNodeId = string & {
  readonly [XNL_RICH_DOCUMENT_DOMAIN_NODE_ID]: 'xnl-rich-document-domain-node-id';
};

/** Projection occurrence `x-id`; derived only after persistent identity exists. */
export type XnlRichDocumentOccurrenceXId = string & {
  readonly [XNL_RICH_DOCUMENT_OCCURRENCE_X_ID]: 'xnl-rich-document-occurrence-x-id';
};

/** Numeric cursor/node position owned by a renderer adapter's local state. */
export type XnlRichDocumentAdapterPosition = number & {
  readonly [XNL_RICH_DOCUMENT_ADAPTER_POSITION]: 'xnl-rich-document-adapter-position';
};

export const XNL_RICH_DOCUMENT_IDENTITY_RULES = {
  persistentIdentity: 'domain-#id',
  alignment: 'tree-alignment-and-move',
  ordinaryPayloadUpdate: false,
  replacement: 'delete-and-add',
  occurrenceIdentity: 'derived-after-persistent-identity',
  adapterPosition: 'local-only',
} as const;
