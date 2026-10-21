#!/usr/bin/env bash
# constraint count vs (D, issued-tree depth MD, revocation SMT depth RD)
set -euo pipefail; cd "$(dirname "$0")/.."; mkdir -p build/abl results; echo "D,MD,RD,constraints" > results/constraints_ablation.csv
while read -r D MD RD; do
  f=build/abl/m_${D}_${MD}_${RD}.circom
  printf 'pragma circom 2.1.6;\ninclude "../../circuits/zkdac_chain_v3.circom";\ncomponent main {public [issued_root, revoked_root, nullifier, now, ctx_hash, act_req_cap]} = ZkDacChainV3(%s,%s,%s);\n' "$D" "$MD" "$RD" > "$f"
  circom "$f" --r1cs -l node_modules -o build/abl >/dev/null 2>&1
  echo "$D,$MD,$RD,$(snarkjs r1cs info build/abl/m_${D}_${MD}_${RD}.r1cs | grep Constraints | sed 's/.*: //')" | tee -a results/constraints_ablation.csv
done <<'CFG'
4 2 2
4 8 8
4 16 16
4 20 20
4 32 32
4 16 8
4 8 16
1 16 16
2 16 16
3 16 16
CFG
