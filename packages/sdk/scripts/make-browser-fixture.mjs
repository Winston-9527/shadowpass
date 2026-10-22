import fs from "node:fs";
import { ShadowWorld } from "@shadowpass/circuits/world";

const world = await ShadowWorld.create("sdk-browser-d2");
const alice = world.newIdentity();
const steward = world.newIdentity();
const buyer = world.newIdentity();
const view = world.newViewKey();
for (let index = 0; index < 8; index += 1) {
  world.addToGroup(world.newIdentity());
  world.register({ hash: world.rand250() });
  world.notes.insert(world.rand250());
  world.issued.insert(world.rand250());
  world.revoked.insert(world.rand250());
}
world.addToGroup(alice);
const c0 = world.issueRoot(alice, steward, 3n, 10_000n, view);
world.register(c0);
const c1 = world.issue(c0, buyer, 1n, 9_000n);
const note = world.mintNote([c0, c1], 100n);
const { input } = world.actionInput({
  chain: [c0, c1],
  holderSk: buyer.sk,
  note,
  qSpent: 7n,
  ctxHash: 123456789n,
  reqCap: 1n,
  now: 1_000n,
});
fs.mkdirSync(new URL("../browser/public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../browser/public/fixture.json", import.meta.url), JSON.stringify(input));
