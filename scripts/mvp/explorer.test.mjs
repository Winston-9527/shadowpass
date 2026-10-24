import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAmount,
  methodLabel,
  parseArgs,
  shorten,
} from "./explorer.mjs";

test("formats atomic USDC amounts without floating point loss", () => {
  assert.equal(formatAmount(40_000_000n), "40 USDC");
  assert.equal(formatAmount(20_199_995n), "20.199995 USDC");
  assert.equal(formatAmount(2_000_001n), "2.000001 USDC");
});

test("shortens hashes and classifies known methods", () => {
  assert.equal(shorten("0x1234567890abcdef", 8, 4), "0x123456…cdef");
  assert.equal(methodLabel("0x532139bf"), "PAY");
  assert.equal(methodLabel("0xd52859cf"), "TREASURY_SUPPLY");
});

test("parses explorer arguments", () => {
  const options = parseArgs([
    "--rpc", "http://127.0.0.1:9545",
    "--agent", "buyer",
    "--last", "20",
    "--watch",
    "--interval", "5000",
    "--no-color",
  ]);
  assert.equal(options.rpc, "http://127.0.0.1:9545");
  assert.deepEqual(options.agents, ["buyer"]);
  assert.equal(options.last, 20);
  assert.equal(options.watch, true);
  assert.equal(options.intervalMs, 5000);
  assert.equal(options.color, false);
});

test("rejects invalid watch/json combinations and invalid numeric values", () => {
  assert.throws(() => parseArgs(["--watch", "--json"]), /cannot be used together/);
  assert.throws(() => parseArgs(["--last", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--interval", "100"]), /at least 500/);
});
