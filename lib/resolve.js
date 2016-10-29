'use strict';

const
	path = require('path'),
	config = require('./config'),
	defaultSourceDir = './client',
	sourceDir = path.resolve(process.cwd(), config.sourceDir || defaultSourceDir);

module.exports.sourceDir = sourceDir;
module.exports.block = (name) => path.join(sourceDir, 'blocks', name).replace(/\\/g, '/');
