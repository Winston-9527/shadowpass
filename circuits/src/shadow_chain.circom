pragma circom 2.1.6;
// ShadowPass action circuit = ZK-DAC v9.2 (vendor/zk-hada-exp/.../zkdac_v9_2/circuits/zkdac_chain_v9.circom) with two changes:
//  (1) OWNER VIEW KEY. The root certificate binds the owner's view public key vpk:
//        cert[0] = Poseidon(0, ent0, ent1, cap0, expiry0, vpk)       (9 inputs; hops >= 1 keep Poseidon(7))
//      vpk = 8 * own_w for an on-curve witness own_w, so vpk is in the prime-order subgroup, and vpk != identity.
//  (2) OWNER CIPHERTEXT. The chain keys ent[0..D] are encrypted to vpk (AccHybridCompressed, unchanged from v9.1), replacing the v9
//      ciphertext to the global auditor key TPK, which is removed together with its public inputs. Only the owner can open the chain.
// Everything else (EdDSA chain, registered-root tree, IMT revocation of certificates and keys, cap subset, expiry attenuation,
// holder_sk range and non-zero, budget note, state root) is copied unchanged. Hops >= 1 use the same dynamic-depth LeanIMT
// membership as the registered-root tree; their maximum depth is MD = 20.
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "imt.circom";
include "binary-merkle-root.circom";
include "accountability_v9.circom";
include "owner_key.circom";

template CapSubset() {
    signal input parent; signal input child;
    component pb = Num2Bits(32); component cb = Num2Bits(32);
    pb.in <== parent; cb.in <== child;
    for (var i = 0; i < 32; i++) { cb.out[i] * (1 - pb.out[i]) === 0; }
}

template LeqU64() {
    signal input a; signal input b;
    component ra = Num2Bits(64); component rb = Num2Bits(64);
    ra.in <== a; rb.in <== b;
    component le = LessEqThan(64);
    le.in[0] <== a; le.in[1] <== b;
    le.out === 1;
}

