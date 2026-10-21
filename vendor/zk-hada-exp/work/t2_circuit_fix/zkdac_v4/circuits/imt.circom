pragma circom 2.1.6;
// Indexed (ordered) Merkle tree non-membership — issue #24.
// Leaf = Poseidon(value, next_index, next_value); leaves form a sorted linked list starting at the sentinel (0, 0, 0);
// next_value == 0 marks the largest element. key k is NOT in the set  <=>  some leaf `low` in the tree has
// low.value < k  and  (k < low.next_value  or  low.next_value == 0).
// Keys are the low 252 bits of a field element (canonical decomposition via Num2Bits_strict, so no aliasing), because circomlib
// comparators are sound only for inputs < 2^252. Truncation can only make an honest key look revoked (prob ~ N / 2^252), never the reverse.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

template IMTKey() {                 // low 252 bits of a field element
    signal input in;
    signal output out;
    component b = Num2Bits_strict();
    b.in <== in;
    var acc = 0;
    for (var i = 0; i < 252; i++) { acc += b.out[i] * (1 << i); }
    out <== acc;
}

template IMTPath(DEPTH) {           // Poseidon Merkle membership with boolean path bits
    signal input leaf;
    signal input sib[DEPTH];
    signal input bit[DEPTH];
    signal input root;
    signal cur[DEPTH + 1];
    signal l[DEPTH]; signal r[DEPTH];
    component h[DEPTH];
    cur[0] <== leaf;
    for (var i = 0; i < DEPTH; i++) {
        bit[i] * (bit[i] - 1) === 0;
        l[i] <== cur[i] + bit[i] * (sib[i] - cur[i]);
        r[i] <== sib[i] + bit[i] * (cur[i] - sib[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== l[i]; h[i].inputs[1] <== r[i];
        cur[i + 1] <== h[i].out;
    }
    root === cur[DEPTH];
}

template IMTNonMember(DEPTH) {
    signal input key_full;          // e.g. a certificate hash
    signal input root;
    signal input low_value;
    signal input low_next_index;
    signal input low_next_value;
    signal input sib[DEPTH];
    signal input bit[DEPTH];

    component k = IMTKey();
    k.in <== key_full;

    component rv = Num2Bits(252); rv.in <== low_value;       // comparator soundness needs < 2^252
    component rn = Num2Bits(252); rn.in <== low_next_value;

    component lo = LessThan(252);                            // low.value < k
    lo.in[0] <== low_value; lo.in[1] <== k.out;
    lo.out === 1;

    component hi = LessThan(252);                            // k < low.next_value ...
    hi.in[0] <== k.out; hi.in[1] <== low_next_value;
    component isEnd = IsZero();                              // ... or low is the last element
    isEnd.in <== low_next_value;
    signal hiOrEnd;
    hiOrEnd <== hi.out + isEnd.out - hi.out * isEnd.out;
    hiOrEnd === 1;

    component lh = Poseidon(3);
    lh.inputs[0] <== low_value; lh.inputs[1] <== low_next_index; lh.inputs[2] <== low_next_value;
    component path = IMTPath(DEPTH);
    path.leaf <== lh.out; path.root <== root;
    for (var i = 0; i < DEPTH; i++) { path.sib[i] <== sib[i]; path.bit[i] <== bit[i]; }
}
