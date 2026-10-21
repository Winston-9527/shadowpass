pragma circom 2.1.6;
include "zkdac_chain.circom";
component main {public [issued_root, revoked_root, action_digest, nullifier, now]} = ZkDacChain(2, 16, 16);
