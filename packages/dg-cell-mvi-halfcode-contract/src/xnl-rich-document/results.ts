import type { XnlRichDocumentDiagnostic } from './diagnostics';
import type { XnlRichDocument } from './model';

export type XnlRichDocumentNormalizedResult =
  | Readonly<{
      status: 'normalized';
      document: XnlRichDocument;
      diagnostics?: readonly XnlRichDocumentDiagnostic[];
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly [XnlRichDocumentDiagnostic, ...XnlRichDocumentDiagnostic[]];
    }>;
