'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar');

const
	path = require('upath'),
	fs = require('fs-extra-promise');

const
	configPath = path.join(process.cwd(), '.pzlrrc'),
	configExists = fs.existsSync(configPath),

	packagePath = path.join(process.cwd(), 'package.json'),
	packageExists = fs.existsSync(packagePath),

	superLink = '@super';

const config = $C.extend(true, {}, require('./pzrlrc-default.json'), {
	super: superLink,
	superRgxp: new RegExp(`^${Sugar.RegExp.escape(superLink)}(?:[/\\\\]|$)`)
});

if (configExists) {
	try {
		$C.extend(true, config, fs.readJsonSync(configPath));

	} catch (_) {
		throw new Error('.pzlrrc should be a valid JSON');
	}

} else {
	console.warn('Warning: .pzlrrc doesn\'t exist');
}

if (packageExists) {
	try {
		const
			p = fs.readJsonSync(packagePath);

		config.projectName = p.name;

	} catch (_) {
		throw new Error('package.json should be a valid JSON');
	}
}

/**
 * Config object
 * @type {!Object}
 */
module.exports = config;
