'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var yosay = require('yosay');

module.exports = yeoman.Base.extend({
	prompting: function () {
		this.log(yosay(
			'Welcome to the shining ' + chalk.red('generator-react-server') + ' generator!'
		));

		var prompts = [{
			type: 'input',
			name: 'name',
			message: 'What would you like to call your app?',
			default: this.appname
		}];

		return this.prompt(prompts).then(function (props) {
			this.props = props;
		}.bind(this));
	},

	writing: function () {
		var _this = this;
		[
			'_babelrc',
			'_gitignore'
		].forEach(function (filename) {
			var fn = filename.replace('_', '.');
			_this.fs.copyTpl(
				_this.templatePath(filename),
				_this.destinationPath(fn),
				_this.props
			);
		});

		[
			'hello-world-page.js',
			'hello-world.js',
			'package.json',
			'README.md',
			'routes.js'
		].forEach(function (filename) {
			_this.fs.copyTpl(
				_this.templatePath(filename),
				_this.destinationPath(filename),
				_this.props
			);
		});
	},

	install: function () {
		this.npmInstall();
	}
});
