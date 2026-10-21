pragma circom 2.1.6;
// v8 budget transfer (#39): one budget note in, two out (split to self, or delegate part of the budget to a child). Adapted from the H3 pre-study
// note_transfer.circom (PR #38). Differences: (1) the new lineage entry of a delegation is the child CERTIFICATE hash Poseidon(d, owner, child, cap, expiry),
// d = number of active lineage slots — the same hash the v8 action circuit recomputes, so the child can spend only through that certificate;
// (2) the nullifier is the action circuit's budget_nf = Poseidon(TAG_BNF "zkbn", sk, cm_in): a note is consumed once, by an action OR a transfer;
// (3) no spend here: q_in = q1 + q2. Inputs from a revoked lineage entry or a revoked owner key cannot move.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "imt.circom";
include "binary-merkle-root.circom";

template IMTNonMemberIf(DEPTH) {        // IMTNonMember (imt.circom) enforced only when en = 1
    signal input en; signal input key_full; signal input root;
    signal input low_value; signal input low_next_index; signal input low_next_value; signal input sib[DEPTH]; signal input bit[DEPTH];
    component k = IMTKey(); k.in <== key_full;
    component rv = Num2Bits(252); rv.in <== low_value; component rn = Num2Bits(252); rn.in <== low_next_value;
    component lo = LessThan(252); lo.in[0] <== low_value; lo.in[1] <== k.out;
    en * (1 - lo.out) === 0;
    component hi = LessThan(252); hi.in[0] <== k.out; hi.in[1] <== low_next_value;
    component isEnd = IsZero(); isEnd.in <== low_next_value;
    signal hiOrEnd; hiOrEnd <== hi.out + isEnd.out - hi.out * isEnd.out;
    en * (1 - hiOrEnd) === 0;
    component lh = Poseidon(3); lh.inputs[0] <== low_value; lh.inputs[1] <== low_next_index; lh.inputs[2] <== low_next_value;
    signal cur[DEPTH + 1]; signal l[DEPTH]; signal r[DEPTH]; component h[DEPTH]; cur[0] <== lh.out;
    for (var i = 0; i < DEPTH; i++) {
        bit[i] * (bit[i] - 1) === 0;
        l[i] <== cur[i] + bit[i] * (sib[i] - cur[i]); r[i] <== sib[i] + bit[i] * (cur[i] - sib[i]);
        h[i] = Poseidon(2); h[i].inputs[0] <== l[i]; h[i].inputs[1] <== r[i]; cur[i + 1] <== h[i].out;
    }
    en * (cur[DEPTH] - root) === 0;
}