template ShadowChain(D, MD, RD, RT, NT) {
    // ---- public ----
    signal input state_root;
    signal input now;
    signal input issued_root;
    signal input revoked_root;
    signal input root_root;
    // ---- private: chain ----
    signal input ent_Ax[D + 1];
    signal input ent_Ay[D + 1];
    signal input sig_S[D]; signal input sig_R8x[D]; signal input sig_R8y[D];
    signal input cap[D];
    signal input expiry[D];
    signal input m_depth[D]; signal input m_index[D]; signal input m_sib[D][MD];
    signal input r_low_value[D]; signal input r_low_next_index[D]; signal input r_low_next_value[D];
    signal input r_sib[D][RD]; signal input r_bit[D][RD];
    signal input rt_depth; signal input rt_index; signal input rt_sib[RT];
    var NK = D > 1 ? D - 1 : 1;
    signal input k_low_value[NK]; signal input k_low_next_index[NK]; signal input k_low_next_value[NK];
    signal input k_sib[NK][RD]; signal input k_bit[NK][RD];
    signal input holder_sk;
    // ---- action context ----
    signal input ctx_hash;
    signal input act_req_cap;
    // ---- owner view key and owner ciphertext ----
    signal input own_w[2];
    var NA = D + 1;
    signal input own_r; signal input own_kx; signal input own_ky;
    signal input own_c1x; signal input own_c1y; signal input own_c2x; signal input own_c2y;     // public
    signal input own_e[NA]; signal input own_esign;                                            // public

    component ovk = OwnerViewKey(); ovk.w[0] <== own_w[0]; ovk.w[1] <== own_w[1];

    signal cert[D];
    component ch0;
    component ch[D];
    component sg[D];
    component mtd[D > 1 ? D - 1 : 1];
    component mtle[D > 1 ? D - 1 : 1];
    component mv[D > 1 ? D - 1 : 1];
    component rv[D];
    component ex[D];
    for (var i = 0; i < D; i++) {
        if (i == 0) {                                   // root certificate binds the owner view key
            ch0 = Poseidon(9);
            ch0.inputs[0] <== 0;
            ch0.inputs[1] <== ent_Ax[0]; ch0.inputs[2] <== ent_Ay[0];
            ch0.inputs[3] <== ent_Ax[1]; ch0.inputs[4] <== ent_Ay[1];
            ch0.inputs[5] <== cap[0]; ch0.inputs[6] <== expiry[0];
            ch0.inputs[7] <== ovk.vpk[0]; ch0.inputs[8] <== ovk.vpk[1];
            cert[0] <== ch0.out;
        } else {
            ch[i] = Poseidon(7);
            ch[i].inputs[0] <== i;
            ch[i].inputs[1] <== ent_Ax[i]; ch[i].inputs[2] <== ent_Ay[i];
            ch[i].inputs[3] <== ent_Ax[i + 1]; ch[i].inputs[4] <== ent_Ay[i + 1];
            ch[i].inputs[5] <== cap[i]; ch[i].inputs[6] <== expiry[i];
            cert[i] <== ch[i].out;
        }

        sg[i] = EdDSAPoseidonVerifier();
        sg[i].enabled <== 1;
        sg[i].Ax <== ent_Ax[i]; sg[i].Ay <== ent_Ay[i];
        sg[i].S <== sig_S[i]; sg[i].R8x <== sig_R8x[i]; sg[i].R8y <== sig_R8y[i];
        sg[i].M <== cert[i];

        if (i == 0) {
            m_depth[0] === 0;
            m_index[0] === 0;
            for (var j = 0; j < MD; j++) { m_sib[0][j] === 0; }
        } else {
            mtd[i - 1] = Num2Bits(8); mtd[i - 1].in <== m_depth[i];
            mtle[i - 1] = LessEqThan(8); mtle[i - 1].in[0] <== m_depth[i]; mtle[i - 1].in[1] <== MD; mtle[i - 1].out === 1;
            mv[i - 1] = BinaryMerkleRoot(MD);
            mv[i - 1].leaf <== cert[i]; mv[i - 1].depth <== m_depth[i]; mv[i - 1].index <== m_index[i];
            for (var j = 0; j < MD; j++) { mv[i - 1].siblings[j] <== m_sib[i][j]; }
            issued_root === mv[i - 1].out;
        }

        rv[i] = IMTNonMember(RD);
        rv[i].root <== revoked_root; rv[i].key_full <== cert[i];
        rv[i].low_value <== r_low_value[i]; rv[i].low_next_index <== r_low_next_index[i]; rv[i].low_next_value <== r_low_next_value[i];
        for (var j = 0; j < RD; j++) { rv[i].sib[j] <== r_sib[i][j]; rv[i].bit[j] <== r_bit[i][j]; }

        ex[i] = LeqU64();
        ex[i].a <== now; ex[i].b <== expiry[i];
    }
    component rtd = Num2Bits(8); rtd.in <== rt_depth;
    component rtle = LessEqThan(8); rtle.in[0] <== rt_depth; rtle.in[1] <== RT; rtle.out === 1;
    component rtm = BinaryMerkleRoot(RT);
    rtm.leaf <== cert[0]; rtm.depth <== rt_depth; rtm.index <== rt_index;
    for (var j = 0; j < RT; j++) { rtm.siblings[j] <== rt_sib[j]; }
    root_root === rtm.out;

    var KEY_TAG = 2053861995;
    component kh[NK];
    component kv[NK];
    if (D == 1) {
        k_low_value[0] === 0; k_low_next_index[0] === 0; k_low_next_value[0] === 0;
        for (var j = 0; j < RD; j++) { k_sib[0][j] === 0; k_bit[0][j] === 0; }
    } else {
        for (var t = 0; t < D - 1; t++) {
            kh[t] = Poseidon(3);
            kh[t].inputs[0] <== KEY_TAG; kh[t].inputs[1] <== ent_Ax[t + 2]; kh[t].inputs[2] <== ent_Ay[t + 2];
            kv[t] = IMTNonMember(RD);
            kv[t].root <== revoked_root; kv[t].key_full <== kh[t].out;
            kv[t].low_value <== k_low_value[t]; kv[t].low_next_index <== k_low_next_index[t]; kv[t].low_next_value <== k_low_next_value[t];
            for (var j = 0; j < RD; j++) { kv[t].sib[j] <== k_sib[t][j]; kv[t].bit[j] <== k_bit[t][j]; }
        }
    }

    // owner ciphertext: ent[0..D] encrypted to vpk
    component accU = AccHybridCompressed(NA);
    accU.pk[0] <== ovk.vpk[0]; accU.pk[1] <== ovk.vpk[1];
    accU.r <== own_r; accU.kx <== own_kx; accU.ky <== own_ky;
    accU.c1x <== own_c1x; accU.c1y <== own_c1y; accU.c2x <== own_c2x; accU.c2y <== own_c2y;
    for (var j = 0; j < NA; j++) { accU.px[j] <== ent_Ax[j]; accU.py[j] <== ent_Ay[j]; accU.e[j] <== own_e[j]; }
    accU.e_sign <== own_esign;

    component cs[D > 1 ? D - 1 : 1];
    component es[D > 1 ? D - 1 : 1];
    for (var i = 0; i + 1 < D; i++) {
        cs[i] = CapSubset(); cs[i].parent <== cap[i]; cs[i].child <== cap[i + 1];
        es[i] = LeqU64(); es[i].a <== expiry[i + 1]; es[i].b <== expiry[i];
    }

    component pbk = BabyPbk();
    pbk.in <== holder_sk;
    pbk.Ax === ent_Ax[D]; pbk.Ay === ent_Ay[D];
    component sk_bits = Num2Bits(251);
    sk_bits.in <== holder_sk;
    component sk_range = LessThan(251);
    sk_range.in[0] <== holder_sk;
    sk_range.in[1] <== 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    sk_range.out === 1;
    signal sk_inv; sk_inv <-- holder_sk != 0 ? 1 / holder_sk : 0;
    sk_inv * holder_sk === 1;

    component reqsub = CapSubset();
    reqsub.parent <== cap[D - 1]; reqsub.child <== act_req_cap;
    signal ctx_sq; ctx_sq <== ctx_hash * ctx_hash;
    component sr = Poseidon(3); sr.inputs[0] <== issued_root; sr.inputs[1] <== revoked_root; sr.inputs[2] <== root_root;
    state_root === sr.out;
    // ---- budget note (unchanged from v8/v9) ----
    signal input note_root; signal input budget_nf; signal input cm_change; signal input q_spent;
    signal input q_in; signal input rho_in; signal input q_change; signal input rho_change;
    signal input nt_depth; signal input nt_index; signal input nt_sib[NT];
    assert(D <= 4);
    signal lin[4];
    for (var j = 0; j < 4; j++) { if (j < D) { lin[j] <== cert[j]; } else { lin[j] <== 0; } }
    component bcin = Poseidon(8); bcin.inputs[0] <== ent_Ax[D]; bcin.inputs[1] <== ent_Ay[D]; bcin.inputs[2] <== q_in;
    for (var j = 0; j < 4; j++) bcin.inputs[3 + j] <== lin[j];
    bcin.inputs[7] <== rho_in;
    component ntd = Num2Bits(8); ntd.in <== nt_depth;
    component ntle = LessEqThan(8); ntle.in[0] <== nt_depth; ntle.in[1] <== NT; ntle.out === 1;
    component bmem = BinaryMerkleRoot(NT); bmem.leaf <== bcin.out; bmem.depth <== nt_depth; bmem.index <== nt_index;
    for (var i = 0; i < NT; i++) bmem.siblings[i] <== nt_sib[i];
    note_root === bmem.out;
    component bnf = Poseidon(3); bnf.inputs[0] <== 2053857902; bnf.inputs[1] <== holder_sk; bnf.inputs[2] <== bcin.out;
    budget_nf === bnf.out;
    component bq0 = Num2Bits(64); bq0.in <== q_in; component bq1 = Num2Bits(64); bq1.in <== q_spent; component bq2 = Num2Bits(64); bq2.in <== q_change;
    q_in === q_spent + q_change;
    component bch = Poseidon(8); bch.inputs[0] <== ent_Ax[D]; bch.inputs[1] <== ent_Ay[D]; bch.inputs[2] <== q_change;
    for (var j = 0; j < 4; j++) bch.inputs[3 + j] <== lin[j];
    bch.inputs[7] <== rho_change;
    cm_change === bch.out;
}
