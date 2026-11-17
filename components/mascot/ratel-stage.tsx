"use client";

import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RatelFigure } from "./ratel-figure";
import { ARMS, BODY_ANIMS, PART_ANIMS, type RatelState } from "./ratel-states";

/**
 * Ratel's stage on the Ask Kelvin page: a small navy floor where he lives and reacts
 * to the conversation, with the animations from our earlier project (walk, point,
 * think, celebrate, sleep, idle). Ported from life_os' RatelProvider, scaled down:
 *
 *  - asking        → think (paw on chin) with "Let me check the case file…"
 *  - answered      → celebrate for a moment; built-in fallback / error → says so
 *  - case changed  → walks to a new spot, then points at the conversation
 *  - idle          → breathes; a short stroll every 25–45 s; asleep (zzz) after 90 s
 *  - clicked       → wakes up, celebrates and gives a tip
 *
 * Event-driven (the page calls the handle), so nothing sets state during render or in
 * an effect body. With reduced motion he stays still and only the bubble changes.
 */

export type AnswerKind = "ai" | "rules" | "fallback" | "error";

export interface RatelStageHandle {
  busy: () => void;
  answered: (kind: AnswerKind) => void;
  focus: (topic: string) => void;
}

const SPEED = 90; // px per second of walking
const PAD = 10;
const SLEEP_AFTER = 90_000;
const DONE_LINES = ["Here you go!", "Found it: check the sources.", "Done. Anything else?", "That's what the file says."];

