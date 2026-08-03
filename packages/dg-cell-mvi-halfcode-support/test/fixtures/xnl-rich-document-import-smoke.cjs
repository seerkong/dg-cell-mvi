const { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } = require('dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document');
const {
  createXnlRichDocumentSemanticDialect: createLogicDialect,
  materializeXnlRichDocumentSemanticCandidate: logicMaterializer,
  translateXnlRichDocumentEditInteraction: logicTranslator,
} = require('dg-cell-mvi-halfcode-logic');
const {
  createXnlRichDocumentSemanticDialect: createSupportDialect,
  materializeXnlRichDocumentSemanticCandidate: supportMaterializer,
  translateXnlRichDocumentEditInteraction: supportTranslator,
} = require('dg-cell-mvi-halfcode-support');

if (createSupportDialect !== createLogicDialect) process.exit(1);
if (supportTranslator !== logicTranslator) process.exit(1);
if (supportMaterializer !== logicMaterializer) process.exit(1);

console.log(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.nodeId);
