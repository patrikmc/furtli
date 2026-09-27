// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { accessToken } from "@/lib/access";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

const post = (fields: Record<string, string>) =>
  new NextRequest(new URL("/api/zugang", "https://furtli.ch"), {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

it("sets the access cookie and redirects to the target for the right password", async () => {
  vi.stubEnv("SITE_PASSWORD", "geheim");
  const res = await POST(post({ password: "geheim", next: "/?plz=8004" }));
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("https://furtli.ch/?plz=8004");
  const cookie = res.headers.get("set-cookie") ?? "";
  expect(cookie).toContain(`furtli_access=${await accessToken("geheim")}`);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
});

it("sends a wrong password back to the gate, without a cookie and without an open redirect", async () => {
  vi.stubEnv("SITE_PASSWORD", "geheim");
  const res = await POST(post({ password: "falsch", next: "//evil.example" }));
  expect(res.headers.get("location")).toBe("https://furtli.ch/zugang?fehler=1");
  expect(res.headers.get("set-cookie")).toBeNull();
});
