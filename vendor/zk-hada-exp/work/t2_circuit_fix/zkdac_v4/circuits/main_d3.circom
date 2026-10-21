pragma circom 2.1.6;
include "zkdac_chain_v4.circom";
component main {public [issued_root, revoked_root, nullifier, now, ctx_hash, act_req_cap]} = ZkDacChainV4(3, 16, 20);
