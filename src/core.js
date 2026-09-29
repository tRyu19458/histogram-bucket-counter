/**
 * HistogramBucketCounter
 *
 * Maintains a fixed set of boundary-defined buckets and routes each
 * recorded value into exactly one bucket. Buckets are defined by an ascending
 * list of numeric boundaries; a value falls into the first bucket whose
 * upper boundary is >= the value. Values above the last boundary go into an
 * overflow bucket.
 *
 * Design decision — boundaries define upper edges, left-inclusive spans:
 * Given boundaries [b0, b1, ..., bn-1], there are n+1 buckets:
 *   bucket 0      : value <= b0
 *   bucket i (1..n-1): b[i-1] < value <= b[i]
 *   bucket n (overflow): value > b[n-1]
 *
 * NaN is rejected at record() time. Counting NaN would silently corrupt the
 * histogram because every comparison with NaN is false, so it would always
 * land in overflow regardless of magnitude — misleading rather than useful.
 */
export class HistogramBucketCounter {
  /**
   * @param {number[]} boundaries Ascending, finite, non-empty list of bucket
   *   upper edges. Duplicates and out-of-order entries are rejected because
   *   they make bucket assignment ambiguous.
   * @throws {TypeError} if boundaries is not a non-empty array.
   * @throws {RangeError} if any boundary is non-finite, or the array is not
   *   strictly ascending.
   */
  constructor(boundaries) {
    if (!Array.isArray(boundaries) || boundaries.length === 0) {
      throw new TypeError('boundaries must be a non-empty array');
    }
    for (const b of boundaries) {
      if (typeof b !== 'number' || !Number.isFinite(b)) {
        throw new RangeError('every boundary must be a finite number');
      }
    }
    for (let i = 1; i < boundaries.length; i++) {
      if (!(boundaries[i] > boundaries[i - 1])) {
        throw new RangeError(
          'boundaries must be strictly ascending (no duplicates, no decreases)'
        );
      }
    }
    this._boundaries = Array.from(boundaries);
    this._counts = new Array(boundaries.length + 1).fill(0);
  }

  /**
   * Number of buckets, including the overflow bucket.
   * @returns {number}
   */
  get bucketCount() {
    return this._counts.length;
  }

  /**
   * A defensive copy of the bucket boundaries.
   * @returns {number[]}
   */
  get boundaries() {
    return Array.from(this._boundaries);
  }

  /**
   * Routes a value into the appropriate bucket.
   *
   * Returns false (without throwing) when `value` is NaN so callers can
   * decide whether to treat it as an error. Non-finite-but-non-NaN values
   * (Infinity, -Infinity) are accepted deliberately: they map predictably
   * to overflow and the lowest bucket respectively, which is useful when
   * monitoring pipelines that pass through ±Infinity but want to still
   * see the shape of the finite data.
   *
   * @param {number} value The value to record.
   * @returns {boolean} true if the value was counted, false if it was NaN.
   */
  record(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return false;
    }
    const index = this._bucketIndexFor(value);
    this._counts[index]++;
    return true;
  }

  /**
   * Routes the same value `n` times in a row. Useful when a count is already
   * aggregated upstream and re-expanding it would be wasteful.
   *
   * @param {number} value The value to record.
   * @param {number} n Times to count it. Must be a non-negative integer.
   * @returns {boolean} true if counted, false if value was NaN.
   * @throws {RangeError} if n is not a non-negative integer.
   */
  recordMany(value, n) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError('n must be a non-negative integer');
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      if (n === 0) return false;
      return false;
    }
    if (n === 0) return true;
    const index = this._bucketIndexFor(value);
    this._counts[index] += n;
    return true;
  }

  /**
   * Counts per bucket in bucket order (lowest first, overflow last).
   * Returns a fresh array so callers cannot mutate internal state.
   * @returns {number[]}
   */
  counts() {
    return Array.from(this._counts);
  }

  /**
   * Resets all bucket counts to zero. Boundaries are unchanged.
   * @returns {void}
   */
  reset() {
    this._counts.fill(0);
  }

  /**
   * Total number of values recorded (sum of all bucket counts).
   * @returns {number}
   */
  total() {
    let sum = 0;
    for (const c of this._counts) sum += c;
    return sum;
  }

  /**
   * Binary search for the bucket index. Because boundaries are strictly
   * ascending, binary search is safe and keeps record() O(log n).
   *
   * @param {number} value A finite or ±Infinity number (NaN already rejected).
   * @returns {number} Bucket index in [0, boundaries.length].
   */
  _bucketIndexFor(value) {
    const bs = this._boundaries;
    let lo = 0;
    let hi = bs.length; // hi is exclusive upper bound on the answer
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (value <= bs[mid]) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return lo;
  }
}
