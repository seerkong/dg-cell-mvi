/** Narrow renderer-facing entry point for the Presenter capability protocol. */
export {
  resolveApplicationDataCapability,
} from './applicationCapabilityResolver';
export {
  createXnlProjectionPresenterCapabilityProtocol,
  createXnlProjectionPresenterMethodGrant,
  createXnlProjectionPresenterSnapshotGrant,
} from './xnl-projection/presenterCapabilities';
export {
  createXnlProjectionPresenterRuntimeFacet,
  isXnlProjectionPresenterRuntimeFacet,
} from './xnl-projection/presenterRegistry';
export type {
  ApplicationDataCapabilityResolution,
} from './applicationCapabilityResolver';
export type {
  CreateXnlProjectionPresenterCapabilityProtocolInput,
  CreateXnlProjectionPresenterMethodGrantInput,
  CreateXnlProjectionPresenterSnapshotGrantInput,
  XnlProjectionPresenterCapabilityFactoryConfig,
  XnlProjectionPresenterCapabilityFactoryRuntime,
} from './xnl-projection/presenterCapabilities';
export type {
  XnlProjectionPresenterRuntime,
  XnlProjectionPresenterRuntimeFacet,
} from './xnl-projection/presenterRegistry';
