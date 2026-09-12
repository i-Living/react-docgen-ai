import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import type { ComponentInfo } from "../src/types.js";
import {
  estimateConfidence,
  extractIndexSummary,
  isPrimitiveUi,
  readWikiSource,
  shouldArchiveWikiPage,
  wikiEntityName,
  wikiKebab,
} from "../src/wiki-generator.js";

function info(over: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    name: "Button",
    props: [],
    state: [],
    effects: [],
    handlers: [],
    jsxTree: ["button"],
    exportsComponent: true,
    fileType: "component",
    hasContext: false,
    hasStore: false,
    ...over,
  };
}

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

describe("estimateConfidence", () => {
  it("is high when the LLM saw source", () => {
    expect(estimateConfidence({ codeIncluded: true, llmOk: true })).toBe("high");
  });

  it("is medium when source was omitted", () => {
    expect(estimateConfidence({ codeIncluded: false, llmOk: true })).toBe("medium");
  });

  it("is low on LLM failure", () => {
    expect(estimateConfidence({ codeIncluded: true, llmOk: false })).toBe("low");
  });
});

describe("isPrimitiveUi", () => {
  it("skips a short html-only button", () => {
    expect(isPrimitiveUi(info(), "export function Button() { return <button /> }", "src/ui/button.tsx")).toBe(true);
  });

  it("skips shadcn/cva wrappers", () => {
    const code = `import { cva } from "class-variance-authority"\nconst v = cva("btn")\nexport function Button() { return <Comp /> }`;
    expect(isPrimitiveUi(info({ jsxTree: ["Comp"] }), code, "src/shared/ui/button.tsx")).toBe(true);
  });

  it("keeps a router module", () => {
    const code = `import { createBrowserRouter } from "react-router"\nexport const router = createBrowserRouter([])`;
    expect(isPrimitiveUi(info({ name: "router", jsxTree: ["App", "CatalogPage"] }), code, "src/app/router.tsx")).toBe(false);
  });

  it("keeps query gates even under ui/", () => {
    const code = `export function queryGate(q: { isPending: boolean }) { return q.isPending ? <div /> : null }`;
    expect(isPrimitiveUi(info({ name: "queryGate", jsxTree: ["div"] }), code, "src/shared/ui/query-gate.tsx")).toBe(false);
  });

  it("keeps hooks", () => {
    expect(isPrimitiveUi(info({ fileType: "hook", name: "useCart", jsxTree: [] }), "export function useCart() {}", "src/hooks/use-cart.ts")).toBe(false);
  });

  it("keeps utils that are not ui-kit", () => {
    expect(isPrimitiveUi(info({ fileType: "util", name: "formatMoney", jsxTree: [] }), "export function formatMoney(n: number) { return n }", "src/lib/money.ts")).toBe(false);
  });
});

describe("shouldArchiveWikiPage", () => {
  it("archives when the source file is gone", () => {
    expect(shouldArchiveWikiPage({ sourceFromPage: "src/gone.ts", sourceExists: false, skippedAsPrimitive: false })).toBe(true);
  });

  it("does not archive a rename while the source still exists", () => {
    expect(shouldArchiveWikiPage({ sourceFromPage: "src/client.ts", sourceExists: true, skippedAsPrimitive: false })).toBe(false);
  });

  it("archives primitives skipped this run", () => {
    expect(shouldArchiveWikiPage({ sourceFromPage: "src/ui/button.tsx", sourceExists: true, skippedAsPrimitive: true })).toBe(true);
  });
});

describe("readWikiSource", () => {
  it("reads source from frontmatter", () => {
    expect(readWikiSource("---\ntitle: client\nsource: apps/web/src/shared/api/client.ts\n---\n")).toBe("apps/web/src/shared/api/client.ts");
  });
});

describe("wiki prompts", () => {
  it("does not ask for Complexity", () => {
    const dir = path.join(process.cwd(), "src", "prompts");
    for (const name of ["util", "component", "hook", "store", "context", "types"]) {
      const text = fs.readFileSync(path.join(dir, `${name}.txt`), "utf8");
      expect(text).not.toContain("Complexity");
      expect(text).toContain("Skip any section with no data");
    }
  });
});
