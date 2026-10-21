pragma circom 2.1.6;
// v8 budget mint (#39): cm opens to the public amount q (64-bit). The gate lets only the operator (trusted issuer) mint; funding is out of scope.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
template BudgetMint() {
    signal input cm; signal input q;                       // public
    signal input own[2]; signal input lin[4]; signal input rho;
    component qb = Num2Bits(64); qb.in <== q;
    component h = Poseidon(8); h.inputs[0] <== own[0]; h.inputs[1] <== own[1]; h.inputs[2] <== q;
    for (var j = 0; j < 4; j++) h.inputs[3 + j] <== lin[j];
    h.inputs[7] <== rho; cm === h.out;
}
component main {public [cm, q]} = BudgetMint();
