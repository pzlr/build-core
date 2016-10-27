'use strict';

const
	path = require('path'),
	fs = require('fs-extra');

const
	configPath = path.join(process.cwd(), '.pzlrrc'),
	configExists = fs.existsSync(configPath);

let config = {};

if (configExists) {
	try {
		config = fs.readJsonSync(configPath);

	} catch (err) {
		throw new Error('.pzlrrc should be a valid JSON');
	}

} else {
	console.log('Warning: .pzlrrc doesn\'t exist');
}

module.exports = config;
