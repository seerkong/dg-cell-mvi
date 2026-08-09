import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCUMENT_EDITOR_TOOLS } from 'dg-cell-mvi-halfcode-logic';
import {
  CANONICAL_DOCUMENT_EDITOR_COMMANDS,
  readCanonicalDocumentEditorCommand,
} from '../src/documentEditorCommandRegistry';

describe('canonical document editor command registry', () => {
  it('owns one immutable binding lookup for every canonical tool command', () => {
    const commandIds = DEFAULT_DOCUMENT_EDITOR_TOOLS.map((tool) => tool.commandId);

    expect(new Set(commandIds).size).toBe(commandIds.length);
    expect([...CANONICAL_DOCUMENT_EDITOR_COMMANDS.keys()].sort()).toEqual([...commandIds].sort());
    expect(commandIds.every((id) => readCanonicalDocumentEditorCommand(id) !== undefined)).toBe(true);
    expect(readCanonicalDocumentEditorCommand('rich-text.command.unknown')).toBeUndefined();
  });
});
