'use strict';

const
	path = require('path'),
	config = require('./config'),
	defaultSourceDir = './client',
	sourceDir = path.resolve(process.cwd(), config.sourceDir || defaultSourceDir);

/**
 * Source directory
 * @type {string}
 */
module.exports.sourceDir = sourceDir;

/**
 * Returns an absolute path to a block by the specified name
 *
 * @param {string} [name]
 * @param {string} [parent] - parent name
 * @returns {string}
 */
module.exports.block = (name = '', parent = '') => path.normalize(path.join(
	sourceDir, 'blocks', name.replace(/^@/, `${parent}/`)
));
