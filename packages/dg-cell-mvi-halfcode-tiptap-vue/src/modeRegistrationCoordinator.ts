import {
  formatDocumentInstanceRef,
  type DocumentDisplayModeSession,
  type DocumentInstanceRef,
} from 'dg-cell-mvi-halfcode-contract';
import type { XnlRichDocumentHalfcodeNodeViewDiagnosticCode } from './types';

export interface XnlRichDocumentModeRegistrationHandle {
  readonly lease: () => string | undefined;
  readonly release: () => void;
}

export interface XnlRichDocumentModeRegistrationCoordinator {
  readonly acquire: (ref: DocumentInstanceRef) => XnlRichDocumentModeRegistrationHandle;
  readonly dispose: () => void;
}

interface RegistrationEntry {
  readonly ref: DocumentInstanceRef;
  consumers: number;
  lease?: string;
  registrationSettled: boolean;
  releaseScheduled: boolean;
  unregistering: boolean;
  unregisterPromise?: Promise<void>;
}

export function createXnlRichDocumentModeRegistrationCoordinator(
  session: DocumentDisplayModeSession,
  report: (
    code: XnlRichDocumentHalfcodeNodeViewDiagnosticCode,
    message: string,
  ) => void = () => undefined,
): XnlRichDocumentModeRegistrationCoordinator {
  const entries = new Map<string, RegistrationEntry>();
  let disposed = false;

  const unregister = async (key: string, entry: RegistrationEntry): Promise<void> => {
    if (entry.unregisterPromise !== undefined) return entry.unregisterPromise;
    if (entry.lease === undefined) return;
    if (!disposed && entry.consumers > 0) return;
    entry.unregistering = true;
    entry.unregisterPromise = (async () => {
      const result = await session.unregister(entry.ref, entry.lease!);
      if (!result.ok) {
        report(
          'HALFCODE_NODEVIEW_CLEANUP_REJECTED',
          result.diagnostics.map((item) => item.message).join('; ')
            || 'Display mode cleanup was rejected.',
        );
      }
      if (entries.get(key) === entry) entries.delete(key);
    })();
    return entry.unregisterPromise;
  };

  const scheduleRelease = (key: string, entry: RegistrationEntry) => {
    if (entry.releaseScheduled) return;
    entry.releaseScheduled = true;
    void Promise.resolve().then(async () => {
      entry.releaseScheduled = false;
      if (!disposed && entry.consumers > 0) return;
      if (!entry.registrationSettled) return;
      if (entry.lease === undefined) {
        if (entries.get(key) === entry) entries.delete(key);
        return;
      }
      await unregister(key, entry);
    });
  };

  return Object.freeze({
    acquire: (ref: DocumentInstanceRef): XnlRichDocumentModeRegistrationHandle => {
      if (disposed) {
        return Object.freeze({ lease: () => undefined, release: () => undefined });
      }
      const key = formatDocumentInstanceRef(ref);
      let entry = entries.get(key);
      const registerAfter = entry?.unregistering === true
        ? entry.unregisterPromise
        : undefined;
      if (entry?.unregistering === true) entry = undefined;
      if (entry === undefined) {
        entry = {
          ref: Object.freeze({ ...ref }),
          consumers: 0,
          registrationSettled: false,
          releaseScheduled: false,
          unregistering: false,
        };
        entries.set(key, entry);
        const captured = entry;
        void (registerAfter ?? Promise.resolve()).then(() => session.register(captured.ref)).then((result) => {
          captured.registrationSettled = true;
          if (!result.ok || result.lease === undefined) {
            report(
              'HALFCODE_NODEVIEW_MODE_REGISTRATION_REJECTED',
              result.diagnostics.map((item) => item.message).join('; ')
                || 'Display mode registration was rejected.',
            );
          } else {
            captured.lease = result.lease;
          }
          if (disposed || captured.consumers === 0) scheduleRelease(key, captured);
        }).catch((error: unknown) => {
          captured.registrationSettled = true;
          report(
            'HALFCODE_NODEVIEW_MODE_REGISTRATION_REJECTED',
            `Display mode registration failed: ${errorMessage(error)}`,
          );
          if (entries.get(key) === captured && captured.consumers === 0) entries.delete(key);
        });
      }
      entry.consumers += 1;
      let released = false;
      return Object.freeze({
        lease: () => entry?.lease,
        release: () => {
          if (released) return;
          released = true;
          entry!.consumers = Math.max(0, entry!.consumers - 1);
          if (entry!.consumers === 0) scheduleRelease(key, entry!);
        },
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const [key, entry] of entries) {
        entry.consumers = 0;
        scheduleRelease(key, entry);
      }
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