template BudgetTransfer(L, RD, NT) {     // L lineage slots, RD revocation IMT depth, NT note-tree max depth
    signal input note_root; signal input revoked_root; signal input nullifier; signal input cm_out1; signal input cm_out2;
    signal input own[2]; signal input q_in; signal input lin[L]; signal input rho_in; signal input sk;
    signal input nt_depth; signal input nt_index; signal input nt_sib[NT];
    signal input r_low_value[L]; signal input r_low_next_index[L]; signal input r_low_next_value[L]; signal input r_sib[L][RD]; signal input r_bit[L][RD];
    signal input k_low_value; signal input k_low_next_index; signal input k_low_next_value; signal input k_sib[RD]; signal input k_bit[RD];
    signal input o1[2]; signal input q1; signal input rho1; signal input delegate; signal input q2; signal input rho2; signal input cap; signal input expiry;

    // input note and its membership
    component cin = Poseidon(4 + L); cin.inputs[0] <== own[0]; cin.inputs[1] <== own[1]; cin.inputs[2] <== q_in;
    for (var j = 0; j < L; j++) cin.inputs[3 + j] <== lin[j];
    cin.inputs[3 + L] <== rho_in;
    component ntd = Num2Bits(8); ntd.in <== nt_depth;
    component ntle = LessEqThan(8); ntle.in[0] <== nt_depth; ntle.in[1] <== NT; ntle.out === 1;
    component mem = BinaryMerkleRoot(NT); mem.leaf <== cin.out; mem.depth <== nt_depth; mem.index <== nt_index;
    for (var i = 0; i < NT; i++) mem.siblings[i] <== nt_sib[i];
    note_root === mem.out;

    // owner, nullifier
    component pbk = BabyPbk(); pbk.in <== sk; pbk.Ax === own[0]; pbk.Ay === own[1];
    component skb = Num2Bits(251); skb.in <== sk;
    component skr = LessThan(251); skr.in[0] <== sk; skr.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041; skr.out === 1;
    component nf = Poseidon(3); nf.inputs[0] <== 2053857902; nf.inputs[1] <== sk; nf.inputs[2] <== cin.out;   // TAG_BNF = ASCII "zkbn" (shared with the v8 action circuit)
    nullifier === nf.out;

    // conservation with 64-bit ranges (sum < 2^66 << p: field equality = integer equality)
    component b0 = Num2Bits(64); b0.in <== q_in;
    component b2 = Num2Bits(64); b2.in <== q1; component b3 = Num2Bits(64); b3.in <== q2;
    q_in === q1 + q2;

    // lineage: active slots form a prefix; every active edge not revoked
    signal en[L]; component z[L]; component nm[L];
    for (var j = 0; j < L; j++) {
        z[j] = IsZero(); z[j].in <== lin[j]; en[j] <== 1 - z[j].out;
        if (j > 0) { en[j] * (1 - en[j - 1]) === 0; }
        nm[j] = IMTNonMemberIf(RD); nm[j].en <== en[j]; nm[j].key_full <== lin[j]; nm[j].root <== revoked_root;
        nm[j].low_value <== r_low_value[j]; nm[j].low_next_index <== r_low_next_index[j]; nm[j].low_next_value <== r_low_next_value[j];
        for (var i = 0; i < RD; i++) { nm[j].sib[i] <== r_sib[j][i]; nm[j].bit[i] <== r_bit[j][i]; }
    }
    // owner key not revoked (v6/v7 key entry format)
    component kh = Poseidon(3); kh.inputs[0] <== 2053861995; kh.inputs[1] <== own[0]; kh.inputs[2] <== own[1];
    component km = IMTNonMemberIf(RD); km.en <== 1; km.key_full <== kh.out; km.root <== revoked_root;
    km.low_value <== k_low_value; km.low_next_index <== k_low_next_index; km.low_next_value <== k_low_next_value;
    for (var i = 0; i < RD; i++) { km.sib[i] <== k_sib[i]; km.bit[i] <== k_bit[i]; }

    // out1: split/spend (same owner, same lineage) or delegate (child, lineage + edge at the first free slot)
    delegate * (delegate - 1) === 0;
    (1 - delegate) * (o1[0] - own[0]) === 0; (1 - delegate) * (o1[1] - own[1]) === 0;
    delegate * en[L - 1] === 0;                                        // a free slot must exist
    signal dsum[L + 1]; dsum[0] <== 0;
    for (var j = 0; j < L; j++) { dsum[j + 1] <== dsum[j] + en[j]; }        // d = number of active slots = hop index of the child certificate
    component cb = Num2Bits(32); cb.in <== cap; component eb = Num2Bits(64); eb.in <== expiry;
    component edge = Poseidon(7); edge.inputs[0] <== dsum[L]; edge.inputs[1] <== own[0]; edge.inputs[2] <== own[1];
    edge.inputs[3] <== o1[0]; edge.inputs[4] <== o1[1]; edge.inputs[5] <== cap; edge.inputs[6] <== expiry;
    signal pos[L]; signal de[L]; signal lin1[L];
    for (var j = 0; j < L; j++) {
        if (j == 0) { pos[j] <== 1 - en[0]; } else { pos[j] <== en[j - 1] * (1 - en[j]); }   // first free slot
        de[j] <== delegate * pos[j];
        lin1[j] <== lin[j] + de[j] * edge.out;
    }
    component c1 = Poseidon(4 + L); c1.inputs[0] <== o1[0]; c1.inputs[1] <== o1[1]; c1.inputs[2] <== q1;
    for (var j = 0; j < L; j++) c1.inputs[3 + j] <== lin1[j];
    c1.inputs[3 + L] <== rho1; cm_out1 === c1.out;
    component c2 = Poseidon(4 + L); c2.inputs[0] <== own[0]; c2.inputs[1] <== own[1]; c2.inputs[2] <== q2;
    for (var j = 0; j < L; j++) c2.inputs[3 + j] <== lin[j];
    c2.inputs[3 + L] <== rho2; cm_out2 === c2.out;

}
component main {public [note_root, revoked_root, nullifier, cm_out1, cm_out2]} = BudgetTransfer(4, 20, 20);
