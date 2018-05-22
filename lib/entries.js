'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	fs = require('fs-extra-promise'),
	vinyl = require('vinyl-fs'),
	path = require('upath');

const
	Block = require('./block'),
	{entry, entryDependencies, lib, isNodeModule} = require('./resolve'),
	{blockName} = require('./validators');

const
	hasImport = /^import\s+(['"])(.*?)\1;?/,
	entriesDir = new RegExp(`^(?:${$C(entryDependencies).map(Sugar.RegExp.escape).join('|')})(?:[/\\\\]|$)`),
	insideEntry = /^\.\//,
	eol = /\r?\n|\r/;

/**
 * Returns a name for a common chunk by the specified id
 * @param {(string|number)} id
 */
function getCommonName(id) {
	return `common_${id}`;
}

/**
 * Returns a graph with dependencies and union entry points from the specified entries
 *
 * @param entries
 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
 * @returns {!Promise<{dependencies: Object<string, !Set<string>>, entry: Object<string, !Map<string, !Block>>}>}
 */
async function getUnionEntryPoints(entries, {cache} = {}) {
	const
		packs = Object.create(null),
		weights = Object.create(null);

	await $C(entries).parallel().forEach(async (el) => {
		const
			key = path.basename(el.path, '.js'),
			deps = packs[key] = await getEntryRuntimeDependencies(path.dirname(el.path), el.source, {cache});

		const walk = (block) => {
			const
				name = block.name || block;

			if (name in weights) {
				const
					w = weights[name];

				w.i++;
				if (w.isParent) {
					w.isParent = deps.parents.has(name);
				}

			} else {
				weights[name] = {
					i: 0,
					name,
					isParent: deps.parents.has(name)
				};
			}
		};

		$C(deps.runtime).forEach(walk);
		$C(deps.libs).forEach(walk);
	});

	// Find common modules (weight > 1)

	const commonPacks = $C(weights).to([]).reduce((arr, el, key) => {
		if (el.i > 1) {
			const pos = $C(entries).length() - el.i - 1;
			arr[pos] = (arr[pos] || new Map()).set(key, el);
		}

		return arr;
	});

	// Remove empty modules
	$C(commonPacks).remove((el) => !el);

	const getTopParents = (entry, set = new Set(), first = true) => {
		const
			obj = entries[entry];

		if (!obj) {
			set.add(entry);
			return set;
		}

		const
			{parents} = obj;

		if (parents.size) {
			$C(parents).forEach((entry) => getTopParents(entry, set, false));

		} else if (!first) {
			set.add(entry);
		}

		return set;
	};

	const dependencies = await $C(packs)
		.parallel()
		.to({})
		.reduce(async (map, deps, name) => {
			const
				depSet = new Set();

			$C(deps.runtime).forEach((el, block) => {
				const
					pos = $C(commonPacks).one.search((map) => map.has(block));

				if (pos !== null) {
					depSet.add(pos);
					deps.runtime.delete(block);
				}
			});

			const depList = [...depSet].sort((a, b) => a - b).map((i) => getCommonName(i));
			map[name] = new Set([...getTopParents(name), ...depList]);
			return map;
		});

	const entry = $C(commonPacks).to({}).reduce((map, deps, i) => {
		map[getCommonName(i)] = deps;
		return map;
	});

	$C(packs).forEach((deps, name) => {
		entry[name] = $C(deps.runtime).to(new Map()).reduce((map, block, name) => map.set(name, {
			name,
			isParent: deps.parents.has(name)
		}));
	});

	return {dependencies, entry};
}

/**
 * Returns a list of imports from the specified entry file
 *
 * @param {string} dir - entry directory
 * @param {string} content - file content
 * @param {!Array} [arr]
 * @returns {!Array<string>}
 */
function getEntryImports(dir, content, arr = []) {
	$C(content.split(eol)).forEach((line) => {
		if (!hasImport.test(line)) {
			return;
		}

		const
			url = RegExp.$2,
			nodeModule = isNodeModule(url);

		if (nodeModule && entriesDir.test(url) || insideEntry.test(url)) {
			const
				d = nodeModule ? lib : dir;

			let
				f = path.join(d, `${url}.js`);

			if (!fs.existsSync(f)) {
				f = path.join(d, url, 'index.js');
			}

			getEntryImports(path.dirname(f), fs.readFileSync(f, 'utf-8'), arr);

		} else {
			arr.push(nodeModule ? url : path.join(dir, url));
		}
	});

	return arr;
}

/**
 * Returns a set of parent entries for the specified entry
 *
 * @param {string} content - file content
 * @returns {!Set<string>}
 */
function getEntryParents(content) {
	const
		parents = new Set(),
		clrfx = /\.\//;

	$C(content.split(eol)).forEach((line) => {
		if (!hasImport.test(line)) {
			return;
		}

		const
			url = RegExp.$2;

		if (isNodeModule(url) && entriesDir.test(url) || insideEntry.test(url)) {
			parents.add(url.replace(clrfx, ''));
		}
	});

	return parents;
}

/**
 * Returns a graph with dependencies for an entry file
 *
 * @param {string} dir - entry directory
 * @param {string} content - file content
 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
 * @returns {!Promise<{runtime: !Map<string, !Block>, parents: !Map<string, !Block>, libs: !Set<string>}>}
 */
async function getEntryRuntimeDependencies(dir, content, {cache} = {}) {
	const deps = {
		runtime: new Map(),
		parents: new Map(),
		libs: new Set()
	};

	const
		runtime = new Set();

	await $C(getEntryImports(dir, content)).async.forEach(async (el) => {
		const
			name = path.basename(el, path.extname(el)),
			block = cache ? cache.get(name) : await Block.get(name);

		if (!blockName(name) || !block) {
			deps.runtime.set(el, el);
			return;
		}

		const
			blockDeps = await block.getRuntimeDependencies({cache});

		$C(blockDeps.runtime).forEach((obj, block) => {
			if (!blockDeps.parents.has(block)) {
				runtime.add(block);
			}
		});

		deps.runtime = new Map([...deps.runtime.entries(), ...blockDeps.runtime.entries()]);
		deps.parents = new Map(
			$C([...deps.parents.entries(), ...blockDeps.parents.entries()])
				.filter(([block]) => !runtime.has(block))
				.map()
		);

		deps.libs = new Set([...deps.libs, ...blockDeps.libs]);
	});

	return deps;
}

/**
 * Returns build config for entries
 * @returns {!Promise<!{entries, dependencies, commons}>}
 */
async function getBuildConfig() {
	const entries = await $C(vinyl.src(path.join(entry(), '*.js'), {read: false}))
		.async
		.to({})
		.reduce((res, el) => {
			const
				src = el.path,
				name = path.basename(src, '.js');

			let source;
			function getSource() {
				source = source || fs.readFileSync(src, 'utf-8');
				return source;
			}

			res[name] = {
				path: src,

				get source() {
					return getSource();
				},

				get parent() {
					return $C(getEntryParents(getSource())).one.get();
				},

				get parents() {
					return getEntryParents(getSource());
				},

				getRuntimeDependencies({cache} = {}) {
					return getEntryRuntimeDependencies(path.dirname(src), getSource(), {cache});
				}
			};

			return res;
		});

	function factory(entries) {
		function filter(cb) {
			return factory($C(entries).filter(cb).map());
		}

		return {
			entries,
			filter,
			getUnionEntryPoints({cache} = {}) {
				return getUnionEntryPoints(entries, {cache});
			}
		};
	}

	return factory(entries);
}

module.exports = {
	getCommonName,
	getBuildConfig
};
