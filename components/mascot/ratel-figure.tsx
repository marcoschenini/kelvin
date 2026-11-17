"use client";

import { motion, type TargetAndTransition, type Transition } from "motion/react";
import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * Ratel, il tasso guida. Disegno vettoriale in stile incisione:
 * solo linee color crema su fondo trasparente, tratteggi e pelo inciso,
 * nessun riempimento colorato. Le maschere servono solo a:
 *  - nascondere le linee che stanno "dietro" (occlusione);
 *  - modulare la densità del tratto, come la luce in un'incisione.
 *
 * Lettura dei toni "in negativo" (crema su scuro): la striscia chiara della
 * schiena è il tratteggio più fitto; il pelo scuro è più rado, con più segni
 * dove la luce lo colpisce (muso, petto, sopra le braccia).
 *
 * Gruppi animabili (Parte 3): testa, occhialoni, corpo, zampe-anteriori
 * (zampa-ant-sx, zampa-ant-dx), zampe-posteriori (zampa-post-sx,
 * zampa-post-dx), coda. Punti di rotazione in `PIVOTS`.
 */

const INK = "#ECEFEA";

export const PIVOTS = {
  testa: "112px 96px",
  occhialoni: "144px 30px",
  corpo: "148px 288px",
  "zampa-ant-sx": "90px 134px",
  "zampa-ant-dx": "200px 134px",
  "zampa-post-sx": "104px 274px",
  "zampa-post-dx": "172px 278px",
  coda: "80px 262px",
} as const;
export type RatelPart = keyof typeof PIVOTS;

// ---------- forme (riusate per contorni, ritagli e maschere) ----------
// Proporzioni ricalcate sul riferimento: testa piccola su collo lungo,
// busto slanciato, braccia conserte, gambe corte da tasso.
const HEAD =
  "M98 48 C108 35 128 29 150 31 C166 33 176 42 182 51 C188 54 194 57 196 62 C198 68 194 72 188 72 C184 79 180 86 172 91 C160 98 140 100 120 98 C106 96 96 86 94 72 C93 62 94 54 98 48 Z";
const EAR_OUT = "M112 52 C102 48 95 56 97 65 C98 71 104 74 110 71";
const EAR_FILL = `${EAR_OUT} C104 62 104 55 101 50 Z`;
const BACK = "M98 50 C90 64 86 84 84 100 C80 140 76 180 74 220 C73 244 77 262 88 274";
const TORSO = `${BACK} C100 285 120 288 144 288 C172 288 196 282 208 266 C216 246 218 216 212 188 C206 160 196 132 186 112 C182 102 178 95 172 91`;
const TORSO_FILL = `${TORSO} C160 98 120 100 98 50 Z`;
const STRIPE =
  "M150 31 C126 30 107 39 98 50 C90 64 86 84 84 100 C80 140 76 180 74 220 C73 244 77 262 88 274 C90 270 92 268 94 266 C90 240 90 200 92 165 C94 130 98 106 105 88 C112 70 126 50 150 40 Z";
const ARM_BACK =
  "M88 150 C76 170 68 192 70 210 C72 224 84 232 102 233 C140 236 182 232 212 222 C220 218 220 208 212 206 C188 210 150 210 118 204 C102 200 96 186 98 172 C99 162 96 155 88 150 Z";
const ARM_FRONT =
  "M202 150 C214 168 222 188 222 204 C222 220 212 226 198 224 C172 220 146 206 124 192 C112 185 102 180 104 172 C106 165 114 163 122 165 C146 172 168 182 192 186 C198 176 202 164 202 150 Z";
const LEG_L = "M92 268 C86 288 86 306 90 318 M120 272 C124 288 124 306 122 318";
const LEG_L_FILL = "M92 268 C86 288 86 306 90 318 L122 318 C124 306 124 288 120 272 Z";
const LEG_R = "M160 276 C156 294 156 308 158 318 M188 272 C194 290 194 306 190 318";
const LEG_R_FILL = "M160 276 C156 294 156 308 158 318 L190 318 C194 306 194 290 188 272 Z";
const TAIL = "M80 254 C60 260 42 276 30 300 C46 300 62 291 76 279 C81 274 83 266 81 260";
const LENSES = [
  { cx: 130, cy: 30, rx: 13.5, ry: 12 },
  { cx: 158.5, cy: 28.5, rx: 12, ry: 11 },
];

