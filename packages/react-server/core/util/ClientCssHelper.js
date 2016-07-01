
var logger = require('../logging').getLogger(__LOGGER__);
var {PAGE_CSS_NODE_ID} = require('../constants');
var Q = require('q');
var PageUtil = require('./PageUtil')

var loadedCss = {};

module.exports = {

	registerPageLoad: function registerPageLoad() {
		if (SERVER_SIDE) {
			throw new Error("ClientCssHelper.registerPageLoad can't be called server-side");
		}
		// for each css node in the head that the react-server server wrote to the response, note it down in the cache, so that
		// we can remove it on a page to page transition.
		var serverWrittenLinkNodes = document.head.querySelectorAll(`link[${PAGE_CSS_NODE_ID}],style[${PAGE_CSS_NODE_ID}]`);
		for (var i = 0; i < serverWrittenLinkNodes.length; i++) {
			var key, styleNode = serverWrittenLinkNodes[i];
			if (styleNode.href) {
				key = styleNode.href;
			} else {
				key = styleNode.innerHTML;
			}
			loadedCss[key] = styleNode;
		}
	},

	ensureCss: function ensureCss(routeName, pageObject) {
		if (SERVER_SIDE) {
			throw new Error("ClientCssHelper.registerPageLoad can't be called server-side");
		}

		return Q.all(PageUtil.standardizeStyles(pageObject.getHeadStylesheets())).then(newCss => {
			var newCssByKey = {};
			newCss
				.filter(style => !!style)
				.forEach(style => {newCssByKey[this._keyFromStyleSheet(style)] = style});

			// first, remove the unneeded CSS link elements.
			Object.keys(loadedCss).forEach(loadedCssKey => {

				if (!newCssByKey[loadedCssKey]) {
					// remove the corresponding node from the DOM.
					logger.debug("Removing stylesheet: " + loadedCssKey);
					var node = loadedCss[loadedCssKey];
					node.parentNode.removeChild(node);
					delete loadedCss[loadedCssKey];
				}
			});

			// next add the style URLs that weren't already loaded.
			return Q.all(Object.keys(newCssByKey).map(newCssKey => {
				var retval;
				if (!loadedCss[newCssKey]) {
					// this means that the CSS is not currently present in the
					// document, so we need to add it.
					logger.debug("Adding stylesheet: " + newCssKey);

					var style = newCssByKey[newCssKey];
					var styleTag;

					if (style.href) {
						styleTag = document.createElement('link');
						styleTag.rel = 'stylesheet';
						styleTag.href = style.href;

						// If we _can_ wait for the CSS to be loaded before
						// proceeding, let's do so.
						if ('onload' in styleTag) {
							var dfd = Q.defer();
							styleTag.onload = dfd.resolve;
							retval = dfd.promise;
						}
					} else {
						styleTag = document.createElement('style');
						styleTag.innerHTML = style.text;
					}
					styleTag.type = style.type;
					styleTag.media = style.media;

					loadedCss[newCssKey] = styleTag;
					document.head.appendChild(styleTag);
				} else {
					logger.debug(`Stylesheet already loaded (no-op): ${newCssKey}`);
				}
				return retval;
			}));
		});
	},

	_keyFromStyleSheet: function(style) {
		return style.href || style.text;
	},
}
