import type {
  XnlProjectionDomainPath,
  XnlProjectionDomainPathSegment,
  XnlProjectionDomainRef,
} from 'dg-cell-mvi-halfcode-contract';

export function createXnlProjectionPlanNodeId(
  domain: Pick<XnlProjectionDomainRef, 'nodeId' | 'path' | 'role'>,
): string {
  if (domain.nodeId !== undefined) {
    return `xnlp:e:${encodeStringComponent('i', domain.nodeId)}`;
  }

  const role = domain.role === undefined
    ? 'a'
    : encodeStringComponent('r', domain.role);
  return `xnlp:f:${role}:${encodePath(domain.path)}`;
}

function encodePath(path: XnlProjectionDomainPath): string {
  return `p${path.length.toString(16)}-${path.map(encodePathSegment).join('')}`;
}

function encodePathSegment(segment: XnlProjectionDomainPathSegment): string {
  if (typeof segment === 'number') {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, segment, false);
    const encoded = Array.from(
      bytes,
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    return `n-${encoded}`;
  }
  return encodeStringComponent('s', segment);
}

function encodeStringComponent(type: string, value: string): string {
  let encoded = '';
  for (let index = 0; index < value.length; index += 1) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return `${type}${value.length.toString(16)}-${encoded}`;
}
