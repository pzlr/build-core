'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	fs = require('fs-extra-promise'),
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
	entryDependencies = [];

const
	ignore = [],
	types = [config.projectType];

$C(config.dependencies).forEach((obj) => {
	const
		isStr = Sugar.Object.isString(obj),
		baseSrc = isStr ? obj : obj.src;

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

	const
		src = path.join(cwd, 'node_modules', baseSrc);

	let
		cfg = path.join(src, '.pzlrrc');

	if (fs.existsSync(cfg)) {
		cfg = decl.config = $C.extend(true, {}, require('./pzrlrc-default.json'), fs.readJsonSync(cfg));
		entryDependencies.push(path.join(baseSrc, cfg.sourceDir, cfg.entriesDir));

		const
			base = path.join(src, cfg.sourceDir);

		dependencies.push(path.join(base, cfg.blockDir));
		rootDependencies.push(base);

	} else {
		decl.config = $C.extend(true, {}, config);
		entryDependencies.push(path.join(baseSrc, config.sourceDir, config.entriesDir));

		const
			base = path.join(src, config.sourceDir);

		dependencies.push(path.join(base, config.blockDir));
		rootDependencies.push(base);
	}

	types.push(cfg.projectType || 'js');
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

		if (!glob.hasMagic(file) && await fs.existsAsync(path.join(root, file))) {
			return wrap(src, i);
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`;

		const files = await Promise.all([
			glob(path.join(root, components)),
			virtualComponents ? glob(path.join(root, virtualComponents)) : []
		]);

		src = files[0][0] || files[1][0];

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

module.exports = {
	cwd,
	lib,
	depMap,
	sourceDir,
	sourceDirs,
	dependencies,
	rootDependencies,
	entryDependencies,
	block,
	entry
};
