pragma circom 2.1.6;
// ShadowPass registration = ZK-DAC registration (vendor/zk-hada-exp/work/t4_registration/circuits/register.circom, issue #17) with the
// root certificate hash extended by the owner view key, matching shadow_chain.circom:
//   leaf0 = Poseidon(0, A_x, A_y, master_x, master_y, cap0, expiry0, vpk_x, vpk_y),  vpk = 8 * own_w, vpk != identity.
// Binding vpk inside the proof matters: if vpk were passed next to the proof, anyone could re-submit the proof with their own vpk and
// receive the owner's ciphertexts.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "binary-merkle-root.circom";
include "owner_key.circom";
template ShadowRegister(MAX_DEPTH) {
    // ---- public ----
    signal input group_root;
    signal input domain;
    signal input nf_domain;
    signal input leaf0;
    // ---- private ----
    signal input human_sk;
    signal input master_Ax; signal input master_Ay;
    signal input cap0; signal input expiry0;
    signal input own_w[2];
    signal input depth; signal input index; signal input siblings[MAX_DEPTH];
    component skBits = Num2Bits(251); skBits.in <== human_sk;
    component skLt = LessThan(251);
    skLt.in[0] <== human_sk;
    skLt.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    skLt.out === 1;
    component pk = BabyPbk(); pk.in <== human_sk;
    component idc = Poseidon(2);
    idc.inputs[0] <== pk.Ax; idc.inputs[1] <== pk.Ay;
    component dBits = Num2Bits(8); dBits.in <== depth;
    component dLe = LessEqThan(8); dLe.in[0] <== depth; dLe.in[1] <== MAX_DEPTH; dLe.out === 1;
    component mr = BinaryMerkleRoot(MAX_DEPTH);
    mr.leaf <== idc.out; mr.depth <== depth; mr.index <== index;
    for (var i = 0; i < MAX_DEPTH; i++) { mr.siblings[i] <== siblings[i]; }
    group_root === mr.out;
    component nf = Poseidon(3);
    nf.inputs[0] <== 2053858418; nf.inputs[1] <== human_sk; nf.inputs[2] <== domain;
    nf_domain === nf.out;
    component capBits = Num2Bits(32); capBits.in <== cap0;
    component expBits = Num2Bits(64); expBits.in <== expiry0;
    component ovk = OwnerViewKey(); ovk.w[0] <== own_w[0]; ovk.w[1] <== own_w[1];
    component c0 = Poseidon(9);
    c0.inputs[0] <== 0;
    c0.inputs[1] <== pk.Ax; c0.inputs[2] <== pk.Ay;
    c0.inputs[3] <== master_Ax; c0.inputs[4] <== master_Ay;
    c0.inputs[5] <== cap0; c0.inputs[6] <== expiry0;
    c0.inputs[7] <== ovk.vpk[0]; c0.inputs[8] <== ovk.vpk[1];
    leaf0 === c0.out;
}
