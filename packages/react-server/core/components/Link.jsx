
var React = require('react'),
	navigateTo = require("../util/navigateTo");

module.exports = React.createClass({
	displayName: 'Link',

	propTypes: {
		path       : React.PropTypes.string,
		href       : React.PropTypes.string,
		bundleData : React.PropTypes.bool,
		reuseDom   : React.PropTypes.bool,
		className  : React.PropTypes.string,
	},

	getDefaultProps(){
		return {
			bundleData : false,
			reuseDom   : false,
		}
	},

	render: function () {
		return (
			<a href={this.props.path || this.props.href} onClick={this._onClick} className={this.props.className}>{this.props.children}</a>
		);
	},

	_onClick: function (e) {

		 // TODO: IE8-9 detection
         var userAgent = navigator.userAgent,
         ieTest8 = /MSIE\s8\../,
         ieTest9 = /MSIE\s9\../;
         userAgent = userAgent.split(";");       
         if (userAgent[1].match(ieTest8) || userAgent[1].match(ieText9)) {
                //do something
         }
         
		// TODO: if OSX && key.isMeta?
		if (!e.metaKey) {
			e.preventDefault();
			e.stopPropagation();
			const {bundleData, reuseDom} = this.props;
			navigateTo(this.props.path || this.props.href, {
				bundleData,
				reuseDom,
			});
		} else {
			// do normal browser navigate
		}

	},
})
