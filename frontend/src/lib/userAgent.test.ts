import { expect, it } from "vitest";

import { describeUserAgent } from "./userAgent";

it("names common browsers", () => {
  expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toEqual({
    browser: "Firefox",
    system: "Linux",
  });
  expect(
    describeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"),
  ).toEqual({ browser: "Chrome", system: "Android" });
  expect(describeUserAgent("curl/8.0")).toBeNull();
});
