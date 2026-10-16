import type { Task } from "../task/Task"
import { BaseTool, type ToolCallbacks } from "./BaseTool"
import { fetchWebPage, searchWeb, validateWebUrl } from "../../services/web/web"
import { formatResponse } from "../prompts/responses"

export class WebSearchTool extends BaseTool<"web_search"> {
	readonly name = "web_search" as const

	async execute(params: { query: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, pushToolResult } = callbacks
		try {
			if (typeof params.query !== "string" || !params.query.trim() || params.query.length > 1000) {
				throw new Error("Search query must contain between 1 and 1000 characters.")
			}
			const query = params.query.trim()
			if (!(await askApproval("tool", JSON.stringify({ tool: "webSearch", query })))) {
				return
			}
			pushToolResult(await searchWeb(query))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.markFailure(task, message, pushToolResult)
		}
	}

	private markFailure(task: Task, message: string, pushToolResult: ToolCallbacks["pushToolResult"]): void {
		task.didToolFailInCurrentTurn = true
		task.recordToolError(this.name)
		pushToolResult(formatResponse.toolError(message))
		task.say("error", message).catch(() => {})
	}
}

export class FetchUrlTool extends BaseTool<"fetch_url"> {
	readonly name = "fetch_url" as const

	async execute(params: { url: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, pushToolResult } = callbacks
		try {
			if (typeof params.url !== "string" || !params.url.trim()) throw new Error("A web page URL is required.")
			const url = validateWebUrl(params.url).href
			if (!(await askApproval("tool", JSON.stringify({ tool: "fetchUrl", url })))) {
				return
			}
			pushToolResult(await fetchWebPage(url))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.markFailure(task, message, pushToolResult)
		}
	}

	private markFailure(task: Task, message: string, pushToolResult: ToolCallbacks["pushToolResult"]): void {
		task.didToolFailInCurrentTurn = true
		task.recordToolError(this.name)
		pushToolResult(formatResponse.toolError(message))
		task.say("error", message).catch(() => {})
	}
}

export const webSearchTool = new WebSearchTool()
export const fetchUrlTool = new FetchUrlTool()
