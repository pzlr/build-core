'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	fs = require('fs-extra-promise'),
	path = require('path'),
	glob = require('glob-promise');

const
	config = require('./config'),
	cwd = process.cwd();

const
	depMap = {},
	dependencies = [],
	rootDependencies = [],
	ignore = [];

$C(config.dependencies).forEach((obj) => {
	const
		isStr = Sugar.Object.isString(obj),
		baseSrc = isStr ? obj : obj.src;

	if (depMap[baseSrc]) {
		return;
	}

	depMap[baseSrc] = isStr ?
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
		depMap[baseSrc].exclude
	);

	const
		src = path.join(cwd, 'node_modules', Sugar.Object.isString(obj) ? obj : obj.src);

	let
		cfg = path.join(src, '.pzlrrc');

	if (fs.existsSync(cfg)) {
		cfg = $C.extend(true, {}, require('./pzrlrc-default.json'), fs.readJsonSync(cfg));

		const
			base = path.join(src, cfg.sourceDir);

		dependencies.push(path.join(base, cfg.blockDir));
		rootDependencies.push(base);

	} else {
		dependencies.push(src);
		rootDependencies.push(src);
	}
});

const
	sourceDir = path.join(cwd, config.sourceDir),
	sourceDirs = [sourceDir].concat(dependencies);

/**
 * Returns an absolute path to a block by the specified name
 *
 * @param {string} [name]
 * @param {string} [parent] - parent name
 * @returns {?string}
 */
async function block(name = '', parent = '') {
	name = name.replace(/^@/, `${parent}/`);

	const
		baseRoot = path.join(sourceDirs[0], config.blockDir);

	if (!name) {
		return baseRoot;
	}

	const
		baseExt = path.extname(name),
		advExt = baseExt ? '' : 'index.js',
		base = path.join(baseRoot, name);

	if (!baseExt && sourceDirs.length === 1 || fs.existsSync(path.join(base, advExt))) {
		return base;
	}

	for (let i = 1; i < sourceDirs.length; i++) {
		if (baseExt && ignore[i - 1].has(baseExt)) {
			continue;
		}

		const
			root = sourceDirs[i],
			file = path.join(name, advExt);

		let
			src = path.join(root, name);

		if (await fs.existsAsync(path.join(root, file))) {
			return src;
		}

		const
			components = `/**/${file}`,
			virtualComponents = !baseExt && `/**/${name}.index.js`;

		const files = await Promise.all([
			glob(path.join(root, components)),
			virtualComponents ? glob(path.join(root, virtualComponents)) : []
		]);

		src = files[0][0] || files[1][0];

		if (await fs.existsAsync(path.join(src, advExt))) {
			return src;
		}
	}

	return baseExt ? null : base;
}

/**
 * Returns an absolute path to an entry by the specified name
 * @param [name] - entry name (if empty, returns path to the entries folder)
 */
function entry(name = '') {
	return path.normalize(path.join(sourceDir, config.entriesDir, name ? `${name}.js` : ''));
}

module.exports = {
	depMap,
	sourceDir,
	sourceDirs,
	dependencies,
	rootDependencies,
	block,
	entry
};