// ---------- pose delle braccia ----------
/**
 * Le braccia conserte sono disegnate a mano (ARM_BACK, ARM_FRONT). Le altre
 * pose sono "tubi" pelosi lungo una linea d'asse: spalla → gomito → zampa.
 */
export type ArmsPose = "crossed" | "point" | "chin" | "up";
type Tube = { pts: Pt[]; r0: number; r1: number };
const ARM_POSES: Record<Exclude<ArmsPose, "crossed">, { back: Tube; front: Tube }> = {
  // braccio vicino teso in avanti e in alto, l'altro lungo il fianco
  point: {
    back: { pts: [[92, 150], [84, 182], [82, 212], [86, 238]], r0: 12, r1: 8 },
    front: { pts: [[198, 150], [212, 130], [226, 110], [240, 92]], r0: 13, r1: 8 },
  },
  // zampa al mento, gomito in fuori
  chin: {
    back: { pts: [[92, 150], [84, 182], [82, 212], [86, 238]], r0: 12, r1: 8 },
    front: { pts: [[200, 148], [216, 172], [220, 194], [204, 184], [190, 146], [182, 112]], r0: 12, r1: 8 },
  },
  // entrambe le braccia in alto
  up: {
    back: { pts: [[92, 152], [82, 124], [76, 98], [72, 72]], r0: 12, r1: 8 },
    front: { pts: [[198, 150], [210, 120], [216, 94], [220, 68]], r0: 13, r1: 8 },
  },
};

// ---------- generatori del tratto inciso (deterministici) ----------
type Pt = [number, number];
const f1 = (n: number) => n.toFixed(1);
function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
/** Contorno chiuso di un "tubo" lungo una linea d'asse, con estremità arrotondate */
function tubePath({ pts, r0, r1 }: Tube): string {
  const n = pts.length;
  const L: Pt[] = [];
  const R: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const m = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / m;
    const ny = (b[0] - a[0]) / m;
    const r = r0 + ((r1 - r0) * i) / (n - 1);
    L.push([p[0] + nx * r, p[1] + ny * r]);
    R.push([p[0] - nx * r, p[1] - ny * r]);
  });
  const smooth = (q: Pt[]) => {
    let d = "";
    for (let i = 1; i < q.length - 1; i++) {
      const mid: Pt = [(q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2];
      d += `Q${f1(q[i][0])} ${f1(q[i][1])} ${f1(mid[0])} ${f1(mid[1])} `;
    }
    return d + `L${f1(q[q.length - 1][0])} ${f1(q[q.length - 1][1])} `;
  };
  const Rr = [...R].reverse();
  return (
    `M${f1(L[0][0])} ${f1(L[0][1])} ` +
    smooth(L) +
    `A${r1} ${r1} 0 0 1 ${f1(Rr[0][0])} ${f1(Rr[0][1])} ` +
    smooth(Rr) +
    `A${r0} ${r0} 0 0 1 ${f1(L[0][0])} ${f1(L[0][1])} Z`
  );
}
/** Artigli all'estremità di un tubo, nella direzione del braccio */
function tubeClaws({ pts, r1 }: Tube): string {
  const n = pts.length;
  const [ex, ey] = pts[n - 1];
  const [px, py] = pts[n - 2];
  const m = Math.hypot(ex - px, ey - py) || 1;
  const tx = (ex - px) / m;
  const ty = (ey - py) / m;
  const nx = -ty;
  const ny = tx;
  let d = "";
  for (const k of [-0.75, -0.25, 0.25, 0.75]) {
    const sx = ex + tx * (r1 - 1) + nx * k * r1;
    const sy = ey + ty * (r1 - 1) + ny * k * r1;
    d += `M${f1(sx)} ${f1(sy)} q${f1(tx * 5 + nx * 2)} ${f1(ty * 5 + ny * 2)} ${f1(tx * 7 + nx * 5)} ${f1(ty * 7 + ny * 5)} `;
  }
  return d;
}
function tubeAngle({ pts }: Tube): number {
  const a = pts[0];
  const b = pts[pts.length - 1];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function tubeBox({ pts, r0 }: Tube) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs) - r0 - 2;
  const y = Math.min(...ys) - r0 - 2;
  return { x, y, w: Math.max(...xs) - x + r0 + 4, h: Math.max(...ys) - y + r0 + 4 };
}
const TUBE_CACHE = new Map<Tube, { d: string; claws: string; fur: string; box: ReturnType<typeof tubeBox> }>();
function tubeArt(t: Tube) {
  let c = TUBE_CACHE.get(t);
  if (!c) {
    const box = tubeBox(t);
    const ang = tubeAngle(t);
    c = { d: tubePath(t), claws: tubeClaws(t), box, fur: furField(box.x, box.y, box.w, box.h, 4.2, 5.2, () => ang + 0.25) };
    TUBE_CACHE.set(t, c);
  }
  return c;
}

