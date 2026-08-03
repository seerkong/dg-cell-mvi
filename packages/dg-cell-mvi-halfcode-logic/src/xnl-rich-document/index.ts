export {
  lowerXnlRichDocument,
  normalizeXnlRichDocument,
  parseXnlRichDocumentCandidate,
} from './normalization';
export {
  classifyXnlRichDocumentIdentity,
  deriveXnlRichDocumentOccurrenceXId,
} from './identity';
export {
  createXnlRichDocumentSemanticDialect,
  translateXnlRichDocumentEditInteraction,
  type XnlRichDocumentEditTranslationConfig,
  type XnlRichDocumentEditTranslationInput,
  type XnlRichDocumentEditTranslationRuntime,
  type XnlRichDocumentEditTranslator,
} from './semanticTranslator';
export { materializeXnlRichDocumentSemanticCandidate } from './semanticMaterializer';
