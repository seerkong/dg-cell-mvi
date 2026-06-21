import type {
  EditorPresentation,
  SchemaEditorContractRecord,
  StructureSchema,
} from 'dg-cell-mvi-halfcode-contract';

import {
  SHARED_BUSINESS_PROPERTY_IDS,
} from './sharedCapsule';

export const BUSINESS_DIALECT_PRESENTER_IDS = Object.freeze({
  businessAPhone: 'business.a.user.phone',
  businessBPhone: 'business.b.user.phone',
  businessAOverridePhone: 'business.a.user.phone.instance',
  address: SHARED_BUSINESS_PROPERTY_IDS.address.presenter,
  entityRef: SHARED_BUSINESS_PROPERTY_IDS.entityRef.presenter,
  enum: SHARED_BUSINESS_PROPERTY_IDS.enum.presenter,
});

export const BUSINESS_DIALECT_SHARED_SCHEMA = deepFreeze<StructureSchema>({
  kind: 'object',
  id: 'business.user',
  label: 'User',
  required: ['phone', 'address', 'manager', 'status'],
  fields: [
    {
      key: 'phone',
      schema: {
        kind: 'scalar',
        id: 'user.phone',
        label: 'Phone',
        scalar: 'string',
        annotations: {
          semanticType: SHARED_BUSINESS_PROPERTY_IDS.phone.semantic,
        },
      },
    },
    {
      key: 'address',
      schema: {
        kind: 'object',
        id: 'user.address',
        label: 'Address',
        annotations: {
          semanticType: SHARED_BUSINESS_PROPERTY_IDS.address.semantic,
        },
        required: ['street', 'city'],
        fields: [
          {
            key: 'street',
            schema: {
              kind: 'scalar',
              id: 'user.address.street',
              label: 'Street',
              scalar: 'string',
            },
          },
          {
            key: 'city',
            schema: {
              kind: 'scalar',
              id: 'user.address.city',
              label: 'City',
              scalar: 'string',
            },
          },
        ],
      },
    },
    {
      key: 'manager',
      schema: {
        kind: 'ref',
        id: 'user.manager',
        label: 'Manager',
        ref: 'entity.user',
        annotations: {
          semanticType: SHARED_BUSINESS_PROPERTY_IDS.entityRef.semantic,
        },
      },
    },
    {
      key: 'status',
      schema: {
        kind: 'scalar',
        id: 'user.status',
        label: 'Status',
        scalar: 'string',
        enum: ['draft', 'active', 'suspended'],
        annotations: {
          semanticType: SHARED_BUSINESS_PROPERTY_IDS.enum.semantic,
        },
      },
    },
  ],
});

export const BUSINESS_DIALECT_PRESENTATIONS = deepFreeze<
  Readonly<Record<
    'businessA' | 'businessB' | 'businessAOverride',
    EditorPresentation
  >>
>({
  businessA: businessPresentation('business.a.user.presentation', 'compact'),
  businessB: businessPresentation('business.b.user.presentation', 'comfortable'),
  businessAOverride: businessPresentation(
    'business.a.user.instance.presentation',
    'compact',
  ),
});

export const BUSINESS_DIALECT_INITIAL_VALUE =
  deepFreeze<SchemaEditorContractRecord>({
    phone: '+90 555 000 0000',
    address: {
      street: 'Istiklal Avenue',
      city: 'Istanbul',
    },
    manager: 'entity.user.current',
    status: 'active',
  });

function businessPresentation(
  id: string,
  density: 'compact' | 'comfortable',
): EditorPresentation {
  return {
    kind: 'presentation',
    id,
    schemaId: 'business.user',
    order: ['phone', 'address', 'manager', 'status'],
    options: { density },
    children: {
      phone: {
        options: {
          normalizedEvent: 'value.change',
        },
      },
      address: {
        presenter: {
          id: BUSINESS_DIALECT_PRESENTER_IDS.address,
          options: { layout: 'stacked' },
        },
      },
      manager: {
        presenter: {
          id: BUSINESS_DIALECT_PRESENTER_IDS.entityRef,
          options: { entity: 'user' },
        },
      },
      status: {
        presenter: {
          id: BUSINESS_DIALECT_PRESENTER_IDS.enum,
          options: { allowEmpty: false },
        },
      },
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (
    value === null
    || typeof value !== 'object'
    || Object.isFrozen(value)
  ) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
