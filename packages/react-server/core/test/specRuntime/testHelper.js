/* eslint-disable no-process-env */
var renderMiddleware = require("../../server").middleware,
	express = require("express"),
	http = require("http"),
	fs = require("fs"),
	mkdirp = require("mkdirp"),
	webpack = require("webpack"),
	path = require("path"),
	Browser = require('zombie');

var PORT = process.env.PORT || 8769;

var servers = [];

function getBrowser(opts) {
	var browser = new Browser(opts);
	browser.silent = (!process.env.DEBUG);
	browser.on('error', function (e) {
		console.error("An error occurred running zombie tests", e);
	})
	return browser;
}

var getPort = function () { return PORT };

var writeRoutesFile = function (specFile, routes, tempDir, clientOrServer) {
	// clientOrServer = ["client"|"server"];

	let specDir = path.dirname(specFile);
	let relativeRoutePathRoot = specDir;
	if (clientOrServer === 'client') {
		// if we're writing for the client, we need to correct for
		// the fact that `specFile` will be coming from target/server
		let relativePathToServer = path.relative(specDir, path.join(tempDir, '../server/'));
		let relativePathToSpec = path.relative(path.join(tempDir, '../server/'), specDir);

		relativeRoutePathRoot = path.resolve(specDir, relativePathToServer, '../client/', relativePathToSpec);
	}

	let specRuntimePath = path.join(tempDir, `../${clientOrServer}/test/specRuntime`);
	let scriptsMiddlewareAbsPath = `${specRuntimePath}/ScriptsMiddleware`;
	let transitionPageAbsPath = `${specRuntimePath}/TransitionPage`;

	// first we convert our simple routes format to a triton routes file.
	var routesForTriton = `module.exports = {
			middleware: [require("${scriptsMiddlewareAbsPath}")],
			routes: {`;

	Object.keys(routes).forEach((url, index) => {

		let routeAbsPath = path.isAbsolute(routes[url])
			? routes[url]
			: path.normalize(path.join(relativeRoutePathRoot, `${routes[url]}`));

		routesForTriton += `
			route${index}: {
				path: ["${url}"],
				method: 'get',
				page: function () {
					return {
						done: function (cb) {
							cb(require("${routeAbsPath}"));
						}
					};
				}
			},`;
	});

	// make sure we add a route for a page that will let us do client-side
	// transitions.
	routesForTriton += `
		transitionPage: {
			path: ["/__transition"],
			method: "get",
			page: function() {
				return {
					done: function(cb) {
						cb(require("${transitionPageAbsPath}"));
					}
				};
			}
		}}};`;
	mkdirp.sync(tempDir);
	fs.writeFileSync(path.join(tempDir, `routes-${clientOrServer}.js`), routesForTriton);
}

var writeEntrypointFile = function (tempDir) {
	mkdirp.sync(tempDir);
	fs.writeFileSync(tempDir + "/entrypoint.js", `
		var ClientController = require("react-server").ClientController;
		window.rfBootstrap = function () {
			var controller = new ClientController({
				routes: require("./routes-client.js")
			});

			controller.init();
		};`
	);
}


var buildClientCode = function (tempDir, cb) {

	webpack({
		target: "web",
		context: tempDir,
		entry: "./entrypoint.js",
		output: {
			path: tempDir,
			filename: "rollup.js",
		},
		debug: true,
		bail: true,
		resolve: {
			alias: {
				"react-server": process.cwd(), // this works because package.json points it at /target/client/client.js,
			},
		},
	}, function(err, stats) { //eslint-disable-line no-unused-vars
		if(err) {
			console.error(err);
			throw new Error("Error during webpack build.");
		}
		cb();
	});
}

