'use strict';

const
	path = require('path'),
	config = require('./config'),
	sourceDir = path.resolve(process.cwd(), config.sourceDir);

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
	sourceDir, config.blockDir, name.replace(/^@/, `${parent}/`)
));

/**
 * Returns an absolute path to an entry by the specified name
 * @param [name] - entry name (if empty, returns path to the entries folder)
 */
module.exports.entry = (name = '') => path.normalize(path.join(sourceDir, config.entriesDir, name ? `${name}.js` : ''));
