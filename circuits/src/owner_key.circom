pragma circom 2.1.6;
include "circomlib/circuits/babyjub.circom";

// Owner view key: vpk = 8 * w with w on the curve (cofactor clearing puts vpk in the prime-order subgroup), vpk != identity.
// The only subgroup point with x = 0 is the identity (0, 1), so x != 0 excludes it.
template OwnerViewKey() {
    signal input w[2];
    signal output vpk[2];
    component wchk = BabyCheck(); wchk.x <== w[0]; wchk.y <== w[1];
    component d1 = BabyDbl(); d1.x <== w[0]; d1.y <== w[1];
    component d2 = BabyDbl(); d2.x <== d1.xout; d2.y <== d1.yout;
    component d3 = BabyDbl(); d3.x <== d2.xout; d3.y <== d2.yout;
    vpk[0] <== d3.xout; vpk[1] <== d3.yout;
    signal xinv; xinv <-- vpk[0] != 0 ? 1 / vpk[0] : 0;
    xinv * vpk[0] === 1;
}
