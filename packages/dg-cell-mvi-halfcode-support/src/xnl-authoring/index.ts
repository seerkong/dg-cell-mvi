export {
  createXnlCoreAuthoringMutationPort,
  mapXnlMutationDiagnostic,
  type XnlCoreAuthoringMutationPort,
  type XnlCoreAuthoringMutation,
  type XnlCoreAuthoringPath,
} from './mutationAdapter';

export {
  createXnlAuthoringSessionFactory,
} from './sessionFactory';

export {
  createXnlVfsAuthoringPersistencePort,
} from './persistenceAdapter';

export {
  createXnlAuthoringEditScopeFacet,
  createXnlAuthoringViewScopeFacet,
} from './scopeFacet';
