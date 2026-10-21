pragma circom 2.1.6;
// ZK-DAC chain circuit v3 = public-input layout C (issues #4, #18). Derived from v2 (../zkdac_v2) by variants/make_variants.py,
// now maintained here as the main circuit. Changes vs v2: the action context is bound through an opaque, contract-computed
// ctx_hash = keccak256(abi.encode(chainid, verifier, method, target, params, amount, nonce)) >> 8; the circuit only opens req_cap and now.
// v2 header follows:
// ZK-DAC chain circuit v2 (T2, issue #4). No prover-controlled enable switches, fixed depth D (no padding),
// SMT non-membership revocation, nullifier bound to the terminal holder's secret scalar,
// action digest over the full action context, expiry check + expiry attenuation.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/smt/smtverifier.circom";

// Poseidon Merkle membership, depth MD, boolean path bits.
template MerkleMember(MD) {
    signal input leaf;
    signal input sib[MD];
    signal input bit[MD];
    signal input root;
    signal cur[MD + 1];
    signal l[MD]; signal r[MD];
    component h[MD];
    cur[0] <== leaf;
    for (var i = 0; i < MD; i++) {
        bit[i] * (bit[i] - 1) === 0;
        l[i] <== cur[i] + bit[i] * (sib[i] - cur[i]);
        r[i] <== sib[i] + bit[i] * (cur[i] - sib[i]);
        h[i] = Poseidon(2);
        h[i].inputs[0] <== l[i]; h[i].inputs[1] <== r[i];
        cur[i + 1] <== h[i].out;
    }
    root === cur[MD];
}

// child cap must be a bit-subset of parent cap (32-bit capability vectors)
template CapSubset() {
    signal input parent; signal input child;
    component pb = Num2Bits(32); component cb = Num2Bits(32);
    pb.in <== parent; cb.in <== child;
    for (var i = 0; i < 32; i++) { cb.out[i] * (1 - pb.out[i]) === 0; }
}

// a <= b for 64-bit values (range-checks both)
template LeqU64() {
    signal input a; signal input b;
    component ra = Num2Bits(64); component rb = Num2Bits(64);
    ra.in <== a; rb.in <== b;
    component le = LessEqThan(64);
    le.in[0] <== a; le.in[1] <== b;
    le.out === 1;
}

// D certificates, MD = issued-tree depth, RD = revocation SMT depth.
// Entity 0 (root issuer) signs cert 0 for entity 1; ...; entity D is the terminal holder with secret scalar s.
template ZkDacChainV3(D, MD, RD) {
    // ---- public ----
    signal input issued_root;
    signal input revoked_root;
    signal input nullifier;
    signal input now;
    // ---- private: chain ----
    signal input ent_Ax[D + 1];
    signal input ent_Ay[D + 1];
    signal input sig_S[D]; signal input sig_R8x[D]; signal input sig_R8y[D];
    signal input cap[D];
    signal input expiry[D];
    signal input m_sib[D][MD]; signal input m_bit[D][MD];
    signal input r_sib[D][RD]; signal input r_oldKey[D]; signal input r_oldValue[D]; signal input r_isOld0[D];
    signal input holder_sk;          // terminal holder secret scalar (BabyJub), < subgroup order
    // ---- private: action context (digest is public) ----
    signal input ctx_hash;                      // variant C: keccak(context) >> 8, computed by the contract
    signal input act_req_cap;

    // certificate hash binds hop index, issuer key, holder key, capability, expiry
    signal cert[D];
    component ch[D];
    component sg[D];
    component mv[D];
    component rv[D];
    component ex[D];
    for (var i = 0; i < D; i++) {
        ch[i] = Poseidon(7);
        ch[i].inputs[0] <== i;
        ch[i].inputs[1] <== ent_Ax[i]; ch[i].inputs[2] <== ent_Ay[i];
        ch[i].inputs[3] <== ent_Ax[i + 1]; ch[i].inputs[4] <== ent_Ay[i + 1];
        ch[i].inputs[5] <== cap[i]; ch[i].inputs[6] <== expiry[i];
        cert[i] <== ch[i].out;

        sg[i] = EdDSAPoseidonVerifier();
        sg[i].enabled <== 1;
        sg[i].Ax <== ent_Ax[i]; sg[i].Ay <== ent_Ay[i];
        sg[i].S <== sig_S[i]; sg[i].R8x <== sig_R8x[i]; sg[i].R8y <== sig_R8y[i];
        sg[i].M <== cert[i];

        mv[i] = MerkleMember(MD);
        mv[i].leaf <== cert[i]; mv[i].root <== issued_root;
        for (var j = 0; j < MD; j++) { mv[i].sib[j] <== m_sib[i][j]; mv[i].bit[j] <== m_bit[i][j]; }

        rv[i] = SMTVerifier(RD);
        rv[i].enabled <== 1; rv[i].fnc <== 1;          // fnc=1: non-inclusion
        rv[i].root <== revoked_root;
        for (var j = 0; j < RD; j++) { rv[i].siblings[j] <== r_sib[i][j]; }
        rv[i].oldKey <== r_oldKey[i]; rv[i].oldValue <== r_oldValue[i]; rv[i].isOld0 <== r_isOld0[i];
        rv[i].key <== cert[i]; rv[i].value <== 0;

        ex[i] = LeqU64();                               // not expired at `now`
        ex[i].a <== now; ex[i].b <== expiry[i];
    }
    // chain continuity is structural: cert i's holder key == cert i+1's issuer key (same signal ent_*[i+1]).
    component cs[D > 1 ? D - 1 : 1];
    component es[D > 1 ? D - 1 : 1];
    for (var i = 0; i + 1 < D; i++) {
        cs[i] = CapSubset(); cs[i].parent <== cap[i]; cs[i].child <== cap[i + 1];
        es[i] = LeqU64(); es[i].a <== expiry[i + 1]; es[i].b <== expiry[i];
    }

    // terminal holder: knows scalar s with s*Base8 == ent[D]; s canonical (< subgroup order l)
    component pbk = BabyPbk();
    pbk.in <== holder_sk;
    pbk.Ax === ent_Ax[D]; pbk.Ay === ent_Ay[D];
    component sk_bits = Num2Bits(251);
    sk_bits.in <== holder_sk;
    component sk_range = LessThan(251);
    sk_range.in[0] <== holder_sk;
    sk_range.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    sk_range.out === 1;

    // full action context -> digest; required capability must be covered by the terminal cert
    component ad = Poseidon(2);
    ad.inputs[0] <== ctx_hash; ad.inputs[1] <== act_req_cap;
    signal action_digest <== ad.out;            // variant C: internal digest over the opaque context hash + required capability
    component reqsub = CapSubset();
    reqsub.parent <== cap[D - 1]; reqsub.child <== act_req_cap;

    // nullifier: per-action, bound to the holder secret
    component nf = Poseidon(3);
    nf.inputs[0] <== 1952805748;   // domain tag "zkdc"
    nf.inputs[1] <== holder_sk; nf.inputs[2] <== action_digest;
    nullifier === nf.out;
}
