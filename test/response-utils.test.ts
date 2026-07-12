import { describe,it,expect } from "vitest"; import { toolText } from "../src/utils/responses.js";
describe("responses",()=>it("returns MCP text content",()=>{const r=toolText({text:"answer",model:"m",provider:"p"},{liveInformationAvailable:false});expect(r.content[0]?.type).toBe("text");expect(r.content[0]?.text).toContain("answer");}));
