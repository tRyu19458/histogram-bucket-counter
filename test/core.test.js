import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HistogramBucketCounter } from '../src/index.js';

describe('HistogramBucketCounter construction', () => {
  it('rejects a non-array', () => {
    assert.throws(() => new HistogramBucketCounter('1,2,3'), TypeError);
    assert.throws(() => new HistogramBucketCounter(null), TypeError);
    assert.throws(() => new HistogramBucketCounter(undefined), TypeError);
  });

  it('rejects an empty array', () => {
    assert.throws(() => new HistogramBucketCounter([]), TypeError);
  });

  it('rejects non-finite boundaries', () => {
    assert.throws(() => new HistogramBucketCounter([1, NaN, 3]), RangeError);
    assert.throws(() => new HistogramBucketCounter([1, Infinity, 3]), RangeError);
    assert.throws(() => new HistogramBucketCounter([-Infinity, 1, 3]), RangeError);
  });

  it('rejects non-strictly-ascending boundaries', () => {
    assert.throws(() => new HistogramBucketCounter([1, 1, 2]), RangeError);
    assert.throws(() => new HistogramBucketCounter([3, 2, 1]), RangeError);
    assert.throws(() => new HistogramBucketCounter([1, 2, 2, 3]), RangeError);
  });

  it('accepts a single boundary (two buckets)', () => {
    const h = new HistogramBucketCounter([10]);
    assert.equal(h.bucketCount, 2);
    assert.deepEqual(h.boundaries, [10]);
  });

  it('boundaries() returns a defensive copy', () => {
    const h = new HistogramBucketCounter([1, 2, 3]);
    const b = h.boundaries;
    b.push(99);
    assert.deepEqual(h.boundaries, [1, 2, 3]);
  });
});

describe('HistogramBucketCounter record', () => {
  it('routes values to the correct bucket (left-inclusive spans)', () => {
    const h = new HistogramBucketCounter([10, 20, 30]);
    h.record(5);   // <=10 -> 0
    h.record(10);  // <=10 -> 0
    h.record(15);  // 10<..<=20 -> 1
    h.record(20);  // 10<..<=20 -> 1
    h.record(25);  // 20<..<=30 -> 2
    h.record(30);  // 20<..<=30 -> 2
    h.record(100); // >30 -> 3 overflow
    assert.deepEqual(h.counts(), [2, 2, 2, 1]);
    assert.equal(h.total(), 7);
  });

  it('handles negative values and negative boundaries', () => {
    const h = new HistogramBucketCounter([-10, 0, 10]);
    h.record(-100); // <= -10
    h.record(-10);  // <= -10
    h.record(-5);   // -10<..<=0
    h.record(0);    // -10<..<=0
    h.record(5);    // 0<..<=10
    h.record(10);   // 0<..<=10
    h.record(50);   // >10 overflow
    assert.deepEqual(h.counts(), [2, 2, 2, 1]);
  });

  it('returns false for NaN and does not count it', () => {
    const h = new HistogramBucketCounter([1, 2, 3]);
    assert.equal(h.record(NaN), false);
    assert.deepEqual(h.counts(), [0, 0, 0, 0]);
    assert.equal(h.total(), 0);
  });

  it('returns false for non-number values', () => {
    const h = new HistogramBucketCounter([1, 2, 3]);
    assert.equal(h.record('5'), false);
    assert.equal(h.record(undefined), false);
    assert.equal(h.record(null), false);
    assert.equal(h.record({}), false);
    assert.deepEqual(h.counts(), [0, 0, 0, 0]);
  });

  it('counts -Infinity in the lowest bucket', () => {
    const h = new HistogramBucketCounter([0, 10]);
    assert.equal(h.record(-Infinity), true);
    assert.deepEqual(h.counts(), [1, 0, 0]);
  });

  it('counts Infinity in the overflow bucket', () => {
    const h = new HistogramBucketCounter([0, 10]);
    assert.equal(h.record(Infinity), true);
    assert.deepEqual(h.counts(), [0, 0, 1]);
  });

  it('counts exactly on a boundary in the bucket capped by that boundary', () => {
    const h = new HistogramBucketCounter([1, 2, 3]);
    h.record(1);
    h.record(2);
    h.record(3);
    assert.deepEqual(h.counts(), [1, 1, 1, 0]);
  });
});

describe('HistogramBucketCounter recordMany', () => {
  it('counts the same value n times', () => {
    const h = new HistogramBucketCounter([10, 20]);
    assert.equal(h.recordMany(5, 3), true);
    assert.equal(h.recordMany(15, 2), true);
    assert.equal(h.recordMany(25, 4), true);
    assert.deepEqual(h.counts(), [3, 2, 4]);
    assert.equal(h.total(), 9);
  });

  it('with n=0 records nothing and returns true for finite values', () => {
    const h = new HistogramBucketCounter([10]);
    assert.equal(h.recordMany(5, 0), true);
    assert.deepEqual(h.counts(), [0, 0]);
  });

  it('returns false for NaN even when n > 0', () => {
    const h = new HistogramBucketCounter([10]);
    assert.equal(h.recordMany(NaN, 5), false);
    assert.deepEqual(h.counts(), [0, 0]);
  });

  it('rejects negative or non-integer n', () => {
    const h = new HistogramBucketCounter([10]);
    assert.throws(() => h.recordMany(5, -1), RangeError);
    assert.throws(() => h.recordMany(5, 1.5), RangeError);
    assert.throws(() => h.recordMany(5, '3'), RangeError);
  });
});

describe('HistogramBucketCounter reset and total', () => {
  it('reset zeroes counts and preserves boundaries', () => {
    const h = new HistogramBucketCounter([10, 20]);
    h.record(5);
    h.record(15);
    h.record(25);
    h.reset();
    assert.deepEqual(h.counts(), [0, 0, 0]);
    assert.equal(h.total(), 0);
    assert.deepEqual(h.boundaries, [10, 20]);
    assert.equal(h.bucketCount, 3);
  });

  it('total equals sum of counts after mixed recording', () => {
    const h = new HistogramBucketCounter([1, 2, 3, 4]);
    for (let i = 0; i < 100; i++) h.record((i % 5) - 1);
    const counts = h.counts();
    const manualSum = counts.reduce((a, b) => a + b, 0);
    assert.equal(h.total(), manualSum);
    assert.equal(h.total(), 100);
  });

  it('counts() returns a defensive copy', () => {
    const h = new HistogramBucketCounter([10, 20]);
    h.record(5);
    const c = h.counts();
    c[0] = 999;
    assert.deepEqual(h.counts(), [1, 0, 0]);
  });
});

describe('HistogramBucketCounter stress / determinism', () => {
  it('binary-search routing matches a linear reference across many records', () => {
    const boundaries = [-50, -25, -10, 0, 10, 25, 50, 100];
    const h = new HistogramBucketCounter(boundaries);
    const reference = new Array(boundaries.length + 1).fill(0);
    // Deterministic pseudo-random sequence (no wall-clock, no Math.random).
    let seed = 1234567;
    const next = () => {
      // LCG constants from Numerical Recipes; deterministic and sufficient.
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 5000; i++) {
      const raw = next();
      // Map to range [-200, 200) with a fractional component.
      const value = (raw / 0xffffffff) * 400 - 200;
      h.record(value);
      // Linear reference assignment using the same left-inclusive rule.
      let idx = boundaries.length;
      for (let j = 0; j < boundaries.length; j++) {
        if (value <= boundaries[j]) { idx = j; break; }
      }
      reference[idx]++;
    }
    assert.deepEqual(h.counts(), reference);
    assert.equal(h.total(), 5000);
  });
});
