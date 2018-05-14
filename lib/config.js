'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar');

const
	path = require('path'),
	fs = require('fs-extra-promise');

const
	configPath = path.join(process.cwd(), '.pzlrrc'),
	configExists = fs.existsSync(configPath),
	config = $C.extend(true, {}, require('./pzrlrc-default.json'));

if (configExists) {
	try {
		$C.extend(true, config, fs.readJsonSync(configPath));

	} catch (_) {
		throw new Error('.pzlrrc should be a valid JSON');
	}

} else {
	console.warn('Warning: .pzlrrc doesn\'t exist');
}

/**
 * RegExp for super link
 */
config.superRgxp = new RegExp(`^${Sugar.RegExp.escape(config.super)}[/\\\\]`);

/**
 * Config object
 * @type {!Object}
 */
module.exports = config;
