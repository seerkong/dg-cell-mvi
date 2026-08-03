import type {
  XnlRichDocumentCandidateMaterializationConfig,
  XnlRichDocumentCandidateMaterializationInput,
  XnlProjectionCommandResult,
  XnlProjectionInteraction,
  XnlProjectionPlanNode,
  XnlRichDocumentCandidateMaterializer,
  XnlRichDocumentCandidateMaterializationResult,
  XnlRichDocumentCandidateMaterializationRuntime,
} from 'dg-cell-mvi-halfcode-contract';
import {
  createXnlRichDocumentSemanticDialect as createSupportDialect,
  materializeXnlRichDocumentSemanticCandidate as supportMaterializer,
  translateXnlRichDocumentEditInteraction as supportTranslator,
  type XnlRichDocumentCandidateMaterializer as SupportCandidateMaterializer,
  type XnlRichDocumentTrustedAuthoringRuntime,
} from 'dg-cell-mvi-halfcode-support';
import {
  createXnlRichDocumentSemanticDialect as createLogicDialect,
  materializeXnlRichDocumentSemanticCandidate as logicMaterializer,
  translateXnlRichDocumentEditInteraction as logicTranslator,
  type XnlProjectionCompilerDialect,
  type XnlRichDocumentEditTranslationConfig,
  type XnlRichDocumentEditTranslationInput,
  type XnlRichDocumentEditTranslationRuntime,
} from 'dg-cell-mvi-halfcode-logic';

type Empty = Readonly<Record<PropertyKey, never>>;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type CanonicalTranslator = (
  runtime: Empty,
  input: Readonly<{
    planNode: XnlProjectionPlanNode;
    interaction: XnlProjectionInteraction;
  }>,
  config: Empty,
) => XnlProjectionCommandResult | Promise<XnlProjectionCommandResult>;

const logicDialect: () => XnlProjectionCompilerDialect<unknown> =
  createLogicDialect;
const canonicalLogicTranslator: CanonicalTranslator = logicTranslator;
const canonicalLogicMaterializer: XnlRichDocumentCandidateMaterializer = logicMaterializer;
const supportDialect: typeof createLogicDialect = createSupportDialect;
const canonicalSupportTranslator: typeof logicTranslator = supportTranslator;
const canonicalSupportMaterializer: typeof logicMaterializer = supportMaterializer;

type SupportReexportsContractOwner = Expect<Equal<
  SupportCandidateMaterializer,
  XnlRichDocumentCandidateMaterializer
>>;
type TrustedHostUsesExactMaterializerFacet = Expect<Equal<
  XnlRichDocumentTrustedAuthoringRuntime['materializeInteraction'],
  XnlRichDocumentCandidateMaterializer
>>;
type TranslatorRuntimeIsAuthorityFree = Expect<Equal<
  XnlRichDocumentEditTranslationRuntime,
  Empty
>>;
type TranslatorInputIsPlanAndInteractionOnly = Expect<Equal<
  keyof XnlRichDocumentEditTranslationInput,
  'planNode' | 'interaction'
>>;
type TranslatorConfigIsAuthorityFree = Expect<Equal<
  XnlRichDocumentEditTranslationConfig,
  Empty
>>;
type MaterializerRuntimeIsAuthorityFree = Expect<Equal<
  XnlRichDocumentCandidateMaterializationRuntime,
  Empty
>>;
type MaterializerInputIsAcceptedAndCommandOnly = Expect<Equal<
  keyof XnlRichDocumentCandidateMaterializationInput,
  'accepted' | 'command'
>>;
type MaterializerConfigIsAuthorityFree = Expect<Equal<
  XnlRichDocumentCandidateMaterializationConfig,
  Empty
>>;
type MaterializerResultIsContractOwned = Expect<Equal<
  Awaited<ReturnType<typeof supportMaterializer>>,
  XnlRichDocumentCandidateMaterializationResult
>>;
type TranslatedResultKeysAreDataOnly = Expect<Equal<
  keyof Extract<XnlProjectionCommandResult, { status: 'translated' }>,
  'status' | 'command' | 'diagnostics'
>>;
type UntranslatedResultKeysAreDataOnly = Expect<Equal<
  keyof Exclude<XnlProjectionCommandResult, { status: 'translated' }>,
  'status' | 'diagnostics' | 'command'
>>;
type MaterializedResultKeysAreDataOnly = Expect<Equal<
  keyof Extract<XnlRichDocumentCandidateMaterializationResult, { status: 'materialized' }>,
  'status' | 'candidate' | 'copyOrigins'
>>;
type RejectedMaterializationKeysAreDataOnly = Expect<Equal<
  keyof Extract<XnlRichDocumentCandidateMaterializationResult, { status: 'rejected' }>,
  'status' | 'diagnostics'
>>;

// @ts-expect-error Canonical translator runtime cannot carry writer authority.
logicTranslator({ writer: {} }, {} as XnlRichDocumentEditTranslationInput, {});
logicTranslator({}, {
  planNode: {} as XnlProjectionPlanNode,
  interaction: {} as XnlProjectionInteraction,
  // @ts-expect-error Canonical translator input cannot carry a session.
  session: {},
}, {});
logicTranslator({}, {} as XnlRichDocumentEditTranslationInput, {
  // @ts-expect-error Canonical translator config cannot carry revision authority.
  revision: 'live:1',
});
// @ts-expect-error Canonical materializer runtime cannot carry persistence authority.
supportMaterializer({ persistence: {} }, {} as XnlRichDocumentCandidateMaterializationInput, {});
supportMaterializer({}, {
  accepted: {} as XnlRichDocumentCandidateMaterializationInput['accepted'],
  command: {} as XnlRichDocumentCandidateMaterializationInput['command'],
  // @ts-expect-error Canonical materializer input cannot carry submit authority.
  submit: () => undefined,
}, {});
supportMaterializer({}, {} as XnlRichDocumentCandidateMaterializationInput, {
  // @ts-expect-error Canonical materializer config cannot carry an adapter object.
  adapter: {},
});

void [
  logicDialect,
  canonicalLogicTranslator,
  canonicalLogicMaterializer,
  supportDialect,
  canonicalSupportTranslator,
  canonicalSupportMaterializer,
  true as SupportReexportsContractOwner,
  true as TrustedHostUsesExactMaterializerFacet,
  true as TranslatorRuntimeIsAuthorityFree,
  true as TranslatorInputIsPlanAndInteractionOnly,
  true as TranslatorConfigIsAuthorityFree,
  true as MaterializerRuntimeIsAuthorityFree,
  true as MaterializerInputIsAcceptedAndCommandOnly,
  true as MaterializerConfigIsAuthorityFree,
  true as MaterializerResultIsContractOwned,
  true as TranslatedResultKeysAreDataOnly,
  true as UntranslatedResultKeysAreDataOnly,
  true as MaterializedResultKeysAreDataOnly,
  true as RejectedMaterializationKeysAreDataOnly,
];
