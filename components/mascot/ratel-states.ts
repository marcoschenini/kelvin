import type { TargetAndTransition, Transition } from "motion/react";
import type { ArmsPose, RatelAnims } from "./ratel-figure";

export type RatelState = "idle" | "walk" | "point" | "think" | "celebrate" | "sleep";

const loop = (duration: number, extra: Transition = {}): Transition => ({
  duration,
  repeat: Infinity,
  ease: "easeInOut",
  ...extra,
});
const spring: Transition = { type: "spring", stiffness: 160, damping: 14 };

/** Animazione delle singole parti per ogni stato. */
export const PART_ANIMS: Record<RatelState, RatelAnims> = {
  // respira: busto che si gonfia appena, testa e coda che ondeggiano piano
  idle: {
    corpo: { animate: { scaleY: [1, 1.018, 1], scaleX: [1, 1.008, 1] }, transition: loop(3.4) },
    testa: { animate: { rotate: [0, -2, 0.5, 0] }, transition: loop(5.2) },
    coda: { animate: { rotate: [0, 6, 0] }, transition: loop(2.8) },
  },
  // camminata di lato: gambe alternate, coda e testa a tempo
  walk: {
    "zampa-post-sx": { animate: { rotate: [-18, 18, -18] }, transition: loop(0.72, { ease: "linear" }) },
    "zampa-post-dx": { animate: { rotate: [18, -18, 18] }, transition: loop(0.72, { ease: "linear" }) },
    "zampa-ant-sx": { animate: { rotate: [-3, 3, -3] }, transition: loop(0.72) },
    "zampa-ant-dx": { animate: { rotate: [3, -3, 3] }, transition: loop(0.72) },
    coda: { animate: { rotate: [-12, 12, -12] }, transition: loop(0.72) },
    testa: { animate: { rotate: [-3, 2, -3] }, transition: loop(0.72) },
    corpo: { animate: { rotate: [-1.5, 1.5, -1.5] }, transition: loop(0.72) },
  },
  // indica: alza il braccio davanti verso l'obiettivo, testa che guarda su
  point: {
    "zampa-ant-dx": { animate: { rotate: [0, -4, 0] }, transition: loop(1.4) },
    testa: { animate: { rotate: -7 }, transition: spring },
    coda: { animate: { rotate: [0, 8, 0] }, transition: loop(1.6) },
  },
  // pensa: testa inclinata, zampa al mento, occhialoni che scivolano
  think: {
    testa: { animate: { rotate: [11, 14, 11] }, transition: loop(2.2) },
    occhialoni: { animate: { y: [0, 2, 0] }, transition: loop(2.2) },
    coda: { animate: { rotate: [0, -6, 0] }, transition: loop(3) },
  },
  // festeggia: braccia in alto, coda frenetica (il salto è sul contenitore)
  celebrate: {
    "zampa-ant-sx": { animate: { rotate: [-8, 8, -8] }, transition: loop(0.5) },
    "zampa-ant-dx": { animate: { rotate: [8, -8, 8] }, transition: loop(0.5) },
    coda: { animate: { rotate: [-18, 18, -18] }, transition: loop(0.3) },
    testa: { animate: { rotate: [-6, 4, -6] }, transition: loop(0.5) },
    occhialoni: { animate: { y: [0, -3, 0] }, transition: loop(0.5) },
  },
  // dorme: testa che crolla, respiro lento e profondo
  sleep: {
    testa: { animate: { rotate: 18, y: 6 }, transition: { type: "spring", stiffness: 40, damping: 12 } },
    corpo: { animate: { scaleY: [0.985, 1.02, 0.985] }, transition: loop(4.8) },
    coda: { animate: { rotate: 10 }, transition: { duration: 1.2 } },
  },
};

/** Movimento dell'intero Ratel (contenitore) per stato. */
export const BODY_ANIMS: Record<RatelState, { animate: TargetAndTransition; transition: Transition }> = {
  idle: { animate: { y: 0, rotate: 0 }, transition: { duration: 0.4 } },
  walk: { animate: { y: [0, -3.5, 0] }, transition: loop(0.36) },
  point: { animate: { y: 0, rotate: 0 }, transition: spring },
  think: { animate: { y: 0, rotate: 0 }, transition: spring },
  celebrate: { animate: { y: [0, -22, 0], rotate: [0, -4, 0] }, transition: loop(0.5, { ease: "easeOut" }) },
  sleep: { animate: { y: 2, rotate: 0 }, transition: { duration: 1 } },
};

/** Posa delle braccia per stato (le braccia conserte non si prestano a indicare). */
export const ARMS: Record<RatelState, ArmsPose> = {
  idle: "crossed",
  walk: "crossed",
  point: "point",
  think: "chin",
  celebrate: "up",
  sleep: "crossed",
};