// this is a helper function that takes in an array of files to make routes for.
// it will emit a routes map suitable for handing to startTritonServer where
// all the page classes will be automatically assigned a URL. the URL will be
// the file name (stripped of directories), first letter lower-cased, assigned
// "Page" removed from the end if it is there. Examples (in the format class name
// to URL:
//
// "./SomeTestPage" ==> "/someTest"
// "./someDir/SomeTestInDirPage" ==> "/someTestInDir"
// "./foo/BarPagelet" ==> "/barPagelet"  <-- note does not *end* with "Page"
var routesArrayToMap = function (routesArray) {
	var result = {};
	routesArray.forEach((file) => {
		var fileName = path.basename(file);
		if (path.extname(fileName)) {
			// strip extension from filename, if given
			fileName = fileName.substr(0, fileName.length - path.extname(fileName).length);
		}
		if (fileName.length >=4 && fileName.substr(-4) === "Page") fileName = fileName.substr(0, fileName.length - 4);
		if (fileName.length > 0) fileName = fileName.substr(0, 1).toLowerCase() + fileName.substr(1);
		result["/" + fileName] = file;
	});
	return result;
}

// starts a simple triton server.
// routes is of the form {url: pathToPageCode} or [pathToPageCode]
var startServer = function (specFile, routes, cb) {
	// if we got an array, normalize it to a map of URLs to file paths.
	if (Array.isArray(routes)) routes = routesArrayToMap(routes);

	var testTempDir = path.join(__dirname, "../../../test-temp");

	writeRoutesFile(specFile, routes, testTempDir, "client");
	writeRoutesFile(specFile, routes, testTempDir, "server");
	writeEntrypointFile(testTempDir);
	buildClientCode(testTempDir, () => {
		var server = express();
		process.env.TRITON_CONFIGS = path.join(__dirname, "../../test");

		server.use('/rollups', express.static(testTempDir));

		// we may have changed the routes file since the last test run, so the old
		// routes file may be in the require cache. this code may not be ideal in node
		// (mucking with the require cache); if it causes problems, we should change the code
		// to add a hash to the end of the module name.
		delete require.cache[require.resolve(testTempDir + "/routes-server")]
		renderMiddleware(server, require(testTempDir + "/routes-server"));
		var httpServer = http.createServer(server);
		httpServer.listen(PORT, () => cb(httpServer));

	});
};

var stopServer = function (server, done) {
	server.close(done);
};

var getServerBrowser = function (url, cb) {
	var browser = getBrowser({runScripts:false});

	browser.visit(`http://localhost:${PORT}${url}`).then(() => cb(browser), () => console.error(arguments));
}

var getClientBrowser = function (url, cb) {
	var browser = getBrowser();
	browser.visit(`http://localhost:${PORT}${url}`).then(() => cb(browser), () => console.error(arguments));
};

var getTransitionBrowser = function (url, cb) {
	var browser = getBrowser();
	// go to the transition page and click the link.
	browser.visit(`http://localhost:${PORT}/__transition?url=${url}`).then(() => {
		browser.clickLink("Click me", () => {
			cb(browser);
		});
	});

}

// vists the url `url` and calls `cb` with the browser's window
// object after the page has completely downloaded from the server but before any client
// JavaScript has run. note that this is useful for examining the structure of the
// server-generated HTML via `window.document`, but it is not generally useful to do
// much else with the window object, as no JavaScript has run on the client (i.e.
// React will not be present, and nothing will be interactive.).
var getServerWindow = function (url, cb) { getServerBrowser(url, (browser) => cb(browser.window)); }

// vists the url `url` and calls `cb` with the browser's window
// object after the page has completely downloaded from the server and all client
// JavaScript has run. at this point, the page will have re-rendered, and
// it will be interactive.
var getClientWindow = function (url, cb) { getClientBrowser(url, (browser) => cb(browser.window)); };

// vists the url `url` via a client-side transition, and calls `cb`
// with the browser's window object after the page has completely run all client
// JavaScript. at this point, the page will have transitioned and rendered, and
// it will be interactive.
var getTransitionWindow = function (url, cb) { getTransitionBrowser(url, (browser) => cb(browser.window)); };

// vists the url `url` and calls `cb` with the browser's document
// object after the page has completely downloaded from the server but before any client
// JavaScript has run. this is the right method to use to run assertions on the server-
// generated HTML.
var getServerDocument = function (url, cb) { getServerWindow(url, (window) => cb(window.document)); };

