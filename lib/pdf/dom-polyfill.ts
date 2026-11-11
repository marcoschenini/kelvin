/**
 * pdfjs-dist (Node build) expects browser geometry classes. Locally it borrows
 * them from the optional native @napi-rs/canvas package, which is not available
 * on Vercel. Text extraction only needs simple 2D affine maths, so a small
 * pure-JS DOMMatrix (plus inert ImageData / Path2D) is enough and keeps the
 * deployment free of native binaries.
 */

type Init = number[] | { a: number; b: number; c: number; d: number; e: number; f: number } | undefined;

class DOMMatrixLite {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  readonly is2D = true;

  constructor(init?: Init) {
    if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    else if (init && !Array.isArray(init)) ({ a: this.a, b: this.b, c: this.c, d: this.d, e: this.e, f: this.f } = init);
  }

  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }
  get isIdentity() {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  private set6(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
    return this;
  }

  multiplySelf(o: Init) {
    const m = new DOMMatrixLite(o);
    return this.set6(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }
  preMultiplySelf(o: Init) {
    const m = new DOMMatrixLite(o);
    const r = new DOMMatrixLite([m.a, m.b, m.c, m.d, m.e, m.f]).multiplySelf(this);
    return this.set6(r.a, r.b, r.c, r.d, r.e, r.f);
  }
  multiply(o: Init) { return new DOMMatrixLite(this).multiplySelf(o); }
  translateSelf(tx = 0, ty = 0) { return this.multiplySelf([1, 0, 0, 1, tx, ty]); }
  translate(tx = 0, ty = 0) { return new DOMMatrixLite(this).translateSelf(tx, ty); }
  scaleSelf(sx = 1, sy = sx) { return this.multiplySelf([sx, 0, 0, sy, 0, 0]); }
  scale(sx = 1, sy = sx) { return new DOMMatrixLite(this).scaleSelf(sx, sy); }
  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    if (!det) return this.set6(NaN, NaN, NaN, NaN, NaN, NaN);
    return this.set6(this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det);
  }
  inverse() { return new DOMMatrixLite(this).invertSelf(); }
  transformPoint(p: { x?: number; y?: number } = {}) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
  toFloat64Array() { return new Float64Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]); }
}

class ImageDataLite {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class Path2DLite {
  addPath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  rect() {}
  closePath() {}
}

const g = globalThis as Record<string, unknown>;
if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = DOMMatrixLite;
if (typeof g.ImageData === "undefined") g.ImageData = ImageDataLite;
if (typeof g.Path2D === "undefined") g.Path2D = Path2DLite;

export { DOMMatrixLite };
