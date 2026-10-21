pragma circom 2.1.6;
include "zkdac_chain_v3.circom";
component main {public [issued_root, revoked_root, nullifier, now, ctx_hash, act_req_cap]} = ZkDacChainV3(4, 16, 16);
