// A small seeded random generator (mulberry32) so a match, a shuffle or a screenshot
// scene can be replayed exactly from one seed, and so the game never needs Math.random
// in a place that matters.

/** Build a generator from a 32-bit seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return {
    /** Next float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    /** Next integer in [0, max). */
    int(max) {
      return Math.floor(this.next() * max);
    },
    /** Pick one element of an array, uniformly. */
    pick(items) {
      return items[this.int(items.length)];
    },
    /** A shuffled copy of an array (Fisher-Yates). */
    shuffle(items) {
      const copy = items.slice();
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = this.int(index + 1);
        const held = copy[index];
        copy[index] = copy[other];
        copy[other] = held;
      }
      return copy;
    },
  };
}
