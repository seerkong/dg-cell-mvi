import {
  validateXnlProjectionDialect,
  validateXnlProjectionDiagnostics,
  validateXnlProjectionInteraction,
  validateXnlProjectionPlan,
  validateXnlProjectionPresentation,
  XNL_PROJECTION_RESOLUTION_PRECEDENCE,
  type XnlProjectionCommandResult,
  type XnlProjectionDiagnostic,
  type XnlProjectionDialect,
  type XnlProjectionInteraction,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionPresentation,
  type XnlProjectionPresentationRule,
  type XnlProjectionPresenterAdapter,
  type XnlProjectionProcessor,
} from 'dg-cell-mvi-halfcode-contract';

const precedence: readonly string[] = XNL_PROJECTION_RESOLUTION_PRECEDENCE;
const validators = [
  validateXnlProjectionDiagnostics,
  validateXnlProjectionPresentation,
  validateXnlProjectionPlan,
  validateXnlProjectionDialect,
  validateXnlProjectionInteraction,
] as const;

type PublicXnlProjectionTypes = {
  presentation: XnlProjectionPresentation;
  presentationRule: XnlProjectionPresentationRule;
  plan: XnlProjectionPlan;
  planNode: XnlProjectionPlanNode;
  diagnostic: XnlProjectionDiagnostic;
  interaction: XnlProjectionInteraction;
  commandResult: XnlProjectionCommandResult;
  processor: XnlProjectionProcessor<unknown, unknown, unknown>;
  dialect: XnlProjectionDialect<unknown>;
  presenter: XnlProjectionPresenterAdapter<unknown>;
};

const nonFormPlan = {
  kind: 'xnl-projection-plan',
  id: 'architecture-document.plan',
  root: {
    id: 'domain://system-design#checkout-system/summary',
    domain: {
      path: ['SystemDesign', 'summary'],
      nodeId: 'checkout-system',
      tag: 'SystemDesign',
      role: 'summary',
    },
    classification: {
      id: 'architecture.system-design',
      traits: ['narrative', 'bounded-context-map'],
    },
    presenter: { id: 'doc.system-summary', options: { headingLevel: 1 } },
    data: {
      title: 'Checkout System',
      owner: 'platform-team',
    },
    children: [],
  },
} satisfies XnlProjectionPlan;

void [precedence, validators, nonFormPlan];
void (undefined as unknown as PublicXnlProjectionTypes);