class Cancelled extends Error {}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const RatelStage = forwardRef<RatelStageHandle, { tips: string[]; height?: number; className?: string }>(function RatelStage(
  { tips, height = 132, className },
  ref,
) {
  const reduced = useReducedMotion() ?? false;
  const stageRef = useRef<HTMLDivElement>(null);
  const fw = Math.round((height * 240) / 340);
  const x = useMotionValue(PAD + 6);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [seq, setSeq] = useState<RatelState | null>(null);
  const [reaction, setReaction] = useState<RatelState | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; id: number } | null>({ text: "Hi! Ask me about your cases.", id: 0 });

  const runId = useRef(0);
  const lastActivity = useRef(0);
  const busyRef = useRef(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxX = () => Math.max(PAD, (stageRef.current?.clientWidth ?? 260) - fw - PAD);

  const say = useCallback((text: string, ms = 3600) => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble({ text, id: Date.now() });
    if (ms > 0) bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  /** Any interaction: note the time and wake him up. */
  const touch = useCallback(() => {
    lastActivity.current = Date.now();
    setAsleep(false);
  }, []);

  const begin = () => ++runId.current;
  const check = (id: number) => {
    if (id !== runId.current) throw new Cancelled();
  };

  const walkTo = useCallback(
    async (id: number, tx: number) => {
      const from = x.get();
      const to = Math.min(Math.max(tx, PAD), maxX());
      if (Math.abs(to - from) < 4 || reduced) return;
      setFacing(to > from ? 1 : -1);
      setSeq("walk");
      const ctl = animate(x, to, { duration: Math.max(0.45, Math.abs(to - from) / SPEED), ease: "linear" });
      const watch = setInterval(() => {
        if (id !== runId.current) ctl.stop();
      }, 80);
      await ctl;
      clearInterval(watch);
      check(id);
    },
    // maxX reads a ref; fw only changes with height
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x, reduced, fw],
  );

  useImperativeHandle(
    ref,
    () => ({
      busy() {
        touch();
        busyRef.current = true;
        begin();
        setSeq(null);
        if (reactionTimer.current) clearTimeout(reactionTimer.current);
        setReaction("think");
        say("Let me check the case file…", 0);
      },
      answered(kind) {
        touch();
        busyRef.current = false;
        if (reactionTimer.current) clearTimeout(reactionTimer.current);
        if (kind === "error") {
          setReaction(null);
          say("Sorry, I couldn't answer that. Try rephrasing it.");
          return;
        }
        if (kind === "fallback") {
          setReaction(null);
          say("The AI is busy, so that's my built-in answer.");
          return;
        }
        setReaction("celebrate");
        say(pick(DONE_LINES), 3000);
        reactionTimer.current = setTimeout(() => setReaction(null), 1800);
      },
      focus(topic) {
        touch();
        const id = begin();
        void (async () => {
          try {
            // Speak at once, then walk to a new spot and point at the conversation.
            say(`Ask me about ${topic}.`, 4200);
            const target = PAD + Math.random() * (maxX() - PAD);
            await walkTo(id, target);
            setFacing(1);
            setSeq("point");
            await wait(2600);
            check(id);
            setSeq(null);
          } catch (e) {
            if (!(e instanceof Cancelled)) throw e;
          }
        })();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [say, touch, walkTo],
  );

  // Idle life: a short stroll now and then, and a nap after a while without activity.
  useEffect(() => {
    lastActivity.current = Date.now();
    if (reduced) return;
    let strollTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      strollTimer = setTimeout(stroll, 25_000 + Math.random() * 20_000);
    };
    async function stroll() {
      const idle = !busyRef.current && document.visibilityState === "visible" && Date.now() - lastActivity.current < SLEEP_AFTER;
      if (!idle) return schedule();
      const id = ++runId.current;
      try {
        const from = x.get();
        const step = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40);
        const to = from + step < PAD || from + step > maxX() ? from - step : from + step;
        await walkTo(id, to);
        setSeq(null);
      } catch (e) {
        if (!(e instanceof Cancelled)) throw e;
      }
      schedule();
    }
    const nap = setInterval(() => {
      if (!busyRef.current && Date.now() - lastActivity.current > SLEEP_AFTER) setAsleep(true);
    }, 5000);
    schedule();
    return () => {
      clearTimeout(strollTimer);
      clearInterval(nap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, walkTo, x]);

  useEffect(
    () => () => {
      runId.current++;
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
    },
    [],
  );

  const state: RatelState = reduced ? "idle" : (reaction ?? seq ?? (asleep ? "sleep" : "idle"));
  const body = BODY_ANIMS[state];

  const poke = () => {
    touch();
    if (busyRef.current) return;
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReaction("celebrate");
    say(`Tip: try “${pick(tips)}”`, 4200);
    reactionTimer.current = setTimeout(() => setReaction(null), 1500);
  };

  return (
    <div
      ref={stageRef}
      className={cn("relative overflow-hidden rounded-2xl bg-mascot", className)}
      style={{ height: height + 74 }}
      onMouseEnter={touch}
    >
      {/* speech bubble (also read out to screen readers) */}
      <div className="absolute inset-x-2.5 top-2.5 min-h-10" role="status" aria-live="polite">
        {/* CSS enter animation (keyed per line): no exit to wait for, so a new line always shows at once */}
        {bubble && (
          <p key={bubble.id} className="kelvin-step-in rounded-xl bg-card px-3 py-2 text-[12.5px] leading-snug text-foreground shadow-sm">
            {bubble.text}
          </p>
        )}
      </div>

      {/* floor */}
      <div className="absolute inset-x-0 bottom-3 h-px bg-mascot-ink/15" aria-hidden="true" />

      <Walker x={x} width={fw} height={height}>
        {!reduced && state === "think" && <ThinkDots facing={facing} />}
        {!reduced && state === "sleep" && <Zzz facing={facing} />}
        <motion.button
          type="button"
          onClick={poke}
          aria-label="Ratel, Kelvin's mascot: click for a tip"
          className="block h-full w-full cursor-pointer rounded-xl border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-mascot-ink/60 focus-visible:outline-none"
          animate={reduced ? undefined : body.animate}
          transition={body.transition}
          whileHover={reduced ? undefined : { scale: 1.04 }}
          whileTap={reduced ? undefined : { scale: 0.95 }}
        >
          <motion.div className="h-full w-full" initial={false} animate={{ scaleX: facing }} transition={reduced ? { duration: 0 } : { duration: 0.18 }}>
            <RatelFigure height={height} anims={reduced ? undefined : PART_ANIMS[state]} arms={reduced ? "crossed" : ARMS[state]} eyesClosed={!reduced && state === "sleep"} />
          </motion.div>
        </motion.button>
      </Walker>
    </div>
  );
});

function Walker({ x, width, height, children }: { x: MotionValue<number>; width: number; height: number; children: React.ReactNode }) {
  return (
    <motion.div className="absolute bottom-3" style={{ x, width, height }}>
      {children}
    </motion.div>
  );
}

function ThinkDots({ facing }: { facing: 1 | -1 }) {
  return (
    <div className="absolute -top-1 flex gap-1" style={facing === 1 ? { right: -8 } : { left: -8 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block rounded-full bg-mascot-ink"
          style={{ width: 4 + i, height: 4 + i }}
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

function Zzz({ facing }: { facing: 1 | -1 }) {
  return (
    <div className="absolute -top-3" style={facing === 1 ? { right: -6 } : { left: -6 }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute font-heading text-mascot-ink/80 italic"
          style={{ fontSize: 11 + i * 4, left: i * 6 * facing }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], y: [0, -22], x: [0, 8 * facing] }}
          transition={{ duration: 3, repeat: Infinity, delay: i, ease: "easeOut" }}
        >
          z
        </motion.span>
      ))}
    </div>
  );
}
