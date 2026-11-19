"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowRight } from "lucide-react";
import { KelvinLogo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Scroll-driven welcome: we fly through the cabin window into the sky above the clouds,
 * the clouds rise and dissolve into the page. Reference: the "AERIVE" window transition.
 * Images live in public/welcome/ (AI-generated, see docs/team/LOG.md).
 */
const IMG = { window: "/welcome/window.webp", sky: "/welcome/sky.webp", clouds: "/welcome/clouds.webp" };
/** Centre of the left cabin window inside window.webp (fractions of width/height): the zoom origin. */
const WINDOW_ORIGIN = "37% 51%";

/** A 16:9 layer that always covers the viewport, so the zoom origin stays on the same window at any screen ratio. */
const COVER = "absolute top-1/2 left-1/2 aspect-video w-[max(100vw,177.78vh)] -translate-x-1/2 -translate-y-1/2";

function Cta({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      <Link href="/live" className={cn(buttonVariants({ size: "lg" }))}>
        Enter Kelvin
        <ArrowRight data-icon="inline-end" />
      </Link>
      <Link href="/cases" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
        Open the claims cases
      </Link>
    </div>
  );
}

function Headline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-heading text-[clamp(2.25rem,6vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.02em]", className)}>{children}</h2>;
}

function useStage(progress: MotionValue<number>) {
  return {
    zoom: useTransform(progress, [0, 0.32], [1, 7.5]),
    sideOut: useTransform(progress, [0, 0.14], [1, 0]),
    leftX: useTransform(progress, [0, 0.2], ["0vw", "-12vw"]),
    rightX: useTransform(progress, [0, 0.2], ["0vw", "12vw"]),
    sky: useTransform(progress, [0.22, 0.32], [0, 1]),
    skyText: useTransform(progress, [0.36, 0.44, 0.56, 0.62], [0, 1, 1, 0]),
    cloudsY: useTransform(progress, [0.58, 0.82], ["100%", "0%"]),
    cream: useTransform(progress, [0.8, 0.92], [0, 1]),
    finale: useTransform(progress, [0.9, 0.98], [0, 1]),
    finaleY: useTransform(progress, [0.9, 0.98], [24, 0]),
  };
}

export function WelcomeFlight() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const s = useStage(scrollYProgress);

  if (reduce) {
    // No scroll animation: one still frame above the clouds with the message and the way in.
    return (
      <main id="main" className="relative grid min-h-dvh place-items-center overflow-hidden bg-mascot text-white">
        <Image src={IMG.sky} alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="relative flex max-w-3xl flex-col items-center gap-8 px-6 text-center">
          <KelvinLogo descriptor={null} />
          <Headline>From temperature excursion to recovered money.</Headline>
          <p className="max-w-xl text-lg text-white/85">Kelvin follows every cold-chain shipment, finds who held the cargo when it warmed up, and prepares the claim for your approval.</p>
          <Cta />
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="bg-background">
      <div ref={ref} className="relative h-[520vh]">
        <div className="sticky top-0 h-dvh overflow-hidden bg-mascot text-white">
          {/* 1. cabin window: zooms until we pass through it */}
          <motion.div className={COVER} style={{ scale: s.zoom, transformOrigin: WINDOW_ORIGIN }}>
            <Image src={IMG.window} alt="" fill priority sizes="100vw" className="object-cover" />
          </motion.div>
          <motion.div style={{ opacity: s.sideOut, x: s.leftX }} className="absolute top-[12%] left-[5%] max-w-[22rem]">
            <Headline>Cold chain, in motion.</Headline>
          </motion.div>
          <motion.div style={{ opacity: s.sideOut, x: s.rightX }} className="absolute right-[5%] bottom-[12%] max-w-[22rem] text-right">
            <Headline>Claims, recovered.</Headline>
          </motion.div>

          {/* 2. through the window: the sky above the clouds */}
          <motion.div className="absolute inset-0" style={{ opacity: s.sky }}>
            <Image src={IMG.sky} alt="" fill sizes="100vw" className="object-cover" />
          </motion.div>
          <motion.div style={{ opacity: s.skyText }} className="absolute inset-x-0 top-[22%] mx-auto max-w-2xl px-6 text-center">
            <p className="font-heading text-[clamp(1.4rem,3vw,2.25rem)] leading-snug">
              <span className="tracking-[0.18em] uppercase">Kelvin</span> follows every cold-chain shipment, finds who held the cargo when it warmed
              up, and prepares the claim for your approval.
            </p>
          </motion.div>

          {/* 3. the clouds rise and dissolve into the page */}
          <motion.div className="absolute inset-0" style={{ y: s.cloudsY }}>
            <Image src={IMG.clouds} alt="" fill sizes="100vw" className="object-cover brightness-110" />
          </motion.div>
          <motion.div className="absolute inset-0 bg-background" style={{ opacity: s.cream }} />

          {/* 4. the way in */}
          <motion.div style={{ opacity: s.finale, y: s.finaleY }} className="absolute inset-0 grid place-items-center px-6 text-foreground">
            <div className="flex max-w-3xl flex-col items-center gap-8 text-center">
              <KelvinLogo descriptor={null} className="scale-150" />
              <Headline>From temperature excursion to recovered money.</Headline>
              <Cta />
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
