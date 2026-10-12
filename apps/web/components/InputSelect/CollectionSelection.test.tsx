import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, pathname: "/links" }),
}));
vi.mock("@linkwarden/router/collections", () => ({
  useCollections: () => ({ data: [] }),
}));
vi.mock("react-select/creatable", () => ({
  default: ({ value, defaultValue }: {
    value?: { label: string };
    defaultValue?: { label: string };
  }) => React.createElement("output", {
    "data-selected": value?.label ?? "uncontrolled",
    "data-default": defaultValue?.label ?? "empty",
  }),
}));
vi.mock("react-select", () => ({
  default: ({ value }: { value?: { label: string } }) =>
    React.createElement("output", {
      "data-selected": value?.label ?? "uncontrolled",
    }),
}));

import CollectionSelection from "./CollectionSelection";

describe("collection selector controlled-value opt-in", () => {
  it("shows an updated async-provided selection", () => {
    const html = renderToStaticMarkup(
      React.createElement(CollectionSelection, {
        onChange: () => {},
        selectedValue: { label: "Reading", value: 12 },
        defaultValue: { label: "Unorganized" },
      })
    );
    expect(html).toContain('data-selected="Reading"');
  });

  it("retains uncontrolled behavior for existing callers", () => {
    const html = renderToStaticMarkup(
      React.createElement(CollectionSelection, {
        onChange: () => {},
        defaultValue: { label: "Inbox", value: 2 },
      })
    );
    expect(html).toContain('data-selected="uncontrolled"');
    expect(html).toContain('data-default="Inbox"');
  });

  it("supports the existing non-creatable picker", () => {
    const html = renderToStaticMarkup(
      React.createElement(CollectionSelection, {
        onChange: () => {},
        creatable: false,
        selectedValue: { label: "Projects", value: 4 },
      })
    );
    expect(html).toContain('data-selected="Projects"');
  });
});
