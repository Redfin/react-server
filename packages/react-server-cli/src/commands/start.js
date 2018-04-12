import http from "http"
import https from "https"
import path from "path"
import express from "express"
import compression from "compression"
import bodyParser from "body-parser"
import helmet from "helmet"
import WebpackDevServer from "webpack-dev-server"
import compileClient from "../compileClient"
import handleCompilationErrors from "../handleCompilationErrors";
import reactServer from "../react-server";
import setupLogging from "../setupLogging";
import logProductionWarnings from "../logProductionWarnings";
import expressState from 'express-state';
import cookieParser from 'cookie-parser';
import fs from 'fs';

const logger = reactServer.logging.getLogger(__LOGGER__);


// returns a method that can be used to stop the server. the returned method
// returns a promise to indicate when the server is actually stopped.
const serverToStopPromise = (server) => {

	const sockets = [];

	// If we're testing then we want to be able to bail out quickly.  Zombie
	// (the test browser) makes keepalive connections to our static asset
	// server, and we don't need to be polite to it when we're tearing down.
	if (process.env.NODE_ENV === "test") { // eslint-disable-line no-process-env
		server.on('connection', socket => sockets.push(socket));
	}

	return () => {
		return new Promise((resolve, reject) => {

			// This will only have anything if we're testing.  See above.
			sockets.forEach(socket => socket.destroy());

			server.on('error', (e) => {
				logger.error('An error was emitted while shutting down the server');
				logger.error(e);
				reject(e);
			});
			server.close((e) => {
				if (e) {
					logger.error('The server was not started, so it cannot be stopped.');
					logger.error(e);
					reject(e);
					return;
				}
				resolve();
			});
		});
	};
};



// given the server routes file and a port, start a react-server HTML server at
// http://host:port/. returns an object with two properties, started and stop;
// see the default function doc for explanation.
const startHtmlServer = (serverRoutes, port, bindIp, httpsOptions, customMiddlewarePath) => {
	const server = express();
	const httpServer = httpsOptions ? https.createServer(httpsOptions, server) : http.createServer(server);
	let middlewareSetup = (server, rsMiddleware) => {
		server.use(compression());
		server.use(bodyParser.urlencoded({ extended: false }));
		server.use(bodyParser.json());
		server.use(helmet());
		rsMiddleware();
	};

	return {
		stop: serverToStopPromise(httpServer),
		started: new Promise((resolve, reject) => {
			logger.info("Starting HTML server...");

			let rsMiddlewareCalled = false;
			const rsMiddleware = () => {
				rsMiddlewareCalled = true;

				expressState.extend(server);

				// parse cookies into req.cookies property
				server.use(cookieParser());

				// sets the namespace that data will be exposed into client-side
				// TODO: express-state doesn't do much for us until we're using a templating library
				server.set('state namespace', '__reactServerState');

				server.use((req, res, next) => {
					reactServer.middleware(req, res, next, require(serverRoutes));
				});
			};

			if (customMiddlewarePath) {
				const customMiddlewareDirAb = path.resolve(process.cwd(), customMiddlewarePath);
				middlewareSetup = require(customMiddlewareDirAb).default;
			}

			middlewareSetup(server, rsMiddleware);

			if (!rsMiddlewareCalled) {
				console.error("Error react-server middleware was never setup in custom middleware function");
				reject("Custom middleware did not setup react-server middleware");
				return;
			}

			httpServer.on('error', (e) => {
				console.error("Error starting up HTML server");
				console.error(e);
				reject(e);
			});
			httpServer.listen(port, bindIp, (e) => {
				if (e) {
					reject(e);
					return;
				}
				logger.info(`Started HTML server over ${httpsOptions ? "HTTPS" : "HTTP"} on ${bindIp}:${port}`);
				resolve();
			});
		}),
	};
};

// given a webpack compiler and a port, compile the JavaScript code to static
// files and start up a web server at http://host:port/ that serves the
// static compiled JavaScript. returns an object with two properties, started and stop;
// see the default function doc for explanation.
const startStaticJsServer = (compiler, port, bindIp, longTermCaching, httpsOptions) => {
	const server = express();
	const httpServer = httpsOptions ? https.createServer(httpsOptions, server) : http.createServer(server);
	return {
		stop: serverToStopPromise(httpServer),
		started: new Promise((resolve, reject) => {
			compiler.run((err, stats) => {
				const error = handleCompilationErrors(err, stats);
				if (error) {
					reject(error);
					return;
				}

				if (stats) {
					logger.debug("Successfully compiled static JavaScript.");
				}

				// TODO: make this parameterized based on what is returned from compileClient
				server.use('/', compression(), express.static(`__clientTemp/build`, {
					maxage: longTermCaching ? '365d' : '0s',
				}));
				logger.info("Starting static JavaScript server...");

				httpServer.on('error', (e) => {
					console.error("Error starting up JS server");
					console.error(e);
					reject(e)
				});
				httpServer.listen(port, bindIp, (e) => {
					if (e) {
						reject(e);
						return;
					}

					logger.info(`Started static JavaScript server over ${httpsOptions ? "HTTPS" : "HTTP"} on ${bindIp}:${port}`);
					resolve();
				});
			});
		}),
	};
};

