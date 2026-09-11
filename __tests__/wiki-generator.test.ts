import { describe, expect, it } from "bun:test";
import { extractIndexSummary, wikiEntityName, wikiKebab } from "../src/wiki-generator.js";

describe("extractIndexSummary", () => {
  it("skips leftover markdown headings", () => {
    const doc = `# CheckoutForm\n\n## Description\n\nCheckout form for the SPA checkout flow.`;
    expect(extractIndexSummary(doc)).toBe("Checkout form for the SPA checkout flow.");
  });

  it("returns empty string when there is no prose", () => {
    expect(extractIndexSummary("## Description\n")).toBe("");
  });
});

describe("wikiEntityName", () => {
  it("uses the filename, not an AST identifier", () => {
    expect(wikiEntityName("apps/web/src/shared/api/client.ts")).toBe("client");
    expect(wikiEntityName("apps/web/src/features/checkout/checkout-form.tsx")).toBe("checkout-form");
    expect(wikiEntityName("apps/web/src/shared/api/queries.ts")).toBe("queries");
  });
});

describe("wikiKebab", () => {
  it("splits CamelCase so JSX names match file pages", () => {
    expect(wikiKebab("CheckoutForm")).toBe("checkout-form");
    expect(wikiKebab("API_PATHS")).toBe("api-paths");
  });
});