/** Ciuffi lungo un contorno, rivolti verso l'esterno (side = ±1) */
function edgeFur(c: [Pt, Pt, Pt, Pt], n: number, len: number, side = 1, lean = 0.5): string {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = bez(...c, t);
    const [x2, y2] = bez(...c, Math.min(1, t + 0.01));
    const m = Math.hypot(x2 - x, y2 - y) || 1;
    const tx = (x2 - x) / m;
    const ty = (y2 - y) / m;
    const nx = -ty * side;
    const ny = tx * side;
    const l = len * (0.65 + ((i * 7) % 5) / 8);
    const ex = (nx + tx * lean) * l;
    const ey = (ny + ty * lean) * l;
    d += `M${f1(x - nx * 1.5)} ${f1(y - ny * 1.5)} q${f1(ex * 0.5 + nx)} ${f1(ey * 0.5 + ny)} ${f1(ex)} ${f1(ey)} `;
  }
  return d;
}
/**
 * Campo di pelo: trattini leggermente curvi che seguono un flusso.
 * flow(x, y) restituisce l'angolo del pelo in quel punto.
 */
function furField(x0: number, y0: number, w: number, h: number, step: number, len: number, flow: (x: number, y: number) => number): string {
  let d = "";
  let row = 0;
  for (let y = y0; y < y0 + h; y += step * 0.8, row++) {
    for (let x = x0 + (row % 2) * (step / 2); x < x0 + w; x += step) {
      const j = (((x * 12.9898 + y * 78.233) % 1) + 1) % 1 || ((x * 7 + y * 3) % 10) / 10;
      const a = flow(x, y) + (j - 0.5) * 0.5;
      const l = len * (0.7 + j * 0.6);
      const ex = Math.cos(a) * l;
      const ey = Math.sin(a) * l;
      const bend = (j - 0.5) * 2.2;
      d += `M${f1(x + j * 2)} ${f1(y)} q${f1(ex / 2 - Math.sin(a) * bend)} ${f1(ey / 2 + Math.cos(a) * bend)} ${f1(ex)} ${f1(ey)} `;
    }
  }
  return d;
}

const DOWN = Math.PI / 2;
const FUR_TORSO = furField(66, 86, 160, 210, 4.6, 6.5, (x) => DOWN + (x - 148) / 260);
const FUR_HEAD = furField(88, 28, 112, 74, 3.6, 4.2, (x, y) => (x > 150 ? 0.25 + (y - 60) / 120 : Math.PI * 0.85));
const FUR_ARM_BACK = furField(64, 146, 160, 92, 4.2, 5.2, (x) => (x < 100 ? DOWN + 0.25 : 0.06));
const FUR_ARM_FRONT = furField(100, 142, 130, 88, 4.2, 5.2, (x) => (x > 198 ? DOWN - 0.15 : Math.PI + 0.45));
const FUR_LEG = furField(84, 266, 112, 60, 3.8, 5, () => DOWN + 0.1);
const FUR_TAIL = furField(26, 250, 60, 54, 3.4, 5, () => Math.PI * 0.82);
const FUR_STRIPE = furField(72, 28, 80, 248, 2.6, 7, (x, y) => (y < 60 ? Math.PI * 0.9 : DOWN + 0.12));

