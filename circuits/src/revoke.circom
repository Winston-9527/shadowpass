pragma circom 2.1.6;
// Adapted from vendor/zk-hada-exp/work/t4_obligations/E7-obligations_20261009/revoke/circuits/revoke_transition.circom.
// Root certificates use ShadowPass Poseidon9(0, issuer, holder, cap, expiry, vpk); all later certificates keep Poseidon7.
// Authority and indexed-Merkle-tree insertion semantics are unchanged.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "imt.circom";
include "owner_key.circom";

template FoldRoot(DEPTH) {
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

template ShadowRevokeTransition(DEPTH) {
    signal input old_root; signal input new_root; signal input entry; signal input next_index;
    signal input kind; signal input who;
    signal input hop; signal input ia[2]; signal input ha[2]; signal input cap; signal input expiry;
    signal input own_w[2];
    signal input sk;
    signal input low_value; signal input low_next_index; signal input low_next_value;
    signal input low_sib[DEPTH]; signal input low_bit[DEPTH];
    signal input new_sib[DEPTH];

    kind * (kind - 1) === 0;
    who * (who - 1) === 0;
    (1 - kind) * who === 0;

    component isRoot = IsZero(); isRoot.in <== hop;
    component ovk = OwnerViewKeyIf(); ovk.en <== isRoot.out;
    ovk.w[0] <== own_w[0]; ovk.w[1] <== own_w[1];

    component rootCert = Poseidon(9);
    rootCert.inputs[0] <== 0;
    rootCert.inputs[1] <== ia[0]; rootCert.inputs[2] <== ia[1];
    rootCert.inputs[3] <== ha[0]; rootCert.inputs[4] <== ha[1];
    rootCert.inputs[5] <== cap; rootCert.inputs[6] <== expiry;
    rootCert.inputs[7] <== ovk.vpk[0]; rootCert.inputs[8] <== ovk.vpk[1];

    component cert = Poseidon(7);
    cert.inputs[0] <== hop; cert.inputs[1] <== ia[0]; cert.inputs[2] <== ia[1];
    cert.inputs[3] <== ha[0]; cert.inputs[4] <== ha[1];
    cert.inputs[5] <== cap; cert.inputs[6] <== expiry;
    signal certHash;
    certHash <== cert.out + isRoot.out * (rootCert.out - cert.out);

    var KEY_TAG = 2053861995;
    component kh = Poseidon(3); kh.inputs[0] <== KEY_TAG; kh.inputs[1] <== ia[0]; kh.inputs[2] <== ia[1];
    entry === kh.out + kind * (certHash - kh.out);

    signal sx; signal sy;
    sx <== ia[0] + who * (ha[0] - ia[0]);
    sy <== ia[1] + who * (ha[1] - ia[1]);
    component pbk = BabyPbk(); pbk.in <== sk;
    pbk.Ax === sx; pbk.Ay === sy;
    component skb = Num2Bits(251); skb.in <== sk;
    component skr = LessThan(251); skr.in[0] <== sk;
    skr.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    skr.out === 1;

    component nm = IMTNonMember(DEPTH);
    nm.key_full <== entry; nm.root <== old_root;
    nm.low_value <== low_value; nm.low_next_index <== low_next_index; nm.low_next_value <== low_next_value;
    for (var i = 0; i < DEPTH; i++) { nm.sib[i] <== low_sib[i]; nm.bit[i] <== low_bit[i]; }
    component k = IMTKey(); k.in <== entry;
    component lh = Poseidon(3); lh.inputs[0] <== low_value; lh.inputs[1] <== next_index; lh.inputs[2] <== k.out;
    component r1 = FoldRoot(DEPTH); r1.leaf <== lh.out;
    for (var i = 0; i < DEPTH; i++) { r1.sib[i] <== low_sib[i]; r1.bit[i] <== low_bit[i]; }
    component nb = Num2Bits(DEPTH); nb.in <== next_index;
    component empty = FoldRoot(DEPTH); empty.leaf <== 0;
    for (var i = 0; i < DEPTH; i++) { empty.sib[i] <== new_sib[i]; empty.bit[i] <== nb.out[i]; }
    empty.root === r1.root;
    component nh = Poseidon(3); nh.inputs[0] <== k.out; nh.inputs[1] <== low_next_index; nh.inputs[2] <== low_next_value;
    component r2 = FoldRoot(DEPTH); r2.leaf <== nh.out;
    for (var i = 0; i < DEPTH; i++) { r2.sib[i] <== new_sib[i]; r2.bit[i] <== nb.out[i]; }
    new_root === r2.root;
}
