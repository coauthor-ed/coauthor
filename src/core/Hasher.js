/**
 * Cryptography utility for Parent PIN gating (PBKDF2).
 * Uses native Web Crypto API.
 */
export const Hasher = {
  /**
   * Derives a key using PBKDF2.
   * @param {string} pin The raw PIN.
   * @param {Uint8Array} salt The salt.
   * @param {number} iterations Iteration count (e.g., 100000).
   * @returns {Promise<Uint8Array>}
   */
  async derivePBKDF2(pin, salt, iterations = 100000) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // length in bits
    );

    return new Uint8Array(derivedBits);
  },

  /**
   * Generates a random salt.
   */
  generateSalt(length = 16) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
};
