import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Testing Library renders each component into the real (happy-dom)
// document body and doesn't remove it automatically — without this,
// every test after the first would find every previous test's leftover
// DOM still mounted (that's what "found multiple elements" errors
// usually mean: not two elements in your component, two renders stacked
// on top of each other from tests that never got cleaned up).
afterEach(() => {
  cleanup();
});
