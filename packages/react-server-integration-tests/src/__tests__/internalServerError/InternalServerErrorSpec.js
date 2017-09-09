var helper = require("../../specRuntime/testHelper");
var Browser = require("zombie");

describe("A 500 internal server error page", () => {

	a500("has no body by default", '/internalServerErrorNoDocument', txt => {
		// Yikes... not good default behavior.
		expect(txt).toContain("<b>Code:</b> 500");
		expect(txt).toContain("Error: Page returned code 500");
	});

	a500("has a body with `hasDocument: true`", '/internalServerErrorWithDocument', txt => {
		expect(txt).not.toMatch('Cannot GET /internalServerErrorNoDocument')
		expect(txt).toMatch('foo</title>')
		expect(txt).toMatch('foo</div>')
	});

	a500("can result from an exception during `handleRoute()`", '/internalServerErrorException', txt => {
		expect(txt).toContain("<b>Code:</b> undefined");
		expect(txt).toContain("Error: died");
	});

	a500("can result from a rejection from `handleRoute()`", '/internalServerErrorRejection', txt => {
		expect(txt).toContain("<b>Code:</b> undefined");
		expect(txt).toContain("rejected");
	});

	// Pass `xit` for `the500` to mark a test as pending.
	function a500(spec, url, callback, the500=it) {
		the500(spec, done => new Browser()
			.fetch(`http://localhost:${helper.getPort()}${url}`)
			.then(res => (expect(res.status).toBe(500), res.text()))
			.then(callback)
			.then(done)
		);
	}

	helper.startServerBeforeAll(__filename, [
		"./pages/InternalServerErrorNoDocument",
		"./pages/InternalServerErrorWithDocument",
		"./pages/InternalServerErrorException",
		"./pages/InternalServerErrorRejection",
	]);

	helper.stopServerAfterAll();
});
