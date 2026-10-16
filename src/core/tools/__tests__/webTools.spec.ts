import { describe, expect, it, vi } from "vitest"
import type { Task } from "../../task/Task"
import { webSearchTool, fetchUrlTool } from "../WebTools"
import { searchWeb, fetchWebPage } from "../../../services/web/web"

vi.mock("../../../services/web/web", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../services/web/web")>()),
	searchWeb: vi.fn().mockResolvedValue("Search sources"),
	fetchWebPage: vi.fn().mockResolvedValue("Page content"),
}))

const makeTask = () =>
	({ say: vi.fn().mockResolvedValue(undefined), recordToolError: vi.fn() }) as unknown as Task & {
		say: ReturnType<typeof vi.fn>
		recordToolError: ReturnType<typeof vi.fn>
	}

describe("web tools", () => {
	it("requests approval and only searches when approved", async () => {
		vi.mocked(searchWeb).mockClear()
		const callbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		}
		await webSearchTool.execute({ query: "history" }, makeTask(), callbacks)
		expect(callbacks.askApproval).toHaveBeenCalledWith(
			"tool",
			JSON.stringify({ tool: "webSearch", query: "history" }),
		)
		expect(searchWeb).toHaveBeenCalledWith("history")
		expect(callbacks.pushToolResult).toHaveBeenCalledWith("Search sources")
	})

	it("does not make a network request when approval is denied", async () => {
		vi.mocked(searchWeb).mockClear()
		const callbacks = {
			askApproval: vi.fn().mockResolvedValue(false),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		}
		await webSearchTool.execute({ query: "history" }, makeTask(), callbacks)
		expect(searchWeb).not.toHaveBeenCalled()
		expect(callbacks.pushToolResult).not.toHaveBeenCalled()
	})

	it("shows the URL for approval and returns fetched content when approved", async () => {
		const callbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		}
		const task = makeTask()
		await fetchUrlTool.execute({ url: "https://example.com/history" }, task, callbacks)
		expect(callbacks.askApproval).toHaveBeenCalledWith(
			"tool",
			JSON.stringify({ tool: "fetchUrl", url: "https://example.com/history" }),
		)
		expect(fetchWebPage).toHaveBeenCalledWith("https://example.com/history")
		expect(callbacks.pushToolResult).toHaveBeenCalledWith("Page content")
	})

	it("returns a useful error to the model when a source fails", async () => {
		vi.mocked(fetchWebPage).mockRejectedValueOnce(new Error("HTTP 403: blocked; use another source"))
		const task = makeTask()
		const callbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		}
		await fetchUrlTool.execute({ url: "https://example.com" }, task, callbacks)
		expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("HTTP 403"))
		expect(task.didToolFailInCurrentTurn).toBe(true)
		expect(task.recordToolError).toHaveBeenCalledWith("fetch_url")
	})
})
