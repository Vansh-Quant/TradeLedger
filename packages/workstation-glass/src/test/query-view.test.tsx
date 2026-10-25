import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryView } from "@/components/terminal/primitives";

describe("QueryView and SourceBanner", () => {
  it("renders an error message instead of stale or fixture data", () => {
    render(
      <QueryView q={{ data: undefined, isLoading: false, error: new Error("HTTP 401"), fetchStatus: "idle", isPending: false }}>
        {() => <div>secret rows</div>}
      </QueryView>,
    );
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("HTTP 401")).toBeInTheDocument();
    expect(screen.queryByText("secret rows")).not.toBeInTheDocument();
  });

  it("renders an empty state when the backend list is empty", () => {
    render(
      <QueryView
        q={{ data: { rows: [] }, isLoading: false, error: null, fetchStatus: "idle", isPending: false }}
        empty={(d) => d.rows.length === 0}
        emptyTitle="No open positions"
        emptyDetail="The account context returned an empty position list."
      >
        {() => <div>rows</div>}
      </QueryView>,
    );
    expect(screen.getByText("No open positions")).toBeInTheDocument();
    expect(screen.getByText("The account context returned an empty position list.")).toBeInTheDocument();
  });

});
