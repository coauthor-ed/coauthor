/**
 * Seeded PRNG using Mulberry32.
 * Crucial for reconstructing test sessions (randomized options, variables) deterministically.
 */
export class PRNG {
  constructor(seed) {
    // If no seed is provided, generate a random one
    this._seed = seed !== undefined ? seed : (Math.random() * 4294967296) >>> 0;
    this._state = this._seed;
  }

  get seed() {
    return this._seed;
  }

  /**
   * Returns a pseudo-random number between 0 (inclusive) and 1 (exclusive).
   */
  next() {
    this._state |= 0;
    this._state = this._state + 0x6D2B79F5 | 0;
    let t = Math.imul(this._state ^ this._state >>> 15, 1 | this._state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Shuffles an array in-place using the Fisher-Yates algorithm.
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Samples 'n' items from the given pool without replacement.
   */
  sample(pool, n) {
    const copy = [...pool];
    this.shuffle(copy);
    return copy.slice(0, n);
  }
}
