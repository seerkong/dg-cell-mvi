# Decisions

## D1: Structure Commands Use The Existing Mutation Owner

The user requires all structure changes to follow the current one-way mutation
chain and XNL mutation mechanism. Product adapters build the desired candidate;
the existing workspace capsule owns diff, dry-run, canonical validation, VFS
commit, and reload.

## D2: Initial Configuration Is Part Of Creation

A new node is not persisted until its product-owned Schema Editor draft is
valid. Node identity, kind, placement/dependency action, and initial config are
one semantic command.

