pragma circom 2.1.6;
// #18 / research design line 97: an AUTHORIZED, MONOTONIC revocation step. Public: old_root, new_root, entry, next_index.
// (a) authority: the prover knows the secret scalar sk (canonical, < l) of
//       kind = 1, who = 0: the issuer  of certificate entry = Poseidon(hop, issuer, holder, cap, expiry)   (v2..v7 certificate hash)
//       kind = 1, who = 1: the holder  of that certificate (self-revocation of an incoming delegation)
//       kind = 0         : the key A of a key entry = Poseidon(KEY_TAG, A)                                   (v6/v7 key entry; `who` must be 0)
// (b) correct indexed-Merkle-tree insertion (same leaf format as ../../../../t2_circuit_fix/zkdac_v7/circuits/imt.circom):
//       trunc(entry) not in old_root (low leaf), low leaf re-pointed to (low.value, next_index, k), new leaf (k, low.next_index, low.next_value)
//       written into slot next_index, which must be empty after the low-leaf update.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "imt.circom";

template FoldRoot(DEPTH) {            // root of `leaf` at the position given by `bit` with siblings `sib`
    signal input leaf; signal input sib[DEPTH]; signal input bit[DEPTH]; signal output root;
    signal cur[DEPTH + 1]; signal l[DEPTH]; signal r[DEPTH]; component h[DEPTH];
    cur[0] <== leaf;
    for (var i = 0; i < DEPTH; i++) {
        bit[i] * (bit[i] - 1) === 0;
        l[i] <== cur[i] + bit[i] * (sib[i] - cur[i]);
        r[i] <== sib[i] + bit[i] * (cur[i] - sib[i]);
        h[i] = Poseidon(2); h[i].inputs[0] <== l[i]; h[i].inputs[1] <== r[i];
        cur[i + 1] <== h[i].out;
    }
    root <== cur[DEPTH];
}

template RevokeTransition(DEPTH) {
    signal input old_root; signal input new_root; signal input entry; signal input next_index;     // public
    signal input kind; signal input who;
    signal input hop; signal input ia[2]; signal input ha[2]; signal input cap; signal input expiry;
    signal input sk;
    signal input low_value; signal input low_next_index; signal input low_next_value;
    signal input low_sib[DEPTH]; signal input low_bit[DEPTH];
    signal input new_sib[DEPTH];

    // ---- (a) authority ----
    kind * (kind - 1) === 0; who * (who - 1) === 0;
    (1 - kind) * who === 0;                                    // key entries: only the key itself
    component ch = Poseidon(7);
    ch.inputs[0] <== hop; ch.inputs[1] <== ia[0]; ch.inputs[2] <== ia[1]; ch.inputs[3] <== ha[0]; ch.inputs[4] <== ha[1];
    ch.inputs[5] <== cap; ch.inputs[6] <== expiry;
    var KEY_TAG = 2053861995;                                   // ASCII "zkrk"
    component kh = Poseidon(3); kh.inputs[0] <== KEY_TAG; kh.inputs[1] <== ia[0]; kh.inputs[2] <== ia[1];
    entry === kh.out + kind * (ch.out - kh.out);
    signal sx; signal sy;                                       // signer = who ? holder : issuer/key
    sx <== ia[0] + who * (ha[0] - ia[0]); sy <== ia[1] + who * (ha[1] - ia[1]);
    component pbk = BabyPbk(); pbk.in <== sk; pbk.Ax === sx; pbk.Ay === sy;
    component skb = Num2Bits(251); skb.in <== sk;
    component skr = LessThan(251); skr.in[0] <== sk;
    skr.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041; skr.out === 1;

    // ---- (b) insertion ----
    component nm = IMTNonMember(DEPTH);                         // low leaf in old_root, low.value < k < low.next_value (or end)
    nm.key_full <== entry; nm.root <== old_root;
    nm.low_value <== low_value; nm.low_next_index <== low_next_index; nm.low_next_value <== low_next_value;
    for (var i = 0; i < DEPTH; i++) { nm.sib[i] <== low_sib[i]; nm.bit[i] <== low_bit[i]; }
    component k = IMTKey(); k.in <== entry;
    component lh = Poseidon(3); lh.inputs[0] <== low_value; lh.inputs[1] <== next_index; lh.inputs[2] <== k.out;
    component r1 = FoldRoot(DEPTH); r1.leaf <== lh.out;
    for (var i = 0; i < DEPTH; i++) { r1.sib[i] <== low_sib[i]; r1.bit[i] <== low_bit[i]; }
    component nb = Num2Bits(DEPTH); nb.in <== next_index;
    component empty = FoldRoot(DEPTH); empty.leaf <== 0;       // slot next_index is empty in the intermediate tree
    for (var i = 0; i < DEPTH; i++) { empty.sib[i] <== new_sib[i]; empty.bit[i] <== nb.out[i]; }
    empty.root === r1.root;
    component nh = Poseidon(3); nh.inputs[0] <== k.out; nh.inputs[1] <== low_next_index; nh.inputs[2] <== low_next_value;
    component r2 = FoldRoot(DEPTH); r2.leaf <== nh.out;
    for (var i = 0; i < DEPTH; i++) { r2.sib[i] <== new_sib[i]; r2.bit[i] <== nb.out[i]; }
    new_root === r2.root;
}
component main {public [old_root, new_root, entry, next_index]} = RevokeTransition(20);
