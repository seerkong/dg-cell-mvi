const {
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterRuntimeFacet,
} = require('dg-cell-mvi-halfcode-support');

const empty = Object.freeze({});
const protocol = createXnlProjectionPresenterCapabilityProtocol(
  empty,
  { id: 'presenter.protocol.package-root-cjs-smoke', grants: [] },
  empty,
);
const facet = createXnlProjectionPresenterRuntimeFacet(
  { source: empty, protocol },
  empty,
  empty,
);

if (Reflect.ownKeys(facet.view).length !== 0) {
  throw new Error('CJS package-root facet must expose only the empty protocol grants.');
}
console.log('cjs:ok');