const EDGE = {
  back: edgeFur([[98, 50], [90, 64], [86, 84], [84, 100]], 6, 5, 1, -0.4) +
    edgeFur([[84, 100], [80, 140], [76, 180], [74, 220]], 18, 6, 1, -0.5) +
    edgeFur([[74, 220], [73, 244], [77, 262], [88, 274]], 9, 5.5, 1, -0.5),
  front: edgeFur([[212, 188], [206, 160], [196, 132], [186, 112]], 12, 4.5, -1, 0.5) +
    edgeFur([[186, 112], [182, 102], [178, 95], [172, 91]], 6, 3.5, -1, 0.5),
  hips: edgeFur([[88, 274], [100, 285], [120, 288], [144, 288]], 9, 4, 1, -0.2) +
    edgeFur([[144, 288], [172, 288], [196, 282], [208, 266]], 9, 4, 1, 0.2),
  crown: edgeFur([[98, 48], [108, 35], [128, 29], [150, 31]], 10, 3.5, 1, -0.4),
  jaw: edgeFur([[172, 91], [160, 98], [140, 100], [120, 98]], 9, 3.5, -1, -0.3),
  armBack: edgeFur([[88, 150], [76, 170], [68, 192], [70, 210]], 10, 5, 1, 0.4) +
    edgeFur([[70, 210], [72, 224], [84, 232], [102, 233]], 6, 5, 1, 0.3) +
    edgeFur([[102, 233], [140, 236], [182, 232], [212, 222]], 14, 4.5, 1, 0.2),
  armFront: edgeFur([[202, 150], [214, 168], [222, 188], [222, 204]], 10, 5, -1, -0.4) +
    edgeFur([[222, 204], [222, 220], [212, 226], [198, 224]], 6, 4.5, -1, -0.3) +
    edgeFur([[198, 224], [172, 220], [146, 206], [124, 192]], 12, 4, -1, 0.25),
  tail: edgeFur([[80, 254], [60, 260], [42, 276], [30, 300]], 14, 7, -1, 0.6) +
    edgeFur([[30, 300], [46, 300], [62, 291], [76, 279]], 10, 5, -1, -0.5),
  stripeIn: edgeFur([[150, 40], [126, 50], [112, 70], [105, 88]], 10, 4, 1, 0.6) +
    edgeFur([[105, 88], [98, 106], [94, 130], [92, 165]], 12, 4, 1, 0.6) +
    edgeFur([[92, 165], [90, 200], [90, 240], [92, 266]], 14, 4.5, 1, 0.6),
};

const s = (w: number, o = 1): CSSProperties => ({ stroke: INK, strokeWidth: w, strokeOpacity: o, fill: "none" });

/** Animazione di una parte: target motion + transizione. */
export type PartAnim = { animate: TargetAndTransition; transition?: Transition };
export type RatelAnims = Partial<Record<RatelPart, PartAnim>>;

const REST: TargetAndTransition = { rotate: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 };
const SETTLE: Transition = { type: "spring", stiffness: 140, damping: 16 };

/**
 * Una parte animabile. motion ruota/scala i gruppi SVG attorno al centro del
 * loro riquadro: il rettangolo invisibile, centrato sul perno anatomico
 * (PIVOTS), fa coincidere quel centro con collo, spalla, anca o base coda.
 */
function Part({ name, anims, children }: { name: RatelPart; anims?: RatelAnims; children: ReactNode }) {
  const [px, py] = PIVOTS[name].split(" ").map((v) => parseFloat(v));
  const a = anims?.[name];
  return (
    <motion.g id={name} initial={false} animate={a?.animate ?? REST} transition={a?.transition ?? SETTLE}>
      <rect x={px - 300} y={py - 300} width={600} height={600} fill="none" stroke="none" pointerEvents="none" />
      {children}
    </motion.g>
  );
}

/**
 * Ratel. Senza `anims` è fermo (riposo). `eyesClosed` per lo stato sleep.
 */
