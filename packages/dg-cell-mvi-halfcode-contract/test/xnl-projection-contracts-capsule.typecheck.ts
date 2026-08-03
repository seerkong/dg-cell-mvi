import {
  XNL_PROJECTION_RESOLUTION_PRECEDENCE,
  type XnlProjectionCommandResult,
  type XnlProjectionCompileRuntime,
  type XnlProjectionDialect,
  type XnlProjectionInteraction,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionPresentation,
  type XnlProjectionPresenterAdapter,
  type XnlProjectionProcessor,
} from '../src/xnl-projection';

const precedence: readonly string[] = XNL_PROJECTION_RESOLUTION_PRECEDENCE;

const presentation = {
  kind: 'xnl-projection-presentation',
  id: 'architecture-document.presentation',
  rules: [
    {
      id: 'service-card',
      match: { classification: 'architecture.service', role: 'service' },
      presenter: { id: 'doc.service-card', options: { density: 'compact' } },
      data: { titleSource: 'name' },
    },
  ],
} satisfies XnlProjectionPresentation;

const planNode = {
  id: 'domain://system-design#payment-service/service',
  domain: {
    path: ['SystemDesign', 'services', 0],
    nodeId: 'payment-service',
    tag: 'Service',
    role: 'service',
    sourceKind: 'xnl.data-element',
    sourceRef: 'xnl://checkout-system/payment-service',
  },
  classification: {
    id: 'architecture.service',
    traits: ['api-provider'],
    facts: { package: 'payments' },
  },
  presenter: { id: 'doc.service-card', options: { density: 'compact' } },
  facts: { owner: 'platform-team' },
  data: { name: 'PaymentService' },
  children: [],
} satisfies XnlProjectionPlanNode;

const plan = {
  kind: 'xnl-projection-plan',
  id: 'architecture-document.plan',
  root: planNode,
} satisfies XnlProjectionPlan;

type ExampleNode = { readonly tag: string; readonly children?: readonly ExampleNode[] };
type ExampleRuntime = XnlProjectionCompileRuntime<ExampleNode>;

const processor: XnlProjectionProcessor<ExampleRuntime, { node: ExampleNode }, { mode: 'summary' }, string> = (
  runtime,
  input,
  config,
) => `${input.node.tag}:${config.mode}:${typeof runtime.compile}`;

const dialect = {
  id: 'architecture.xnl',
  children: (_runtime, input, _config) =>
    (input.node.children ?? []).map((node, index) => ({ node, pathSegment: index, role: 'child' })),
  classify: (_runtime, input, _config) => ({
    id: input.node.tag === 'Service' ? 'architecture.service' : 'architecture.node',
  }),
  transformers: {
    'architecture.service': (_runtime, input, _config) => ({
      id: `domain://service#${input.context.domain.nodeId ?? input.context.domain.path.join('/')}`,
      domain: input.context.domain,
      classification: input.classification ?? { id: 'architecture.service' },
      presenter: input.presentation ?? { id: 'doc.service-card' },
      children: input.children ?? [],
    }),
  },
  presenterBindings: [{ classification: 'architecture.service', presenter: { id: 'doc.service-card' } }],
  config: { mode: 'summary' },
} satisfies XnlProjectionDialect<ExampleNode, ExampleRuntime, { mode: 'summary' }>;

const interaction = {
  type: 'edit-title',
  target: { planNodeId: plan.root.id, domain: plan.root.domain },
  payload: { title: 'Checkout System' },
} satisfies XnlProjectionInteraction;

const result = {
  status: 'translated',
  command: {
    type: 'domain.update-title',
    target: plan.root.domain,
    payload: { title: 'Checkout System' },
  },
} satisfies XnlProjectionCommandResult;

const presenter = {
  id: 'doc.service-card',
  surfaceId: 'plain-record',
  present: (_runtime, input, config) => ({
    surfaceId: config.surfaceId,
    value: {
      id: input.node.id,
      classification: input.node.classification.id,
      children: input.childOutputs.length,
      options: config.options,
    },
  }),
} satisfies XnlProjectionPresenterAdapter;

const invalidExecutablePresentation: XnlProjectionPresentation = {
  kind: 'xnl-projection-presentation',
  id: 'invalid.executable',
  rules: [{
    id: 'bad',
    match: {},
    data: {
      // @ts-expect-error presentation data must not contain executable implementation hooks.
      transformer: () => undefined,
    },
  }],
};

const invalidWriterPresentation: XnlProjectionPresentation = {
  kind: 'xnl-projection-presentation',
  id: 'invalid.writer',
  rules: [{
    id: 'bad',
    match: {},
    presenter: {
      id: 'doc.card',
      options: {
        // @ts-expect-error serializable presentation options must not carry ownership fields.
        writer: 'vfs',
      },
    },
  }],
};

const invalidAcceptedSnapshotResult: XnlProjectionCommandResult = {
  status: 'translated',
  command: { type: 'domain.noop', target: plan.root.domain },
  // @ts-expect-error closed command results do not expose accepted snapshots.
  acceptedSnapshot: plan,
};

void [
  precedence,
  presentation,
  plan,
  processor,
  dialect,
  interaction,
  result,
  presenter,
  invalidExecutablePresentation,
  invalidWriterPresentation,
  invalidAcceptedSnapshotResult,
];