// vists the url `url` and calls `cb` with the browser's document
// object after the page has completely downloaded from the server and all client
// JavaScript has run. this is the right method to use to run assertions on the HTML
// after client-side rendering has completed.
var getClientDocument = function (url, cb) { getClientWindow(url, (window) => cb(window.document)); };


// vists the url `url` via a client-side transition, and calls `cb`
// with the browser's document object after the page has completely run all client
// JavaScript. this is the right method to use to run assertions on the HTML
// after a client-side transition has completed.
var getTransitionDocument = function (url, cb) { getTransitionWindow(url, (window) => cb(window.document)); };

// used to test the JS internals of a page both on client load and on page-to-page
// transition. this does NOT test server load, since JS doesn't run on that. if you just
// want to test document structure, including server generated documents, use testWithDocument.
// testFn's first argument will be the window object. if it takes a second argument, it will be
// a done callback for async tests.
var testWithWindow = function (url, testFn) {
	var callback = (document, done) => {
		if (testFn.length >= 2) {
			testFn(document, done);
		} else {
			// the client doesn't want the done function, so we should call it.
			testFn(document);
			done();
		}
	}
	it ("on client", function(done) {
		getClientWindow(url, (window) => {
			callback(window, done);
		});
	});
	it ("on transition", function(done) {
		getTransitionWindow(url, (window) => {
			callback(window, done);
		});
	});

}

// used to test document structure on server, on client, and on page-to-page transition.
// this method creates three Jasmine tests. this method should not test anything that is
// dependent on the page JS running. if you want to test the internal state of the JS, use
// testWithWindow.
// testFn's first argument will be the document object. if it takes a second argument, it will be
// a done callback for async tests.
var testWithDocument = function (url, testFn) {
	var callback = (document, done) => {
		if (testFn.length >= 2) {
			testFn(document, done);
		} else {
			// the client doesn't want the done function, so we should call it.
			testFn(document);
			done();
		}
	}
	it ("on server", function(done) {
		getServerDocument(url, (document) => {
			callback(document, done);
		});
	});
	it ("on client", function(done) {
		getClientDocument(url, (document) => {
			callback(document, done);
		});
	});
	it ("on client transition", function(done) {
		getTransitionDocument(url, (document) => {
			callback(document, done);
		});
	});

}

// Factor out some boilerplate if when just looking for an element.
var testWithElement = (url, query, testFn) => testWithDocument(
	url, document => testFn(document.querySelector(query))
);

var testSetupFn = function (specFile, routes) {
	return (done) => {
		try {
			startServer(specFile, routes, s => {
				servers.push(s);
				done();
			});
		} catch (e) {
			console.error("Failed to start server", e.stack);
			servers.forEach(s => s.close());
			process.exit(1); //eslint-disable-line no-process-exit
		}
	}
}

var testTeardownFn = function (done) {
	stopServer(servers.pop(), done);
};

// convenience function to start a triton server before each test. make sure to
// call stopServerAfterEach so that the server is stopped.
var startServerBeforeEach = function (specFile, routes) {
	beforeEach(testSetupFn(specFile, routes));
}

// convenience function to start a triton server before all the tests. make sure to
// call stopServerAfterEach so that the server is stopped.
var startServerBeforeAll = function (specFile, routes) {
	beforeAll(testSetupFn(specFile, routes));
}

// convenience function to stop a triton server after each test. to be paired
// with startServerBeforeEach.
var stopServerAfterEach = function () {
	afterEach(testTeardownFn);
}

// convenience function to stop a triton server after all the tests. to be paired
// with startServerBeforeAll.
var stopServerAfterAll = function () {
	afterAll(testTeardownFn);
}

module.exports = {
	getPort,
	startServer,
	stopServer,
	getServerDocument,
	getClientDocument,
	getTransitionDocument,
	testWithDocument,
	testWithElement,
	getServerBrowser,
	getClientBrowser,
	getTransitionBrowser,
	// getServerWindow,  <-- not exposed because it's generally not useful to get window when client JS hasn't run.
	getClientWindow,
	getTransitionWindow,
	testWithWindow,
	startServerBeforeEach,
	stopServerAfterEach,
	startServerBeforeAll,
	stopServerAfterAll,
};
