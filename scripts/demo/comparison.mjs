const short = (value) => value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "未上链";

export function buildComparison({
  operation,
  transaction,
  amount,
  payTo,
  proofMs,
}) {
  const action = operation === "treasury" ? "理财存入" : "采购付款";
  const shared = {
    action,
    transaction: transaction ?? null,
    amount,
    payTo: payTo ?? null,
    proofMs: proofMs ?? null,
  };

  if (operation === "treasury") {
    return {
      ...shared,
      shadowpass: {
        title: "ShadowPass：池内授权 + 承诺",
        visible: [
          "调用 Gate，证明资金属于某个未被吊销的授权分支",
          "开通、发卡、划拨与 execute 由 facilitator relay 代付",
          "TREASURY 方法和金额",
          "一次性 budget nullifier",
          "白名单金库与预先承诺的 returnCm",
        ],
        hidden: [
          "Alice 的 EOA / Smart Account 地址",
          "采购与理财属于同一个主人",
          "完整委托树和 Agent 真实身份",
          "金库票据最终归谁",
        ],
        onchain: [
          `Gate.execute → ${short(payTo)}`,
          "Executed(amount, method)",
          "PositionOpened(returnCm, expectedQ)",
        ],
      },
      sessionKey: {
        title: "ERC-7710 / session key：账户执行可见",
        visible: [
          "Smart Account / 签名账户地址",
          "session key 或 delegate 地址与权限",
          "目标合约、selector、金额、nonce",
          "有效期、caveat、delegation 链与执行结果",
        ],
        hidden: [
          "标准本身不保证隐藏执行主体",
          "同账户下的采购和理财可被公共事件关联",
        ],
        onchain: [
          "SmartAccount / DelegationManager",
          "delegate + delegationHash",
          "execute(target, value, data)",
        ],
      },
    };
  }

  return {
    ...shared,
    shadowpass: {
      title: "ShadowPass：一次付款，一个池内承诺",
      visible: [
        "Gate.execute 与支付金额",
        "开通、发卡、划拨与 execute 由 facilitator relay 代付",
        "商户 payTo 和请求哈希",
        "一次性 nullifier 与找零承诺",
        "只有主人查看钥能解开的委托链密文",
      ],
      hidden: [
        "付款的 Agent 地址",
        "Alice 与这笔付款的关联",
        "该 Agent 的其他花费和额度",
        "采购与理财两条分支的关系",
      ],
      onchain: [
        `Gate.execute → ${short(payTo)}`,
        "Executed(budgetNf, amount)",
        "OwnerCiphertext(ct)",
      ],
    },
    sessionKey: {
      title: "ERC-7710 / session key：授权与执行可串",
      visible: [
        "付款 Smart Account 与 session key / delegate",
        "session 权限、有效期、caveat 和 nonce",
        "商户地址、金额、selector 与请求参数",
        "同一账户后续的采购和理财操作",
      ],
      hidden: [
        "通常没有协议级隐私保证",
        "具体暴露字段取决于钱包和 ERC-7710 实现",
      ],
      onchain: [
        "SmartAccount / DelegationManager",
        "delegationHash + caveat",
        "execute(target, value, data)",
      ],
    },
  };
}
