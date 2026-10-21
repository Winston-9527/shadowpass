pragma circom 2.1.6;
include "zkdac_chain_v8.circom";
component main {public [issued_root, revoked_root, root_root, nullifier, now, ctx_hash, act_req_cap, tpk, acc_c1x, acc_c1y, acc_c2x, acc_c2y, acc_e, note_root, budget_nf, cm_change, q_spent]} = ZkDacChainV8(3, 16, 20, 20, 1, 20);