// given a webpack compiler and a port, start a webpack dev server that is ready
// for hot reloading at http://localhost:port/. note that the webpack compiler
// must have been configured correctly for hot reloading. returns an object with
// two properties, started and stop; see the default function doc for explanation.
const startHotLoadJsServer = (compiler, port, bindIp, longTermCaching, httpsOptions) => {
	logger.info("Starting hot reload JavaScript server...");
	const compiledPromise = new Promise((resolve) => compiler.plugin("done", () => resolve()));
	const jsServer = new WebpackDevServer(compiler, {
		noInfo: true,
		hot: true,
		headers: { 'Access-Control-Allow-Origin': '*' },
		https: !!httpsOptions,
		key: httpsOptions ? httpsOptions.key : undefined,
		cert: httpsOptions ? httpsOptions.cert : undefined,
		ca: httpsOptions ? httpsOptions.ca : undefined,
	});
	const serverStartedPromise = new Promise((resolve, reject) => {
		jsServer.listen(port, bindIp, (e) => {
			if (e) {
				reject(e);
				return;
			}
			resolve();
		});
	});
	return {
		stop: serverToStopPromise(jsServer),
		started: Promise.all([compiledPromise, serverStartedPromise])
			.then(() => logger.info(`Started hot reload JavaScript server over ${httpsOptions ? "HTTPS" : "HTTP"} on ${bindIp}:${port}`)),
	};
};

// for when you need to run the JavaScript compiler (in order to get the chunk file
// names for the server routes file) but don't really want to actually up a JavaScript
// server. Supports the same signature as startStaticJsServer and startHotLoadJsServer,
// returning the same {stop, started} object.
const startDummyJsServer = (compiler /*, port, longTermCaching, httpsOptions*/) => {
	return {
		stop: () => Promise.resolve(),
		started: new Promise((resolve, reject) => compiler.run((err, stats) => {
			// even though we aren't using the compiled code (we're pointing at jsUrl),
			// we still need to run the compilation to get the chunk file names.
			try {
				handleCompilationErrors(err, stats);
			} catch (e) {
				logger.emergency("Failed to compile the local code.", e.stack);
				reject(e);
				return;
			}
			resolve();
		})),
	};
};


// if used to start a server, returns an object with two properties, started and
// stop. started is a promise that resolves when all necessary servers have been
// started. stop is a method to stop all servers. It takes no arguments and
// returns a promise that resolves when the server has stopped.
export default function start(options) {
	setupLogging(options);
	logProductionWarnings(options);

	const {
		port,
		bindIp,
		jsPort,
		hot,
		jsUrl,
		httpsOptions,
		longTermCaching,
		customMiddlewarePath,
		compileOnStartup,
	} = options;

	const routesFileLocation = path.join(process.cwd(), '__clientTemp/routes_server.js');
	let serverRoutes,
		compiler;

	const startServers = () => {
		// if jsUrl is set, we need to run the compiler, but we don't want to start a JS
		// server.
		let startJsServer = startDummyJsServer;

		if ((hot === false || hot === "false") && (compileOnStartup === false || compileOnStartup === "false")) {
			serverRoutes = new Promise((resolve, reject) => {
				fs.access(routesFileLocation, fs.constants.R_OK, (err) => {
					if (err) {
						reject("You must manually compile your application when compileOnStartup is set to false.");
					} else {
						// We need to replace the promise returned by the compiler with an already-resolved promise with the path
						// of the compiled routes file.
						resolve(routesFileLocation);
					}
				});
			});

			// mock the compiler object used by the various JS servers so that the compiler.run function always succeeds.
			// This will allow the JS servers to work properly, thinking that the compiler actually ran.
			compiler = {};
			compiler.run = (cb) => {
				cb(null, null);
			};
		} else {
			// ES6 destructuring without a preceding `let` or `const` results in a syntax error.  Therefore, the below
			// statement must be wrapped in parentheses to work properly.
			// http://exploringjs.com/es6/ch_destructuring.html#sec_leading-curly-brace-destructuring
			({ serverRoutes, compiler } = compileClient(options));
		}

		if (!jsUrl) {
			// if jsUrl is not set, we need to start up a JS server, either hot load
			// or static.
			startJsServer = hot ? startHotLoadJsServer : startStaticJsServer;
		}

		logger.notice("Starting servers...");

		const jsServer = startJsServer(compiler, jsPort, bindIp, longTermCaching, httpsOptions);
		const htmlServerPromise = serverRoutes
			.then(serverRoutesFile => startHtmlServer(serverRoutesFile, port, bindIp, httpsOptions, customMiddlewarePath))
			.catch((e) => { throw e; });

		return {
			stop: () => Promise.all([jsServer.stop(), htmlServerPromise.then(server => server.stop())]),
			started: Promise.all([jsServer.started, htmlServerPromise.then(server => server.started)])
				.catch(e => { logger.error(e); throw e })
				.then(() => logger.notice(`Ready for requests on ${bindIp}:${port}.`)),
		};
	};

	return startServers();
}
