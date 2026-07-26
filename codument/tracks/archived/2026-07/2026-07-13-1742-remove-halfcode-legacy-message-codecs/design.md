# Design: One Active Message Vocabulary

## Boundary cleanup

The contract layer loses `IntentSpec`, `IntentPolicySpec`, `OnIntentSpec`,
`HalfcodeDocument.intents`, and `intentPolicies`. The unit reference table no
longer contains legacy domains or aliases. Retired-message diagnostics and
legacy branches are deleted; malformed retired XNL is handled as unsupported
syntax by the canonical parser rather than by a dedicated compatibility path.

The support layer keeps only the canonical Command/Event readers and runtime
assembly. The old artifact/asset projections are reduced to the still-used
general artifact behavior, with no Intent fields or old domain readers.

## Fixture cleanup

Remove the old `xnl-bundles-legacy` and `xnl-unit-bundles` fixture sets and
their tests. Canonical `xnl-bundles` becomes the sole fixture source. Tests
retain positive Command/Event coverage and negative validation for malformed
canonical declarations, without embedding retired syntax as a test fixture.

## Full-code API rename

The CRUD Vue adapter returns `commands: CrudCommands`; Element Plus components
receive `commands`; the underlying command creators remain the same behavior.
Workbench flow-editor runtime objects expose `commands` and use
`EmitCommand`/`makeCommand`. `AppEvent` remains the value envelope because it
is not a second command vocabulary.

## Verification boundary

Run package tests and a repository scan over active source, docs, and fixture
roots. Exclude only Codument audit history and the new track itself from the
retired-token scan.
