/**
 * Browser shim for mathjs's optional `require("node:crypto")` — only
 * referenced by mathjs's own random-number code paths (Random/pickRandom
 * factories), never called by this app: we only ever use `math.evaluate()`
 * for plain arithmetic, so these are never actually invoked. They throw
 * rather than silently returning wrong values if that ever changes.
 */
const unavailable = () => { throw new Error('node:crypto shim: unavailable in browser — mathjs random-number features are not supported here.'); };
export default { randomBytes: unavailable, randomFillSync: unavailable, webcrypto: globalThis.crypto };
export const randomBytes = unavailable;
export const randomFillSync = unavailable;
