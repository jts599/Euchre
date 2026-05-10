import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { App } from "../ui/App";

/**
 * App bootstrap behavior tests.
 */
describe("App", () => {
    it("does not leave stale StrictMode game runs competing for human decisions", async () => {
        render(
            <StrictMode>
                <App />
            </StrictMode>
        );

        await screen.findByLabelText("Your hand");
        await waitFor(() => {
            expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        });
    });
});
