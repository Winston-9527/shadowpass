pragma circom 2.1.6;
// R6 accountability (issue #30): every action proof encrypts all chain keys ent[0..D] to the auditor committee key TPK, with FRESH randomness
// per action (fixed per-certificate ciphertexts would link actions). TPK is a public input supplied by the verifier contract from storage.
// Two variants are measured:
//   AccElGamal(N): one BabyJub ElGamal ciphertext per key point P_j: c1_j = r_j*Base8, c2_j = P_j + r_j*TPK; independent r_j (a shared r would
//                  publish P_j - P_k, which is constant for a chain and links its actions).
//   AccHybrid(N):  ElGamal encapsulates one random curve point K (c1 = r*Base8, c2 = K + r*TPK); the key coordinates are encrypted with a
//                  Poseidon keystream: e[j][b] = coord_b(P_j) + Poseidon(Kx, Ky, 2j + b). Decryption is exact for any field values.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/escalarmulany.circom";

// (c1, c2) = (r*Base8, M + r*PK); r < 2^251. NOTE (T3 v7 A19f): 2^251 > subgroup order l (~2^250.6), so r and r + l (when < 2^251) are both
// accepted; they give the SAME ciphertext, so this witness aliasing has no effect on the statement.
template ElGamalEnc() {
    signal input r; signal input pk[2]; signal input m[2];
    signal output c1[2]; signal output c2[2];
    var BASE8[2] = [5299619240641551281634865583518297030282874472190772894086521144482721001553,
                    16950150798460657717958625567821834550301663161624707787222815936182638968203];
    component rb = Num2Bits(251); rb.in <== r;
    component f = EscalarMulFix(251, BASE8);
    component a = EscalarMulAny(251);
    for (var i = 0; i < 251; i++) { f.e[i] <== rb.out[i]; a.e[i] <== rb.out[i]; }
    a.p[0] <== pk[0]; a.p[1] <== pk[1];
    component add = BabyAdd();
    add.x1 <== m[0]; add.y1 <== m[1]; add.x2 <== a.out[0]; add.y2 <== a.out[1];
    c1[0] <== f.out[0]; c1[1] <== f.out[1];
    c2[0] <== add.xout; c2[1] <== add.yout;
}

template AccElGamal(N) {
    signal input pk[2];
    signal input px[N]; signal input py[N];       // plaintext points (chain keys), on-curve checked
    signal input r[N];
    signal input c1x[N]; signal input c1y[N]; signal input c2x[N]; signal input c2y[N];   // public
    component chk[N]; component enc[N];
    for (var j = 0; j < N; j++) {
        chk[j] = BabyCheck(); chk[j].x <== px[j]; chk[j].y <== py[j];
        enc[j] = ElGamalEnc(); enc[j].r <== r[j]; enc[j].pk[0] <== pk[0]; enc[j].pk[1] <== pk[1]; enc[j].m[0] <== px[j]; enc[j].m[1] <== py[j];
        c1x[j] === enc[j].c1[0]; c1y[j] === enc[j].c1[1]; c2x[j] === enc[j].c2[0]; c2y[j] === enc[j].c2[1];
    }
}

template AccHybrid(N) {
    signal input pk[2];
    signal input px[N]; signal input py[N];
    signal input r; signal input kx; signal input ky;            // ephemeral point K (on curve)
    signal input c1x; signal input c1y; signal input c2x; signal input c2y;   // public
    signal input e[N][2];                                          // public keystream ciphertexts
    component kchk = BabyCheck(); kchk.x <== kx; kchk.y <== ky;
    component enc = ElGamalEnc(); enc.r <== r; enc.pk[0] <== pk[0]; enc.pk[1] <== pk[1]; enc.m[0] <== kx; enc.m[1] <== ky;
    c1x === enc.c1[0]; c1y === enc.c1[1]; c2x === enc.c2[0]; c2y === enc.c2[1];
    component ks[N][2];
    for (var j = 0; j < N; j++) for (var b = 0; b < 2; b++) {
        ks[j][b] = Poseidon(3); ks[j][b].inputs[0] <== kx; ks[j][b].inputs[1] <== ky; ks[j][b].inputs[2] <== 2 * j + b;
        if (b == 0) { e[j][b] === px[j] + ks[j][b].out; } else { e[j][b] === py[j] + ks[j][b].out; }
    }
}
