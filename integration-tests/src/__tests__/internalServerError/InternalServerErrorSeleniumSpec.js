import {
	startServerBeforeAll,
	stopServerAfterAll,
	getPort,
} from "../../specRuntime/testHelper"
import request from "request"

describe("A 500 internal server error page", () => {

	a500("has no body by default", '/internalServerErrorNoDocument', txt => {
		// Yikes... not good default behavior.
		expect(txt).toBe('[object Object]\n')
	});

	a500("has a body with `hasDocument: true`", '/internalServerErrorWithDocument', txt => {
		expect(txt).not.toMatch('Cannot GET /internalServerErrorNoDocument')
		expect(txt).toMatch('foo</title>')
		expect(txt).toMatch('foo</div>')
	});

	a500("can result from an exception during `handleRoute()`", '/internalServerErrorException', txt => {
		expect(txt).toBe('[object Object]\n')
	});

	a500("can result from a rejection from `handleRoute()`", '/internalServerErrorRejection', txt => {
		expect(txt).toBe('[object Object]\n')
	});

	// Pass `xit` for `the500` to mark a test as pending.
	function a500(spec, url, callback, the500=it) {
		the500(spec, done => {
			request(`http://localhost:${getPort()}${url}`, (error, res, body) => {
				expect(res.statusCode).toBe(500);
				callback(body);
				done();
			});
		});
	};

	startServerBeforeAll(__filename, [
		"./pages/InternalServerErrorNoDocument",
		"./pages/InternalServerErrorWithDocument",
		"./pages/InternalServerErrorException",
		"./pages/InternalServerErrorRejection",
	]);

	stopServerAfterAll();
});
