import { describe, expect, it } from "vitest"
import type { ExtensionState } from "@roo-code/types"

import { checkAutoApproval } from "../index"

const base = { autoApprovalEnabled: true } as unknown as ExtensionState

describe("checkAutoApproval — web research", () => {
	const text = JSON.stringify({ tool: "webSearch", query: "history" })

	it("approves web tools when the web toggle is enabled", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowWeb: true },
			ask: "tool",
			text,
		})
		expect(result.decision).toBe("approve")
	})

	it("asks when the web toggle is disabled", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowWeb: false },
			ask: "tool",
			text,
		})
		expect(result.decision).toBe("ask")
	})

	it("asks when auto-approval master switch is off", async () => {
		const result = await checkAutoApproval({
			state: { autoApprovalEnabled: false, alwaysAllowWeb: true } as unknown as ExtensionState,
			ask: "tool",
			text,
		})
		expect(result.decision).toBe("ask")
	})
})

describe("checkAutoApproval — command execution", () => {
	it("approves any command when execute auto-approval is on (no allowlist entry required)", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowExecute: true },
			ask: "command",
			text: "ls -la",
		})
		expect(result.decision).toBe("approve")
	})

	it("still denies commands matching the denylist", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowExecute: true, deniedCommands: ["rm"] },
			ask: "command",
			text: "rm -rf /",
		})
		expect(result.decision).toBe("deny")
	})

	it("always asks for dangerous substitutions even with execute enabled", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowExecute: true },
			ask: "command",
			text: 'echo "${var@P}"',
		})
		expect(result.decision).toBe("ask")
	})

	it("asks when execute auto-approval is off", async () => {
		const result = await checkAutoApproval({
			state: { ...base, alwaysAllowExecute: false },
			ask: "command",
			text: "ls -la",
		})
		expect(result.decision).toBe("ask")
	})
})
