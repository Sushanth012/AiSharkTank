import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoYcEvaluation } from "@/lib/demo-data";
import { YcEvaluationSection } from "@/components/ReportView";

describe("YC application report", () => {
  it("shows all five YC questions with simple explanations and next actions", () => {
    const html = renderToStaticMarkup(<YcEvaluationSection evaluation={demoYcEvaluation} />);

    expect(html).toContain("Is the idea immediately understandable?");
    expect(html).toContain("Is the problem real and urgent?");
    expect(html).toContain("Why are these founders right for it?");
    expect(html).toContain("Is there evidence people want it?");
    expect(html).toContain("What would make YC reject the application?");
    expect(html.match(/Explain this simply/g)).toHaveLength(5);
    expect(html.match(/What should I do next\?/g)).toHaveLength(5);
  });
});
