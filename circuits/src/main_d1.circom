pragma circom 2.1.6;
include "shadow_chain.circom";
component main {public [state_root, now, ctx_hash, act_req_cap, own_c1x, own_c1y, own_c2x, own_c2y, own_e, own_esign, note_root, budget_nf, cm_change, q_spent]} = ShadowChain(1, 16, 20, 20, 20);
