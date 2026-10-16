import { describe, expect, it, vi } from "vitest"
import axios from "axios"
import { extractWebPage, fetchWebPage, parseHtmlSearchResults, searchWeb, validateWebUrl } from "../web"

vi.mock("axios", () => ({ default: { get: vi.fn(), isAxiosError: (error: any) => !!error?.isAxiosError } }))

describe("web research", () => {
	it("extracts search sources and rejects unusable links", () => {
		const results = parseHtmlSearchResults(
			`<div class="b_algo"><h2><a href="https://example.com/history">World &amp; history</a></h2><p>Research notes</p></div>
			<div class="b_algo"><h2><a href="javascript:alert(1)">Invalid</a></h2></div>`,
			"Bing",
			"history",
		)
		expect(results).toContain("World & history")
		expect(results).toContain("https://example.com/history")
		expect(results).not.toContain("javascript:")
		expect(() => parseHtmlSearchResults("<html>Service unavailable</html>", "Bing", "history")).toThrow(
			"no relevant",
		)
	})

	it("extracts main content, resolves links and removes executable markup", () => {
		const result = extractWebPage(
			'<html><title>History</title><body><nav>Navigation</nav><main><h1>Research</h1><p>Useful facts.</p><a href="/source">Source</a><script>malicious()</script></main><footer>Footer</footer></body></html>',
			"https://example.com/history",
		)
		expect(result).toContain("Useful facts.")
		expect(result).toContain("https://example.com/source")
		expect(result).not.toContain("malicious")
		expect(result).not.toContain("Navigation")
		expect(result).not.toContain("Footer")
	})

	it("bounds page content and rejects empty pages", () => {
		expect(extractWebPage(`<body><p>${"x".repeat(25_000)}</p></body>`, "https://example.com")).toContain(
			"Content truncated",
		)
		expect(() => extractWebPage("<body><script>app()</script></body>", "https://example.com")).toThrow(
			"No readable content",
		)
	})

	it("rejects local file schemes and embedded credentials", () => {
		expect(() => validateWebUrl("file:///etc/passwd")).toThrow()
		expect(() => validateWebUrl("https://user:password@example.com")).toThrow()
		expect(validateWebUrl("https://example.com").protocol).toBe("https:")
	})

	it("sends search queries as encoded parameters and propagates service errors", async () => {
		vi.mocked(axios.get).mockResolvedValueOnce({
			data: '<div class="b_algo"><h2><a href="https://example.com">Result</a></h2></div>',
		})
		expect(await searchWeb("world & history")).toContain("https://example.com")
		expect(axios.get).toHaveBeenLastCalledWith(
			"https://www.bing.com/search",
			expect.objectContaining({ params: { q: "world & history" }, timeout: 15_000 }),
		)
		vi.mocked(axios.get).mockRejectedValue(new Error("network timeout"))
		await expect(searchWeb("query")).rejects.toThrow("network timeout")
		vi.mocked(axios.get).mockReset()
	})

	it("prefers Baidu for Chinese queries and rejects single-character noise", async () => {
		vi.mocked(axios.get).mockResolvedValueOnce({
			data: '<div class="result"><h3><a href="https://example.com">降龙十八掌武功</a></h3><p>掌法介绍</p></div>',
		})
		expect(await searchWeb("降龙十八掌 六脉神剑")).toContain("Source: Baidu")
		expect(axios.get).toHaveBeenLastCalledWith(
			"https://www.baidu.com/s",
			expect.objectContaining({ params: { wd: "降龙十八掌 六脉神剑" } }),
		)
		expect(() =>
			parseHtmlSearchResults(
				'<div class="b_algo"><h2><a href="https://example.com">降_字典</a></h2><p>降的读音和解释</p></div>',
				"Bing",
				"降龙十八掌 六脉神剑",
			),
		).toThrow("no relevant")
	})

	it("falls back when the first provider is blocked", async () => {
		vi.mocked(axios.get).mockRejectedValueOnce(new Error("blocked"))
		vi.mocked(axios.get).mockResolvedValueOnce({
			data: '<div class="result"><h3><a href="https://example.com">History</a></h3></div>',
		})
		expect(await searchWeb("history")).toContain("Source: Baidu")
	})

	it("uses Baidu original destinations instead of tracking redirects", () => {
		const results = parseHtmlSearchResults(
			'<div class="result" mu="https://example.com/article"><h3><a href="https://www.baidu.com/link?url=tracking">降龙十八掌</a></h3></div>',
			"Baidu",
			"降龙十八掌",
		)
		expect(results).toContain("URL: https://example.com/article")
		expect(results).not.toContain("tracking")
	})

	it("decodes provider links and rejects verification pages", async () => {
		const encoded = "a1" + Buffer.from("https://example.com/source").toString("base64url")
		expect(
			parseHtmlSearchResults(
				`<div class="b_algo"><h2><a href="/ck/a?u=${encoded}">Source</a></h2></div>`,
				"Bing",
				"source",
			),
		).toContain("https://example.com/source")
		vi.mocked(axios.get).mockResolvedValueOnce({
			data: "<title>百度安全验证</title><body>请验证</body>",
			headers: { "content-type": "text/html" },
		})
		await expect(fetchWebPage("https://example.com")).rejects.toThrow("verification page")
	})

	it("explains blocked and timed out sources", async () => {
		vi.mocked(axios.get).mockRejectedValueOnce({ isAxiosError: true, response: { status: 403 } })
		await expect(fetchWebPage("https://example.com")).rejects.toThrow("HTTP 403")
		vi.mocked(axios.get).mockRejectedValueOnce({ isAxiosError: true, code: "ECONNABORTED" })
		await expect(fetchWebPage("https://example.com")).rejects.toThrow("timed out")
	})

	it("handles plain text and rejects binary responses", async () => {
		vi.mocked(axios.get).mockResolvedValueOnce({ data: "Reference", headers: { "content-type": "text/plain" } })
		expect(await fetchWebPage("https://example.com/reference")).toContain("Reference")
		vi.mocked(axios.get).mockResolvedValueOnce({ data: "binary", headers: { "content-type": "application/pdf" } })
		await expect(fetchWebPage("https://example.com/document.pdf")).rejects.toThrow("Unsupported page content")
	})
})
