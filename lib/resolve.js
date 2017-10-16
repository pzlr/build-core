'use strict';

const
	$C = require('collection.js'),
	fs = require('fs-extra-promise'),
	path = require('path');

const
	config = require('./config'),
	cwd = process.cwd();

const dependencies = $C(config.dependencies).map((src) => {
	src = path.join(cwd, 'node_modules', src);

	let
		cfg = path.join(src, '.pzlrrc');

	if (fs.existsSync(cfg)) {
		cfg = $C.extend(true, {}, require('./pzrlrc-default.json'), fs.readJsonSync(cfg));
		return path.join(src, cfg.sourceDir, cfg.blockDir);
	}

	return src;
});

const
	sourceDir = path.join(cwd, config.sourceDir),
	sourceDirs = [sourceDir].concat(dependencies);

/**
 * Returns an absolute path to a block by the specified name
 *
 * @param {string} [name]
 * @param {string} [parent] - parent name
 * @returns {string}
 */
function block(name = '', parent = '') {
	name = name.replace(/^@/, `${parent}/`);

	const
		base = path.join(sourceDirs[0], config.blockDir, name);

	if (sourceDirs.length === 1 || fs.existsSync(base)) {
		return base;
	}

	for (let i = 1; i < sourceDirs.length; i++) {
		const
			src = path.join(sourceDirs[i], name);

		if (fs.existsSync(src)) {
			return src;
		}
	}

	return base;
}

/**
 * Returns an absolute path to an entry by the specified name
 * @param [name] - entry name (if empty, returns path to the entries folder)
 */
function entry(name = '') {
	return path.normalize(path.join(sourceDir, config.entriesDir, name ? `${name}.js` : ''));
}

module.exports = {
	sourceDir,
	sourceDirs,
	dependencies,
	block,
	entry
};