export function RatelFigure({
  height = 340,
  anims,
  eyesClosed = false,
  arms = "crossed",
  className,
}: {
  height?: number;
  anims?: RatelAnims;
  eyesClosed?: boolean;
  /** posa delle braccia: conserte, indica, zampa al mento, in alto */
  arms?: ArmsPose;
  className?: string;
}) {
  const pp = { anims };
  const tubes = arms === "crossed" ? null : ARM_POSES[arms];
  const backArt = tubes ? tubeArt(tubes.back) : null;
  const frontArt = tubes ? tubeArt(tubes.front) : null;
  const armB = backArt?.d ?? ARM_BACK;
  const armF = frontArt?.d ?? ARM_FRONT;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;
  // braccio vicino in posa: con la zampa al mento va disegnato davanti alla testa
  const frontArm = frontArt ? (
    <Part name="zampa-ant-dx" anims={anims}>
      <g mask={url("o-arm-f")}>
        <ArmTube art={frontArt} clip={url("c-arm-f")} x1={url("x1")} x2={url("x2")} />
      </g>
    </Part>
  ) : null;
  const box = { maskUnits: "userSpaceOnUse" as const, x: -80, y: -80, width: 400, height: 500 };

  return (
    <svg
      viewBox="0 0 240 340"
      height={height}
      width={(height * 240) / 340}
      className={className}
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
    >
      <defs>
        {/* tratteggi incrociati, leggeri: danno il "fondo" dell'incisione */}
        <pattern id={id("x1")} width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(36)">
          <line x1="0" y1="0" x2="0" y2="3.4" stroke={INK} strokeWidth="0.45" strokeOpacity="0.22" />
        </pattern>
        <pattern id={id("x2")} width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-48)">
          <line x1="0" y1="0" x2="0" y2="4.4" stroke={INK} strokeWidth="0.4" strokeOpacity="0.16" />
        </pattern>
        <pattern id={id("dense")} width="1.7" height="1.7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="1.7" stroke={INK} strokeWidth="0.65" strokeOpacity="0.8" />
        </pattern>

        {/* luce: più segni dove la forma è illuminata */}
        <radialGradient id={id("l-body")} cx="0.66" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#888" />
          <stop offset="1" stopColor="#222" />
        </radialGradient>
        <radialGradient id={id("l-head")} cx="0.72" cy="0.45" r="0.7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.6" stopColor="#999" />
          <stop offset="1" stopColor="#333" />
        </radialGradient>
        <linearGradient id={id("l-arm")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#555" />
        </linearGradient>
        <mask id={id("light-body")} {...box}><rect x="60" y="80" width="170" height="220" fill={url("l-body")} /></mask>
        <mask id={id("light-head")} {...box}><rect x="86" y="26" width="116" height="78" fill={url("l-head")} /></mask>
        <mask id={id("light-arm")} {...box}><rect x="56" y="126" width="176" height="134" fill={url("l-arm")} /></mask>

        {/* ritagli */}
        <clipPath id={id("c-torso")}><path d={TORSO_FILL} /></clipPath>
        <clipPath id={id("c-head")}><path d={HEAD} /></clipPath>
        <clipPath id={id("c-arm-b")}><path d={armB} /></clipPath>
        <clipPath id={id("c-arm-f")}><path d={armF} /></clipPath>
        <clipPath id={id("c-stripe")}><path d={STRIPE} /></clipPath>
        <clipPath id={id("c-tail")}><path d={`${TAIL} Z`} /></clipPath>
        <clipPath id={id("c-leg-l")}><path d={LEG_L_FILL} /></clipPath>
        <clipPath id={id("c-leg-r")}><path d={LEG_R_FILL} /></clipPath>

        {/* occlusione: ciò che sta davanti "buca" ciò che sta dietro */}
        <mask id={id("o-behind")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          <path d={TORSO_FILL} fill="#000" />
        </mask>
        <mask id={id("o-torso")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          <path d={armB} fill="#000" />
          <path d={armF} fill="#000" />
          <path d={HEAD} fill="#000" />
          <path d={STRIPE} fill="#000" />
        </mask>
        <mask id={id("o-stripe")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          <path d={armB} fill="#000" />
          <path d={armF} fill="#000" />
          <path d={EAR_FILL} fill="#000" />
          <path d={HEAD} fill="#000" />
        </mask>
        <mask id={id("o-arm-b")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          <path d={armF} fill="#000" />
        </mask>
        {/* la testa copre il braccio quando la zampa è al mento o in alto */}
        <mask id={id("o-arm-f")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          {arms === "up" && <path d={HEAD} fill="#000" />}
        </mask>
        <mask id={id("o-head")} {...box}>
          <rect x="-80" y="-80" width="400" height="500" fill="#fff" />
          {LENSES.map((l, i) => (
            <ellipse key={i} cx={l.cx} cy={l.cy} rx={l.rx + 1} ry={l.ry + 1} fill="#000" transform={`rotate(-10 ${l.cx} ${l.cy})`} />
          ))}
          <path d={EAR_FILL} fill="#000" />
          {arms === "chin" && <path d={armF} fill="#000" />}
        </mask>
      </defs>

      {/* ================= CODA ================= */}
      <Part name="coda" {...pp}>
        <g mask={url("o-behind")}>
          <g clipPath={url("c-tail")}>
            <path d={FUR_TAIL} style={s(0.6, 0.75)} />
          </g>
          <path d={TAIL} style={s(1.3)} />
          <path d={EDGE.tail} style={s(0.7, 0.85)} />
        </g>
      </Part>

      {/* ================= ZAMPE POSTERIORI ================= */}
      <g id="zampe-posteriori" mask={url("o-behind")}>
        {(
          [
            ["zampa-post-sx", LEG_L, "c-leg-l", "M90 318 C88 327 91 333 100 333 L123 333 C130 333 131 327 124 320", "M126 331 c3 .5 6 2.5 7 6 M119 333 c2.5 1 4.5 3 5 6 M112 333 c2 1 3.5 3 3.5 6"],
            ["zampa-post-dx", LEG_R, "c-leg-r", "M158 318 C156 327 159 333 168 333 L191 333 C198 333 199 327 191 320", "M193 331 c3 .5 6 2.5 7 6 M186 333 c2.5 1 4.5 3 5 6 M179 333 c2 1 3.5 3 3.5 6"],
          ] as const
        ).map(([name, leg, clip, foot, claws]) => (
          <Part key={name} name={name} {...pp}>
            <g clipPath={url(clip)}>
              <rect x="80" y="262" width="120" height="66" fill={url("x1")} />
              <path d={FUR_LEG} style={s(0.55, 0.5)} />
            </g>
            <path d={leg} style={s(1.3)} />
            <path d={foot} style={s(1.3)} />
            <path d={claws} style={s(1)} />
          </Part>
        ))}
      </g>

      {/* ================= CORPO (busto, collo, striscia) ================= */}
      <Part name="corpo" {...pp}>
        <g mask={url("o-torso")}>
          <g clipPath={url("c-torso")}>
            <rect x="60" y="80" width="170" height="220" fill={url("x1")} />
            <rect x="60" y="80" width="170" height="220" fill={url("x2")} />
            <g mask={url("light-body")}>
              <path d={FUR_TORSO} style={s(0.6, 0.85)} />
            </g>
          </g>
          <path d={TORSO} style={s(1.4)} />
          <path d={EDGE.front + EDGE.hips} style={s(0.7, 0.8)} />
          {/* collo: pieghe del pelo sotto il mento */}
          <path d="M150 104 c10 6 22 8 34 6 M146 116 c12 8 28 10 42 6 M150 128 c12 6 26 8 40 4" style={s(0.6, 0.45)} />
        </g>
        {/* striscia chiara: dalla corona giù lungo la schiena */}
        <g mask={url("o-stripe")}>
          <g clipPath={url("c-stripe")}>
            <path d={FUR_STRIPE} style={s(0.7, 0.95)} />
          </g>
          <path d={BACK} style={s(1.3)} />
          <path d={EDGE.back} style={s(0.75, 0.95)} />
          <path d={EDGE.stripeIn} style={s(0.6, 0.6)} />
        </g>
      </Part>

      {/* ================= ZAMPE ANTERIORI (braccia conserte) ================= */}
      <g id="zampe-anteriori">
        {backArt && frontArt ? (
          <>
            <Part name="zampa-ant-sx" {...pp}>
              <g mask={url("o-arm-b")}>
                <ArmTube art={backArt} clip={url("c-arm-b")} x1={url("x1")} x2={url("x2")} />
              </g>
            </Part>
            {arms !== "chin" && frontArm}
          </>
        ) : (
        <>
        <Part name="zampa-ant-sx" {...pp}>
          <g mask={url("o-arm-b")}>
            <g clipPath={url("c-arm-b")}>
              <rect x="60" y="140" width="170" height="120" fill={url("x1")} />
              <rect x="60" y="140" width="170" height="120" fill={url("x2")} />
              <g mask={url("light-arm")}>
                <path d={FUR_ARM_BACK} style={s(0.6, 0.85)} />
              </g>
            </g>
            <path d={ARM_BACK} style={s(1.4)} />
            <path d={EDGE.armBack} style={s(0.7, 0.8)} />
            {/* piega del gomito */}
            <path d="M76 216 c6 4 14 6 22 5 M74 206 c6 5 14 8 22 8" style={s(0.6, 0.5)} />
          </g>
        </Part>
        <Part name="zampa-ant-dx" {...pp}>
          <g clipPath={url("c-arm-f")}>
            <rect x="96" y="126" width="134" height="118" fill={url("x1")} />
            <rect x="96" y="126" width="134" height="118" fill={url("x2")} />
            <g mask={url("light-arm")}>
              <path d={FUR_ARM_FRONT} style={s(0.6, 0.9)} />
            </g>
          </g>
          <path d={ARM_FRONT} style={s(1.5)} />
          <path d={EDGE.armFront} style={s(0.7, 0.85)} />
          <path d="M214 212 c-6 4 -14 6 -22 4 M219 200 c-4 6 -10 10 -18 11 M194 196 c-14 -3 -30 -10 -44 -17" style={s(0.6, 0.5)} />
          {/* artigli lunghi e ricurvi, appoggiati sull'altro braccio */}
          <path
            d="M122 166 C113 160 105 162 101 169 M118 171 C109 169 102 173 100 180 M118 177 C110 178 105 183 106 190 M122 182 C117 186 116 191 118 197"
            style={s(1.5)}
          />
          <path d="M101 169 l-1.5 2.5 M100 180 l-1 3 M106 190 l-.5 3 M118 197 l.5 3" style={s(1.2)} />
          <path d="M124 168 c3 4 4 10 2 16" style={s(0.7, 0.6)} />
        </Part>
        </>
        )}
      </g>

      {/* ================= TESTA ================= */}
      <Part name="testa" {...pp}>
        <g mask={url("o-head")}>
          <g clipPath={url("c-head")}>
            <rect x="86" y="26" width="116" height="78" fill={url("x1")} />
            <g mask={url("light-head")}>
              <path d={FUR_HEAD} style={s(0.55, 0.95)} />
            </g>
            {/* corona chiara che continua la striscia */}
            <path d="M150 31 C126 30 107 39 98 50 C95 56 94 62 95 68 C100 60 108 52 118 46 C128 41 138 38 150 40 Z" fill={url("dense")} />
          </g>
          <path d={HEAD} style={s(1.4)} />
          <path d={EDGE.crown + EDGE.jaw} style={s(0.6, 0.75)} />
          {/* muso: canna nasale e guancia */}
          <path d="M162 51 C172 53 180 57 187 58" style={s(0.8, 0.75)} />
          <path d="M128 76 c8 6 18 8 28 6 M124 86 c10 6 24 8 36 4" style={s(0.6, 0.55)} />
          {/* naso */}
          <ellipse cx="190" cy="62.5" rx="6.2" ry="4.8" fill={url("dense")} />
          <ellipse cx="190" cy="62.5" rx="6.2" ry="4.8" style={s(1.3)} />
          <path d="M188.5 64.5 q1.5 1.6 3.2 .2" style={s(0.8)} />
          <path d="M186.5 59.5 q2 -1.2 4 -.6" style={s(0.9)} />
          {/* occhio socchiuso, sguardo furbo */}
          {eyesClosed ? (
            <path d="M139 57 Q146 60 154 56" style={s(1.3)} />
          ) : (
            <>
              <path d="M139 57 Q146 51 154 55 Q147 60 139 57 Z" style={s(1.2)} />
              <circle cx="147" cy="56" r="1.7" fill={INK} />
            </>
          )}
          <path d="M137 51 Q147 45 157 50" style={s(1, 0.9)} />
          <path d="M140 61 q7 3 13 0" style={s(0.6, 0.6)} />
          {/* ghigno con canino */}
          <path d="M150 80 C160 84 174 82 186 73" style={s(1.4)} />
          <path d="M150 80 c-3 -1 -5 -3 -5 -6" style={s(1.1)} />
          <path d="M157 82 L159 88.5 L161.5 82.6" style={s(1.1)} />
          <path d="M160 88 c6 2 14 1 20 -4" style={s(0.6, 0.6)} />
        </g>
        {/* orecchio: piccolo e tondo, sopra la striscia */}
        <path d={EAR_OUT} style={s(1.3)} />
        <path d="M108 55 C102 54 99 60 101 65" style={s(0.7, 0.75)} />
        <path d="M103 59 l3 1.5 M102 63 l3 .8" style={s(0.6, 0.6)} />

        {/* ================= OCCHIALONI (seguono la testa) ================= */}
        <Part name="occhialoni" {...pp}>
        {/* cinghia che gira dietro la testa */}
        <path d="M118 33 C110 35 104 39 100 45" style={s(5, 0.18)} />
        <path d="M117 30.5 C108 33 102 37 98 43 M119 35.5 C111 37.5 106 41 102 47" style={s(1.1)} />
        <path d="M104 41 l3 3 M108 38 l2.5 3.4 M112 36 l2 3.6" style={s(0.7, 0.8)} />
        {LENSES.map((l, i) => (
          <g key={i} transform={`rotate(-10 ${l.cx} ${l.cy})`}>
            <ellipse cx={l.cx - 2.6} cy={l.cy + 1.6} rx={l.rx} ry={l.ry} style={s(1.1, 0.7)} />
            <path d={`M${f1(l.cx - l.rx * 0.2)} ${f1(l.cy - l.ry)} l-2.6 1.6 M${f1(l.cx - l.rx)} ${f1(l.cy + 1)} l-2.6 1.6 M${f1(l.cx)} ${f1(l.cy + l.ry)} l-2.6 1.6`} style={s(0.9, 0.7)} />
            <ellipse cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} style={s(1.5)} />
            <ellipse cx={l.cx} cy={l.cy} rx={l.rx - 1.6} ry={l.ry - 1.6} style={s(1.8, 0.2)} />
            <ellipse cx={l.cx} cy={l.cy} rx={l.rx - 3} ry={l.ry - 3} style={s(1.1)} />
            {[20, 80, 140, 200, 260, 320].map((a) => (
              <circle
                key={a}
                cx={l.cx + Math.cos((a * Math.PI) / 180) * (l.rx - 1.6)}
                cy={l.cy + Math.sin((a * Math.PI) / 180) * (l.ry - 1.6)}
                r="0.7"
                fill={INK}
              />
            ))}
            {/* vetro: tratteggio fitto in basso, riflesso in alto */}
            <ellipse cx={l.cx} cy={l.cy + 2} rx={l.rx - 4} ry={l.ry - 5} fill={url("x1")} />
            <path
              d={`M${f1(l.cx - l.rx * 0.5)} ${f1(l.cy - l.ry * 0.05)} Q${f1(l.cx - l.rx * 0.42)} ${f1(l.cy - l.ry * 0.5)} ${f1(l.cx)} ${f1(l.cy - l.ry * 0.55)}`}
              style={s(2.2)}
            />
            <circle cx={l.cx + l.rx * 0.32} cy={l.cy + l.ry * 0.3} r="1.2" fill={INK} />
          </g>
        ))}
        {/* ponte */}
        <path d="M143 30 Q145 26.5 147 27.5" style={s(2)} />
        </Part>
      </Part>

      {arms === "chin" && frontArm}
    </svg>
  );
}

/** Braccio in posa "tubo": tratteggio, pelo, contorno, ciuffi e artigli. */
function ArmTube({ art, clip, x1, x2 }: { art: ReturnType<typeof tubeArt>; clip: string; x1: string; x2: string }) {
  const { box } = art;
  return (
    <>
      <g clipPath={clip}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={x1} />
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={x2} />
        <path d={art.fur} style={s(0.6, 0.85)} />
      </g>
      <path d={art.d} style={s(1.5)} />
      <path d={art.claws} style={s(1.4)} />
    </>
  );
}
