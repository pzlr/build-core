'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	fs = require('fs-extra-promise'),
	vinyl = require('vinyl-fs'),
	path = require('path'),
	glob = require('glob-promise'),
	findNodeModules = require('find-node-modules'),
	config = require('./config');

const
	cwd = process.cwd(),
	lib = [].concat(findNodeModules({relative: false, cwd})).slice(-1)[0];

const
	depMap = {},
	dependencies = [],
	rootDependencies = [],
	serverDependencies = [],
	entryDependencies = [];

const
	ignore = [],
	types = [config.projectType];

$C(config.dependencies).forEach((obj) => {
	const
		isStr = Sugar.Object.isString(obj),
		baseSrc = isStr ? obj : obj.src,
		src = path.join(lib, baseSrc);

	if (depMap[baseSrc]) {
		return;
	}

	const decl = depMap[baseSrc] = isStr ?
		{
			src: baseSrc,
			exclude: new Set()
		} :

		{
			...obj,
			exclude: new Set(obj.exclude)
		}
	;

	ignore.push(
		decl.exclude
	);

	let
		cfg = path.join(src, '.pzlrrc');

	if (fs.existsSync(cfg)) {
		cfg = decl.config = $C.extend(true, {}, require('./pzrlrc-default.json'), fs.readJsonSync(cfg));
		entryDependencies.push(path.join(baseSrc, cfg.sourceDir, cfg.entriesDir));

		const
			base = path.join(src, cfg.sourceDir);

		dependencies.push(path.join(base, cfg.blockDir));
		serverDependencies.push(path.join(base, cfg.serverDir));
		rootDependencies.push(base);

	} else {
		decl.config = $C.extend(true, {}, config);
		entryDependencies.push(path.join(baseSrc, config.sourceDir, config.entriesDir));

		const
			base = path.join(src, config.sourceDir);

		dependencies.push(path.join(base, config.blockDir));
		serverDependencies.push(path.join(base, config.serverDir));
		rootDependencies.push(base);
	}

	types.push(cfg.projectType || config.projectType);
});

const
	sourceDir = path.join(cwd, config.sourceDir),
	sourceDirs = [sourceDir].concat(dependencies);

/**
 * Returns an absolute path to a block by the specified name
 *
 * @param {string=} [name]
 * @param {number=} [skip]
 * @returns {!Promise<(string|Array<string>|{path: (string|Array<string>), lvl: number}|null)>}
 */
async function block(name = '', skip = 0) {
	const
		baseRoot = path.join(sourceDirs[0], config.blockDir);

	if (!name) {
		return baseRoot;
	}

	const
		baseExt = path.extname(name),
		advExt = baseExt ? '' : 'index.js';

	const
		wrap = (path, lvl) => skip ? {path, from: lvl + 1} : path;

	for (let i = skip; i < sourceDirs.length; i++) {
		if (i && baseExt && ignore[i - 1].has(baseExt)) {
			continue;
		}

		const
			root = sourceDirs[i],
			file = path.join(name, advExt).replace(/\.logic$/, `.${types[i]}`);

		let
			src = path.join(root, name);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return wrap(src, i);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`,
			mask = [path.join(root, components)].concat(virtualComponents ? path.join(root, virtualComponents) : []);

		await $C(vinyl.src(mask, {read: false})).async.forEach((el, i, data, o) => {
			src = el.path;
			o.cursor.destroy();
			return o.break;
		});

		if (src) {
			return wrap(advExt ? path.dirname(src) : src, i);
		}
	}

	return baseExt || skip ? null : path.join(baseRoot, name);
}

/**
 * Returns an absolute path to a block by the specified name
 *
 * @param {string=} [name]
 * @param {number=} [skip]
 * @returns {(string|Array<string>|{path: (string|Array<string>), lvl: number}|null)}
 */
function blockSync(name = '', skip = 0) {
	const
		baseRoot = path.join(sourceDirs[0], config.blockDir);

	if (!name) {
		return baseRoot;
	}

	const
		baseExt = path.extname(name),
		advExt = baseExt ? '' : 'index.js';

	const
		wrap = (path, lvl) => skip ? {path, from: lvl + 1} : path;

	for (let i = skip; i < sourceDirs.length; i++) {
		if (i && baseExt && ignore[i - 1].has(baseExt)) {
			continue;
		}

		const
			root = sourceDirs[i],
			file = path.join(name, advExt).replace(/\.logic$/, `.${types[i]}`);

		let
			src = path.join(root, name);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return wrap(src, i);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`;

		src = glob.sync(path.join(root, components))[0];
		if (!src && virtualComponents) {
			src = glob.sync(path.join(root, virtualComponents))[0];
		}

		if (src) {
			return wrap(advExt ? path.dirname(src) : src, i);
		}
	}

	return baseExt || skip ? null : path.join(baseRoot, name);
}

/**
 * Returns an absolute path to an entry by the specified name
 * @param {string=} [name] - entry name (if empty, returns path to the entries folder)
 */
function entry(name = '') {
	return path.normalize(path.join(sourceDir, config.entriesDir, name ? `${name}.js` : ''));
}

/**
 * Returns true if the specified url is a node module
 *
 * @param {string} url
 * @returns {boolean}
 */
function isNodeModule(url) {
	return !path.isAbsolute(url) && /^[^./\\]/.test(url);
}

module.exports = {
	cwd,
	lib,
	depMap,
	sourceDir,
	sourceDirs,
	dependencies,
	rootDependencies,
	entryDependencies,
	blockSync,
	block,
	entry,
	isNodeModule
};
