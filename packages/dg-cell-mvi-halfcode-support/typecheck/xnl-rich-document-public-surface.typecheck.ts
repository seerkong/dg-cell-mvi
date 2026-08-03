import {
  bindXnlRichDocumentEditTranslator,
  type XnlRichDocumentEditTranslatorBindingConfig,
  type XnlRichDocumentEditTranslatorBindingInput,
  type XnlRichDocumentEditTranslatorBindingRuntime,
  type XnlRichDocumentInteractionBridgePort,
  type XnlRichDocumentInteractionEditIntent,
} from 'dg-cell-mvi-halfcode-support';
import type {
  XnlProjectionInteraction,
  XnlProjectionPlanNode,
} from 'dg-cell-mvi-halfcode-contract';
import { translateXnlRichDocumentEditInteraction } from 'dg-cell-mvi-halfcode-logic';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

declare const bridge: XnlRichDocumentInteractionBridgePort;
declare const intent: XnlRichDocumentInteractionEditIntent;
declare const planNode: XnlProjectionPlanNode;
declare const interaction: XnlProjectionInteraction;

bridge.emitEditIntent(intent);
const boundTranslator = bindXnlRichDocumentEditTranslator(
  { translateInteraction: translateXnlRichDocumentEditInteraction },
  { planNode },
  {},
);
boundTranslator({}, { interaction }, {});

// @ts-expect-error Adapter-facing bridge does not expose authoring submit.
bridge.submit;
// @ts-expect-error Adapter-facing bridge does not expose an authoring session.
bridge.session;
// @ts-expect-error Adapter-facing bridge does not expose current revision.
bridge.currentRevision;
// @ts-expect-error Adapter-facing bridge does not expose identity allocation.
bridge.identityAllocator;
// @ts-expect-error Revision is not edit-intent data.
intent.proposal.baseLiveRevision;
// @ts-expect-error Adapter interaction cannot carry submit authority.
intent.proposal.submit;
bindXnlRichDocumentEditTranslator({
  translateInteraction: translateXnlRichDocumentEditInteraction,
  // @ts-expect-error Binding runtime contains only the pure canonical translator capability.
  writer: {},
}, { planNode }, {});
bindXnlRichDocumentEditTranslator(
  { translateInteraction: translateXnlRichDocumentEditInteraction },
  {
    planNode,
    // @ts-expect-error Plan binding input cannot carry an authoring session.
    session: {},
  },
  {},
);
bindXnlRichDocumentEditTranslator(
  { translateInteraction: translateXnlRichDocumentEditInteraction },
  { planNode },
  {
    // @ts-expect-error Plan binding config cannot carry revision authority.
    revision: 'live:1',
  },
);

type BridgeKeys = keyof XnlRichDocumentInteractionBridgePort;
type IntentKeys = keyof XnlRichDocumentInteractionEditIntent;
type BindingRuntimeKeys = keyof XnlRichDocumentEditTranslatorBindingRuntime;
type BindingInputKeys = keyof XnlRichDocumentEditTranslatorBindingInput;
type BindingConfigKeys = keyof XnlRichDocumentEditTranslatorBindingConfig;
type AdapterBridgeIsOneGrant = Expect<Equal<BridgeKeys, 'emitEditIntent'>>;
type AdapterIntentIsDataOnly = Expect<Equal<IntentKeys, 'kind' | 'proposal'>>;
type BindingRuntimeIsTranslatorOnly = Expect<Equal<BindingRuntimeKeys, 'translateInteraction'>>;
type BindingInputIsPlanOnly = Expect<Equal<BindingInputKeys, 'planNode'>>;
type BindingConfigIsEmpty = Expect<Equal<BindingConfigKeys, string | number | symbol>>;

void [
  bridge,
  intent,
  boundTranslator,
  true as AdapterBridgeIsOneGrant,
  true as AdapterIntentIsDataOnly,
  true as BindingRuntimeIsTranslatorOnly,
  true as BindingInputIsPlanOnly,
  true as BindingConfigIsEmpty,
];
