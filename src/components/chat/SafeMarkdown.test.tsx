import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";
describe("Safe message rendering", () => {
  it("renders Markdown without executing embedded HTML or executable links", () => {
    const { container } = render(
      <SafeMarkdown
        text={
          "**Hello** <script>alert(1)</script> [bad](javascript:alert%281%29) ![tracker](https://tracker.invalid/a.png)"
        }
      />,
    );
    expect(screen.getByText("Hello").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
  it("renders ordinary links with safe external navigation attributes", () => {
    render(<SafeMarkdown text={"[Example](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(link).toHaveAttribute("target", "_blank");
  });
});

it('keeps exact protected study links inside the app without prefetching or external targets',()=>{const id='11111111-1111-4111-8111-111111111111',path=`/faith-circles/${id}/studies/${id}/sessions/${id}`;render(<SafeMarkdown text={`[Open study session](${path})`}/>);const a=screen.getByRole('link',{name:'Open study session'});expect(a).toHaveAttribute('href',path);expect(a).not.toHaveAttribute('target');});
it('rejects arbitrary relative routes, encoded paths and malformed study links',()=>{render(<SafeMarkdown text={'[Redirect](/auth/callback?next=evil) [Invalid](/faith-circles/nope/studies/nope/sessions/nope) [Encoded](/%2Fexample.com)'} />);expect(screen.queryByRole('link')).toBeNull();});
