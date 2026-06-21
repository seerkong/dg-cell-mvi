import { describe, expect, it } from 'vitest';
import {
  validateStructureSchemaCandidate,
  type StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';

const validate = (schema: StructureSchema, candidate: unknown) => (
  validateStructureSchemaCandidate(undefined, { schema, candidate }, {})
);

describe('StructureSchema candidate validation', () => {
  it('validates scalar, object, collection, and map constraints', () => {
    const schema: StructureSchema = {
      kind: 'object',
      fields: [
        {
          key: 'name',
          schema: {
            kind: 'scalar',
            scalar: 'string',
            constraints: { pattern: '^[a-z]+$', minLength: 2 },
          },
        },
        {
          key: 'alias',
          schema: {
            kind: 'scalar',
            scalar: 'string',
            constraints: { pattern: '^[a-z]+$' },
          },
        },
        {
          key: 'rows',
          schema: {
            kind: 'array',
            constraints: { minItems: 1, uniqueItems: true },
            item: { kind: 'scalar', scalar: 'integer' },
          },
        },
        {
          key: 'scores',
          schema: {
            kind: 'map',
            key: {
              kind: 'scalar',
              scalar: 'string',
              constraints: { pattern: '^[a-z]+$' },
            },
            value: {
              kind: 'scalar',
              scalar: 'number',
              constraints: { minimum: 0 },
            },
          },
        },
      ],
      required: ['name', 'rows'],
      additionalProperties: false,
    };

    expect(validate(schema, {
      name: 'ok',
      rows: [1, 2],
      scores: { alpha: 1 },
    })).toEqual({ ok: true, issues: [] });

    const rejected = validate(schema, {
      name: 'X',
      alias: 'also',
      rows: [1, 1],
      scores: { 'not-valid': -1 },
      extra: true,
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'SCHEMA_CANDIDATE_PATTERN',
      'SCHEMA_CANDIDATE_MIN_LENGTH',
      'SCHEMA_CANDIDATE_UNIQUE_ITEMS',
      'SCHEMA_CANDIDATE_MINIMUM',
      'SCHEMA_CANDIDATE_ADDITIONAL_PROPERTY',
    ]));
  });

  it('validates unions and recursive refs without product-specific semantics', () => {
    const schema: StructureSchema = {
      kind: 'union',
      id: 'serializable',
      alternatives: [
        {
          id: 'text',
          schema: { kind: 'scalar', scalar: 'string' },
        },
        {
          id: 'list',
          schema: {
            kind: 'array',
            item: { kind: 'ref', ref: 'serializable' },
          },
        },
      ],
    };

    expect(validate(schema, ['value', ['nested']])).toEqual({ ok: true, issues: [] });
    expect(validate(schema, true)).toMatchObject({
      ok: false,
      issues: [{ code: 'SCHEMA_CANDIDATE_UNION', path: '$.candidate' }],
    });
  });

  it('rejects malformed schemas and non-serializable candidates before value semantics', () => {
    const invalidSchema = {
      kind: 'object',
      fields: [{ key: 'value', schema: { kind: 'missing' } }],
    } as unknown as StructureSchema;
    const malformedSchemaResult = validate(invalidSchema, {});
    expect(malformedSchemaResult.ok).toBe(false);
    expect(malformedSchemaResult.issues[0]?.path).toMatch(/^\$\.schema/);

    const nonSerializable = validate(
      { kind: 'scalar', scalar: 'string' },
      { implementation: () => 'not data' },
    );
    expect(nonSerializable.ok).toBe(false);
    expect(nonSerializable.issues[0]?.path).toMatch(/^\$\.candidate/);

    expect(validate(
      {
        kind: 'scalar',
        scalar: 'string',
        constraints: { pattern: '[' },
      },
      'value',
    )).toMatchObject({
      ok: false,
      issues: [{ code: 'INVALID_SCHEMA_PATTERN' }],
    });
  });
});
