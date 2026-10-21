pragma circom 2.1.6;
// v9.2 = v9.1 + non-zero holder secret (T7c F-2; PREREGISTRATION.md). v9.1 header follows.
// ZK-DAC chain circuit v9 (#41) = v8 with fewer public inputs: (1) no action nullifier (each action consumes a budget note; budget_nf makes the proof
// single-use); (3) state_root = Poseidon(issued_root, revoked_root, root_root) replaces the three roots as public input (they become private);
// (4) mode-C accountability with compressed keys (AccHybridCompressed: y-coordinates + one parity word). Mode C only. v8 header follows.
// ZK-DAC chain circuit v8 (#39, H3 option C) = v7 + a private BUDGET NOTE spent by the action. The note's owner is the terminal holder ent[D] and its
// lineage is this chain's own certificate hashes (lin[j] = cert[j], j < D; 0 otherwise), so v7's per-hop / per-key revocation checks freeze the budget of a
// revoked branch with no extra revocation logic. note = Poseidon(owner.x, owner.y, q, lin[0..3], rho); budget_nf = Poseidon(TAG_BNF, holder_sk, cm_in);
// q_in = q_spent + q_change with 64-bit ranges; the change note keeps owner and lineage. New public inputs (after v7's): note_root, budget_nf, cm_change, q_spent.
// v7 header follows.
// ZK-DAC chain circuit v7 = v6 + R6 accountability in the action proof (issue #30): all chain keys ent[0..D] are encrypted to the auditor key
// TPK (public, set by the verifier contract) with fresh randomness. MODE 0 = per-key ElGamal (AccElGamal), MODE 1 = ElGamal-encapsulated
// ephemeral point + Poseidon keystream (AccHybrid). Ciphertexts are public inputs. v6 header follows.
// ZK-DAC chain circuit v6 = v5 + holder-key revocation (issue #28): the revocation set (same indexed Merkle tree, same public
// revoked_root) may also hold key entries H(KEY_TAG, Ax, Ay); every delegate key ent[2..D] (each sub-agent, including the terminal
// holder) must be absent from it, so a revoked key is dead in every certificate it holds or issues. ent[1] (master) is not checked
// here: a master is invalidated by re-registration (registry replaces leaf0, #17). ent[0] is the human. v5 header follows.
// ZK-DAC chain circuit v5 = v4 + registered-root tree (issue #17, option b): the hop-0 certificate must be a leaf of the on-chain LeanIMT of
// registered root certificates (public root_root, membership exactly as in the registration circuit / Semaphore: @zk-kit BinaryMerkleRoot);
// hops >= 1 stay in the delegation (issued) tree. Main circuit from 2026-10-08. v4 header follows.
// ZK-DAC chain circuit v4 = v3 (layout C) with indexed-Merkle-tree revocation (issue #24, IMT depth = RD = 20).
// Derived from revocation_imt/circuits/zkdac_chain_v3_imt.circom (validated in PR #25); v3 header follows.
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
include "imt.circom";
include "binary-merkle-root.circom";
include "accountability_v9.circom";            // @zk-kit/binary-merkle-root.circom 2.0.0 (LeanIMT-compatible)

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
template ZkDacChainV9(D, MD, RD, RT, NT) {
    // ---- public ----
    signal input state_root;                    // v9: Poseidon(issued_root, revoked_root, root_root); the three roots are private
    signal input now;
    signal input issued_root;
    signal input revoked_root;
    signal input root_root;                     // LeanIMT root of registered hop-0 certificates (#17), maintained by the registry contract
    // ---- private: chain ----
    signal input ent_Ax[D + 1];
    signal input ent_Ay[D + 1];
    signal input sig_S[D]; signal input sig_R8x[D]; signal input sig_R8y[D];
    signal input cap[D];
    signal input expiry[D];
    signal input m_sib[D][MD]; signal input m_bit[D][MD];
    signal input r_low_value[D]; signal input r_low_next_index[D]; signal input r_low_next_value[D];
    signal input r_sib[D][RD]; signal input r_bit[D][RD];      // IMT path of the low leaf (RD = IMT depth)
    signal input rt_depth; signal input rt_index; signal input rt_sib[RT];   // hop-0 membership in the registered-root tree
    // key revocation (#28): IMT low-leaf witness for H(KEY_TAG, ent[j]), j = 2..D, stored at index j - 2 (one zeroed slot when D = 1)
    var NK = D > 1 ? D - 1 : 1;
    signal input k_low_value[NK]; signal input k_low_next_index[NK]; signal input k_low_next_value[NK];
    signal input k_sib[NK][RD]; signal input k_bit[NK][RD];
    signal input holder_sk;          // terminal holder secret scalar (BabyJub), < subgroup order
    // ---- private: action context (digest is public) ----
    signal input ctx_hash;                      // variant C: keccak(context) >> 8, computed by the contract
    signal input act_req_cap;
    // ---- R6 accountability (#30): public TPK + ciphertexts, private randomness ----
    signal input tpk[2];
    var NA = D + 1;
    signal input acc_r; signal input acc_kx; signal input acc_ky;
    signal input acc_c1x; signal input acc_c1y; signal input acc_c2x; signal input acc_c2y;
    signal input acc_e[NA]; signal input acc_esign;

    // certificate hash binds hop index, issuer key, holder key, capability, expiry
    signal cert[D];
    component ch[D];
    component sg[D];
    component mv[D > 1 ? D - 1 : 1];             // issued-tree membership for hops >= 1
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

        if (i == 0) {                                   // hop 0 is checked against root_root below; no free witness fields
            for (var j = 0; j < MD; j++) { m_sib[0][j] === 0; m_bit[0][j] === 0; }
        } else {
            mv[i - 1] = MerkleMember(MD);
            mv[i - 1].leaf <== cert[i]; mv[i - 1].root <== issued_root;
            for (var j = 0; j < MD; j++) { mv[i - 1].sib[j] <== m_sib[i][j]; mv[i - 1].bit[j] <== m_bit[i][j]; }
        }

        rv[i] = IMTNonMember(RD);                      // indexed Merkle tree non-membership (issue #24)
        rv[i].root <== revoked_root; rv[i].key_full <== cert[i];
        rv[i].low_value <== r_low_value[i]; rv[i].low_next_index <== r_low_next_index[i]; rv[i].low_next_value <== r_low_next_value[i];
        for (var j = 0; j < RD; j++) { rv[i].sib[j] <== r_sib[i][j]; rv[i].bit[j] <== r_bit[i][j]; }

        ex[i] = LeqU64();                               // not expired at `now`
        ex[i].a <== now; ex[i].b <== expiry[i];
    }
    // hop 0 must be a registered root certificate (#17): LeanIMT membership; depth bounded here because BinaryMerkleRoot returns 0
    // for depth > RT (an empty LeanIMT also has root 0)
    component rtd = Num2Bits(8); rtd.in <== rt_depth;
    component rtle = LessEqThan(8); rtle.in[0] <== rt_depth; rtle.in[1] <== RT; rtle.out === 1;
    component rtm = BinaryMerkleRoot(RT);
    rtm.leaf <== cert[0]; rtm.depth <== rt_depth; rtm.index <== rt_index;
    for (var j = 0; j < RT; j++) { rtm.siblings[j] <== rt_sib[j]; }
    root_root === rtm.out;

    // holder-key revocation (#28): delegate keys ent[2..D] must not be in the revocation set
    var KEY_TAG = 2053861995;                   // ASCII "zkrk"; certificate keys are Poseidon(7) outputs, key entries Poseidon(3)
    component kh[NK];
    component kv[NK];
    if (D == 1) {                               // no delegate key below the master: the slot must be zero (no free witness fields)
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

    // R6 accountability (#30)
    component accC = AccHybridCompressed(NA);
    accC.pk[0] <== tpk[0]; accC.pk[1] <== tpk[1];
    accC.r <== acc_r; accC.kx <== acc_kx; accC.ky <== acc_ky;
    accC.c1x <== acc_c1x; accC.c1y <== acc_c1y; accC.c2x <== acc_c2x; accC.c2y <== acc_c2y;
    for (var j = 0; j < NA; j++) { accC.px[j] <== ent_Ax[j]; accC.py[j] <== ent_Ay[j]; accC.e[j] <== acc_e[j]; }
    accC.e_sign <== acc_esign;

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
    // v9.2 (T7c finding F-2): holder_sk != 0, i.e. ent[D] = holder_sk * Base8 != identity (Base8 has prime order l and holder_sk < l)
    signal sk_inv; sk_inv <-- holder_sk != 0 ? 1 / holder_sk : 0;
    sk_inv * holder_sk === 1;

    // required capability must be covered by the terminal cert; ctx_hash is a public input bound by the proof (v9: no action nullifier)
    component reqsub = CapSubset();
    reqsub.parent <== cap[D - 1]; reqsub.child <== act_req_cap;
    signal ctx_sq; ctx_sq <== ctx_hash * ctx_hash;
    // v9 (3): one public state root
    component sr = Poseidon(3); sr.inputs[0] <== issued_root; sr.inputs[1] <== revoked_root; sr.inputs[2] <== root_root;
    state_root === sr.out;
    // ---- H3 budget note (#39) ----
    signal input note_root; signal input budget_nf; signal input cm_change; signal input q_spent;      // public
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
    component bnf = Poseidon(3); bnf.inputs[0] <== 2053857902; bnf.inputs[1] <== holder_sk; bnf.inputs[2] <== bcin.out;   // TAG_BNF = ASCII "zkbn"
    budget_nf === bnf.out;
    component bq0 = Num2Bits(64); bq0.in <== q_in; component bq1 = Num2Bits(64); bq1.in <== q_spent; component bq2 = Num2Bits(64); bq2.in <== q_change;
    q_in === q_spent + q_change;
    component bch = Poseidon(8); bch.inputs[0] <== ent_Ax[D]; bch.inputs[1] <== ent_Ay[D]; bch.inputs[2] <== q_change;
    for (var j = 0; j < 4; j++) bch.inputs[3 + j] <== lin[j];
    bch.inputs[7] <== rho_change;
    cm_change === bch.out;
}
