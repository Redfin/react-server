// These show up on the index page (homepage).
// Your `path` must be able to handle `entry`.
// Your module must live at `pages${entry}`.
// If you don't include a `path`, it will be created for you from `entry`.
// Your method will be defaulted to "get".
// The default `description` is your route _key_.
module.exports = {
	RootWhen: {
		entry: "/root/when",
		description: "<RootElement when={...}>",
	},
	AboveTheFold: {
		entry: "/root/aboveTheFold",
		description: "Above The Fold Count",
	},
	NavigationPlayground: {
		entry: "/navigation/playground",
		description: "Navigation playground",
	},
	StylePromises: {
		entry: "/styles/promises",
		description: "Stylesheets returned from promises",
	},
	NavigationDataBundleCache: {
		entry: "/navigation/data-bundle-cache",
		description: "Data bundle cache",
	},
}
