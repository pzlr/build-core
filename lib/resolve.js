'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	config = require('./config');

const
	fs = require('fs-extra-promise'),
	path = require('upath');

const
	vinyl = require('vinyl-fs'),
	glob = require('glob-promise'),
	findNodeModules = require('find-node-modules'),
	isPathInside = require('is-path-inside');

const
	cwd = process.cwd(),
	lib = [].concat(findNodeModules({relative: false, cwd})).filter((el) => isPathInside(el, cwd)).slice(-1)[0];

const
	depMap = {},
	dependencies = [],
	rootDependencies = [],
	serverDependencies = [],
	entryDependencies = [],
	rgxpDependencies = [];

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
			libDir: src,
			exclude: new Set()
		} :

		{
			...obj,
			libDir: src,
			exclude: new Set(obj.exclude)
		}
	;

	ignore.push(decl.exclude);
	rgxpDependencies.push(new RegExp(`^${Sugar.RegExp.escape(baseSrc)}`));

	let
		cfg = path.join(src, '.pzlrrc');

	if (fs.existsSync(cfg)) {
		cfg = decl.config = $C.extend(true, {}, require('./pzrlrc-default.json'), fs.readJsonSync(cfg));
		entryDependencies.push(path.join(baseSrc, cfg.sourceDir, cfg.entriesDir));

		const
			base = path.join(src, cfg.sourceDir),
			depsDir = path.join(base, cfg.blockDir),
			serverDir = path.join(base, cfg.serverDir);

		dependencies.push(depsDir);
		serverDependencies.push(serverDir);
		rootDependencies.push(base);

		depMap[baseSrc].dir = depsDir;
		depMap[baseSrc].serverDir = serverDir;
		depMap[baseSrc].sourceDir = base;

	} else {
		decl.config = $C.extend(true, {}, config);
		entryDependencies.push(path.join(baseSrc, config.sourceDir, config.entriesDir));

		const
			base = path.join(src, config.sourceDir),
			depsDir = path.join(base, config.blockDir),
			serverDir = path.join(base, config.serverDir);

		dependencies.push(depsDir);
		serverDependencies.push(serverDir);
		rootDependencies.push(base);

		depMap[baseSrc].dir = depsDir;
		depMap[baseSrc].serverDir = serverDir;
		depMap[baseSrc].sourceDir = base;
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
 * @param {(number|string)=} [skip]
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

	let
		r = sourceDirs,
		ctx;

	if (Sugar.Object.isString(skip)) {
		ctx = skip;
		skip = 0;
	}

	if (config.superRgxp.test(name)) {
		if (!ctx) {
			throw Error('Context for block is not defined');
		}

		name = name.replace(config.superRgxp, '');
		r = r.slice(1);

		for (let i = 0; i < r.length; i++) {
			if (isPathInside(ctx, r[i])) {
				r = r.slice(i + 1);
				break;
			}
		}
	}

	const
		wrap = (path, lvl) => skip ? {path, from: lvl + 1} : path;

	for (let i = skip; i < r.length; i++) {
		if (i && baseExt && ignore[i - 1].has(baseExt)) {
			continue;
		}

		const
			root = r[i],
			file = path.join(name, advExt).replace(/\.logic$/, `.${types[i]}`);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return wrap(path.join(root, baseExt ? file : name), i);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`,
			mask = [path.join(root, components)].concat(virtualComponents ? path.join(root, virtualComponents) : []);

		let src;
		await $C(vinyl.src(mask, {read: false})).one.forEach((el, i, data, o) => {
			src = el.path;
			o.cursor.destroy();
		});

		if (src) {
			return wrap(advExt ? path.dirname(src) : src, i);
		}
	}

	for (let i = 0; i < rgxpDependencies.length; i++) {
		const
			root = dependencies[i],
			rgxp = rgxpDependencies[i];

		if (!rgxp.test(name) || baseExt && ignore[i].has(baseExt)) {
			continue;
		}

		const
			realName = name.replace(rgxp, ''),
			file = path.join(realName, advExt).replace(/\.logic$/, `.${types[i]}`);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return path.join(root, baseExt ? file : realName);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${realName}.index.js`,
			mask = [path.join(root, components)].concat(virtualComponents ? path.join(root, virtualComponents) : []);

		let src;
		await $C(vinyl.src(mask, {read: false})).one.forEach((el, i, data, o) => {
			src = el.path;
			o.cursor.destroy();
		});

		if (src) {
			return advExt ? path.dirname(src) : src;
		}

		break;
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

	let
		r = sourceDirs,
		ctx;

	if (Sugar.Object.isString(skip)) {
		ctx = skip;
		skip = 0;
	}

	if (config.superRgxp.test(name)) {
		if (!ctx) {
			throw Error('Context for block is not defined');
		}

		name = name.replace(config.superRgxp, '');
		r = r.slice(1);

		for (let i = 0; i < r.length; i++) {
			if (isPathInside(ctx, r[i])) {
				r = r.slice(i + 1);
				break;
			}
		}
	}

	const
		wrap = (path, lvl) => skip ? {path, from: lvl + 1} : path;

	for (let i = skip; i < r.length; i++) {
		if (i && baseExt && ignore[i - 1].has(baseExt)) {
			continue;
		}

		const
			root = r[i],
			file = path.join(name, advExt).replace(/\.logic$/, `.${types[i]}`);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return wrap(path.join(root, baseExt ? file : name), i);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`;

		let
			src = glob.sync(path.join(root, components))[0];

		if (!src && virtualComponents) {
			src = glob.sync(path.join(root, virtualComponents))[0];
		}

		if (src) {
			return wrap(advExt ? path.dirname(src) : src, i);
		}
	}

	for (let i = 0; i < rgxpDependencies.length; i++) {
		const
			root = dependencies[i],
			rgxp = rgxpDependencies[i];

		if (!rgxp.test(name) || baseExt && ignore[i].has(baseExt)) {
			continue;
		}

		const
			realName = name.replace(rgxp, ''),
			file = path.join(realName, advExt).replace(/\.logic$/, `.${types[i]}`);

		if (!glob.hasMagic(file) && fs.existsSync(path.join(root, file))) {
			return path.join(root, baseExt ? file : realName);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${realName}.index.js`;

		let
			src = glob.sync(path.join(root, components))[0];

		if (!src && virtualComponents) {
			src = glob.sync(path.join(root, virtualComponents))[0];
		}

		if (src) {
			return advExt ? path.dirname(src) : src;
		}

		break;
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

/**
 * Returns layer if url is inside it's path
 * or undefined otherwise
 *
 * @param {string} url
 * @returns {Object|undefined}
 */
function getLayerByPath(url) {
	if (isPathInside(url, cwd)) {
		return {
			src: config.projectName,
			dir: blockSync(),
			serverDir: path.join(cwd, config.serverDir),
			sourceDir,
			config
		};
	}

	return $C(depMap).one.get((value) => isPathInside(url, value.dir));
}

module.exports = {
	cwd,
	lib,
	depMap,
	sourceDir,
	sourceDirs,
	dependencies,
	rootDependencies,
	serverDependencies,
	entryDependencies,
	getLayerByPath,
	blockSync,
	block,
	entry,
	isNodeModule
};
