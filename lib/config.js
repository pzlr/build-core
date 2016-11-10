'use strict';

const
	path = require('path'),
	fs = require('fs-extra'),
	Sugar = require('sugar');

const
	configPath = path.join(process.cwd(), '.pzlrrc'),
	configExists = fs.existsSync(configPath),
	config = require('./pzrlrc-default.json');

if (configExists) {
	try {
		Sugar.Object.merge(config, fs.readJsonSync(configPath), {deep: true});

	} catch (err) {
		throw new Error('.pzlrrc should be a valid JSON');
	}

} else {
	console.warn('Warning: .pzlrrc doesn\'t exist');
}

/**
 * Config object
 * @type {!Object}
 */
module.exports = config;
