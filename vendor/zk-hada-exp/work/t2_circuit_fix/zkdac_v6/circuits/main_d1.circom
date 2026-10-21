pragma circom 2.1.6;
include "zkdac_chain_v6.circom";
component main {public [issued_root, revoked_root, root_root, nullifier, now, ctx_hash, act_req_cap]} = ZkDacChainV6(1, 16, 20, 20);
