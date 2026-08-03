import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import {
  createXnlRichDocumentSemanticDialect as createLogicDialect,
  materializeXnlRichDocumentSemanticCandidate as logicMaterializer,
  translateXnlRichDocumentEditInteraction as logicTranslator,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createXnlRichDocumentSemanticDialect as createSupportDialect,
  materializeXnlRichDocumentSemanticCandidate as supportMaterializer,
  translateXnlRichDocumentEditInteraction as supportTranslator,
} from 'dg-cell-mvi-halfcode-support';

if (createSupportDialect !== createLogicDialect) process.exit(1);
if (supportTranslator !== logicTranslator) process.exit(1);
if (supportMaterializer !== logicMaterializer) process.exit(1);

console.log(XNL_RICH_DOCUMENT_CANONICAL_FIXTURE.nodeId);
