import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE } from 'dg-cell-mvi-halfcode-contract/test-fixtures/xnl-rich-document';
import type { XnlRichDocument } from 'dg-cell-mvi-halfcode-contract';

const fixture: XnlRichDocument = XNL_RICH_DOCUMENT_CANONICAL_FIXTURE;

// @ts-expect-error Test-only fixture symbols are not exported from the production package root.
import { XNL_RICH_DOCUMENT_CANONICAL_FIXTURE as rootFixture } from 'dg-cell-mvi-halfcode-contract';

void [fixture, rootFixture];
