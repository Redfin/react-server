export default (pathToStatic, manifest) => {
	return class CoreJsMiddleware {
		getSystemScripts(next) {
			// hook for integration tests to turn off client rendering and just test
			// server rendering.
			if (this.getRequest().getQuery()._debug_no_system_scripts) {
				return [];
			}

			const routeName = this.getRequest().getRouteName();
			const baseUrl = pathToStatic || "/";

			const scripts = [];

			// read out the chunkmap so that the client code knows how to download the
			// other chunks.
			scripts.push({
				type: "text/javascript",
				text: `window.webpackManifest = ${JSON.stringify(manifest.jsChunksById)};`,
			});

			scripts.push(`${baseUrl}${manifest.jsChunksByName.common}`);
			scripts.push(`${baseUrl}${manifest.jsChunksByName[routeName]}`);

			return [
				...scripts,
				{
					type: "text/javascript",
					text: `
						if (typeof window !== "undefined") {
							if (window.__setReactServerBase) {
								window.__setReactServerBase(${JSON.stringify(baseUrl)});
							}
							window.__reactServerManifest = ${manifest ? JSON.stringify(manifest) : "{}"};
						}
						`,
				},
				...next(),
			];
		}
	}
}
