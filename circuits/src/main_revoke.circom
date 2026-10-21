pragma circom 2.1.6;
include "revoke.circom";
component main {public [old_root, new_root, entry, next_index]} = ShadowRevokeTransition(20);
