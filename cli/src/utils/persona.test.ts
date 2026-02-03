import { expect, test, describe } from "bun:test";
import { PICKLE_PERSONA } from "./persona.js";

describe("persona.ts", () => {
    test("PICKLE_PERSONA should contain core persona traits", () => {
        const p = PICKLE_PERSONA.toLowerCase();
        expect(p).toContain("pickle rick");
        expect(p).toContain("slop");
        expect(p).toContain("jerry-work");
        expect(p).toContain("wubba lubba dub dub");
    });
});
