import {
  validateStructureSchemaCandidate,
  type SchemaEditorValidationResult,
  type ValidateStructureSchemaCandidateConfig,
  type ValidateStructureSchemaCandidateInput,
} from 'dg-cell-mvi-halfcode-contract';

const input: ValidateStructureSchemaCandidateInput = {
  schema: { kind: 'scalar', scalar: 'string' },
  candidate: 'value',
};
const config: ValidateStructureSchemaCandidateConfig = {};
const result: SchemaEditorValidationResult = validateStructureSchemaCandidate(
  undefined,
  input,
  config,
);

void result;
