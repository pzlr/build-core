'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar');

const
	path = require('upath'),
	fs = require('fs-extra-promise');

const
	packagePath = path.join(process.cwd(), 'package.json'),
	superLink = '@super';

const config = $C.extend(true, {}, require('./pzrlrc-default.json'), {
	super: superLink,
	superRgxp: new RegExp(`^${Sugar.RegExp.escape(superLink)}(?:[/\\\\]|$)`)
});

const
	jsConfigPath = path.join(process.cwd(), '.pzlrrc.js'),
	jsonConfigPath = path.join(process.cwd(), '.pzlrrc');

if (fs.existsSync(jsonConfigPath)) {
	try {
		$C.extend(true, config, fs.readJsonSync(jsonConfigPath));

	} catch {
		throw new Error('.pzlrrc should be a valid JSON');
	}
}

if (fs.existsSync(jsConfigPath)) {
	$C.extend({deep: true, withAccessors: true}, config, require(jsConfigPath));
}

try {
	const p = fs.readJsonSync(packagePath);
	config.projectName = p.name;

} catch {
	throw new Error('package.json should be a valid JSON');
}

/**
 * Config object
 * @type {!Object}
 */
module.exports = config;
