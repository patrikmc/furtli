"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("./features").then((mod) => mod.default);

/**
 * Motion, kept light: LazyMotion loads the animation features (domAnimation,
 * ~22 KB gzip) as a separate chunk after hydration, so they never delay the
 * first render. Mounted only where something animates (the station card in
 * MapShell), so other pages don't download it. `strict` makes a full `motion.*`
 * component throw, so use `m.*` from "motion/react-m" everywhere.
 * reducedMotion="user": with prefers-reduced-motion, transforms are skipped
 * and only opacity fades remain.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
