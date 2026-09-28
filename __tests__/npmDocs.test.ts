import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, analyzeContent } from "@veriguard/scam-detect";
import { INSTALL, QUICKSTART, ANALYZE, REGIONS } from "@/components/NpmDocs";
import { NPM_PACKAGE } from "@/lib/npmPackage";

// The published docs page shows code. Code on a documentation page is a claim
// about the API, and this is the suite that keeps it one a reader can rely on.
//
// Documentation drifts silently: the sample keeps rendering after the function
// it calls has changed shape, and the first person to notice is a developer
// whose install does not work. Two of these samples were wrong when first
// written — `checkUrl` was shown with `await` when it is synchronous, and
// `analyzeContent`'s result was destructured as `{ identifier }` when the field
// is `value` — and both type-checked as strings inside a template literal.
//
// So the assertions below run the same calls the samples show and compare the
// results against the numbers printed beside them.

describe("npm docs samples match the engine", () => {
  it("installs the package the rest of the site names", () => {
    // One source for the package name, so a rename cannot leave the install
    // line pointing at something that no longer exists.
    expect(INSTALL).toBe(`npm install ${NPM_PACKAGE}`);
    expect(QUICKSTART).toContain(`from "${NPM_PACKAGE}"`);
  });

  it("produces the verdict and score the quickstart prints", () => {
    const result = checkUrl("https://commbank-secure-login.tk/verify");

    expect(result.verdict).toBe("likely_scam");
    expect(result.score).toBe(85);
    expect(result.flags.length).toBeGreaterThan(0);

    // The sample states both values in comments. Asserting they appear keeps
    // the printed numbers and the real ones from parting company — the failure
    // this test exists for is a rule change that moves the score while the page
    // keeps claiming 85.
    expect(QUICKSTART).toContain(`"${result.verdict}"`);
    expect(QUICKSTART).toContain(String(result.score));
  });

  it("does not show `await` on a synchronous call", () => {
    // checkUrl does no I/O and returns a CheckResult, not a promise. Showing
    // `await` would be harmless at runtime and wrong in a way that teaches the
    // reader the wrong shape for every other entry point.
    expect(QUICKSTART).not.toMatch(/await\s+checkUrl/);
    expect(REGIONS).not.toMatch(/await\s+checkSms/);
  });

  it("destructures analyzeContent's results as the type defines them", async () => {
    const results = await analyzeContent(
      "Your parcel is held. Pay the fee at auspost-redelivery.bond",
    );

    expect(results.length).toBeGreaterThan(0);

    // Every field the sample destructures has to exist on the real result.
    // Reading them off the value rather than a hand-written list means a
    // renamed field fails here rather than in someone's editor.
    const [first] = results;
    for (const field of ["kind", "value", "result"] as const) {
      expect(first[field], `analyzeContent results have no "${field}"`).toBeDefined();
      expect(ANALYZE, `the sample does not destructure "${field}"`).toContain(field);
    }
  });

  it("passes region positionally, as checkSms actually takes it", () => {
    // The sample previously showed `{ region: "gb" }`, which type-checks as a
    // MessageCheckOptions object and silently scores against the default
    // region — a wrong answer rather than an error, which is the worst kind of
    // documentation bug.
    const gb = checkSms("Your parcel is held", undefined, "gb");
    expect(gb.verdict).toBeDefined();
    expect(REGIONS).toContain('checkSms("Your parcel is held", undefined, "gb")');
  });
});
