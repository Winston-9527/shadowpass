pragma circom 2.1.6;
// v9 (#41 ④): mode-C accountability with COMPRESSED keys. ElGamal encapsulates an ephemeral point K (as v7 AccHybrid); the keystream encrypts only the
// y-coordinates e[j] = y_j + Poseidon(Kx, Ky, j) (j < N) and one word e_sign = sum_j parity(x_j) * 2^j + Poseidon(Kx, Ky, N).
// The auditor recovers x_j from y_j (curve equation) and its parity: N + 1 words instead of 2N.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "accountability.circom";                   // ElGamalEnc (v7)
template AccHybridCompressed(N) {
    signal input pk[2]; signal input px[N]; signal input py[N];
    signal input r; signal input kx; signal input ky;
    signal input c1x; signal input c1y; signal input c2x; signal input c2y;   // public
    signal input e[N]; signal input e_sign;                                    // public
    component kchk = BabyCheck(); kchk.x <== kx; kchk.y <== ky;
    component enc = ElGamalEnc(); enc.r <== r; enc.pk[0] <== pk[0]; enc.pk[1] <== pk[1]; enc.m[0] <== kx; enc.m[1] <== ky;
    c1x === enc.c1[0]; c1y === enc.c1[1]; c2x === enc.c2[0]; c2y === enc.c2[1];
    component ks[N + 1]; component xb[N]; var packed = 0;
    for (var j = 0; j < N; j++) {
        ks[j] = Poseidon(3); ks[j].inputs[0] <== kx; ks[j].inputs[1] <== ky; ks[j].inputs[2] <== j;
        e[j] === py[j] + ks[j].out;
        xb[j] = Num2Bits_strict(); xb[j].in <== px[j];                       // canonical bits: parity = bit 0 of the canonical x
        packed += xb[j].out[0] * (1 << j);
    }
    ks[N] = Poseidon(3); ks[N].inputs[0] <== kx; ks[N].inputs[1] <== ky; ks[N].inputs[2] <== N;
    e_sign === packed + ks[N].out;
}
