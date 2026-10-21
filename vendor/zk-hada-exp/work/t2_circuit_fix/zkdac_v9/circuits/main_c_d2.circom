pragma circom 2.1.6;
include "zkdac_chain_v9.circom";
component main {public [state_root, now, ctx_hash, act_req_cap, tpk, acc_c1x, acc_c1y, acc_c2x, acc_c2y, acc_e, acc_esign, note_root, budget_nf, cm_change, q_spent]} = ZkDacChainV9(2, 16, 20, 20, 20);
