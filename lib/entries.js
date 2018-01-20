'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	path = require('path'),
	fs = require('fs-extra-promise'),
	glob = require('glob-promise');

const
	Block = require('./block'),
	{entry, entryDependencies, lib} = require('./resolve'),
	{blockName} = require('./validators');

/**
 * Returns the parent of the entry through parsing the specified entry source code
 *
 * @param {string} source
 * @returns {string}
 */
function getParent(source) {
	const parentSearch = /^import\s+'\.\/(.*?)';/m.exec(source);
	return parentSearch && parentSearch[1];
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
 * Returns a list of imports from the specified entry file
 *
 * @param {string} dir - entry directory
 * @param {string} content - file content
 * @param {!Array} [arr]
 * @returns {Promise<!Array<string>>}
 */
async function getEntryImports(dir, content, arr = []) {
	const
		hasImport = /^import\s+(['"])(.*?)\1;?/,
		entriesDir = new RegExp(`^(?:${$C(entryDependencies).map(Sugar.RegExp.escape).join('|')})(?:[/\\\\]|$)`),
		insideEntry = /^\.\//;

	await $C(content.split(/\r?\n|\r/)).async.forEach(async (line) => {
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

			if (!await fs.existsAsync(f)) {
				f = path.join(d, url, 'index.js');
			}

			await getEntryImports(path.dirname(f), await fs.readFileAsync(f, 'utf-8'), arr);

		} else {
			arr.push(nodeModule ? url : path.join(dir, url));
		}
	});

	return arr;
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

	await $C(await getEntryImports(dir, content)).async.forEach(async (el) => {
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
 * @returns {Promise<{entries, dependencies, commons}>}
 */
async function getBuildConfig() {
	const entries = await $C(await glob(path.join(entry(), '*.js'))).parallel().reduce(
		async (res, src) => {
			const
				name = path.basename(src, '.js'),
				source = await fs.readFileAsync(src, 'utf-8');

			res[name] = {
				source,
				path: src,

				get parent() {
					return getParent(source);
				},

				getRuntimeDependencies({cache} = {}) {
					return getEntryRuntimeDependencies(path.dirname(src), source, {cache});
				}
			};

			return res;
		},

		{}
	);

	function factory(entries) {
		function filter(cb) {
			return factory($C(entries).filter(cb).map());
		}

		let dependenciesCache;
		function dependencies() {
			if (!dependenciesCache) {
				dependenciesCache = $C(entries).map((entry, name) => {
					const deps = [];

					while (name) {
						deps.unshift(name);
						name = entry.parent;
						entry = entries[name];
					}

					return deps;
				});
			}

			return dependenciesCache;
		}

		let commonsCache;
		function commons() {
			if (!commonsCache) {
				commonsCache = $C(entries).reduce(
					(res, {parent}) => {
						if (!parent || res[parent]) {
							return res;
						}

						res[parent] = $C(dependencies()).reduce((dependents, deps, name) => {
							if (deps.indexOf(parent) !== -1) {
								dependents.push(name);
							}

							return dependents;
						}, []);

						return res;
					},

					{}
				);
			}

			return commonsCache;
		}

		return {
			entries,
			filter,

			get dependencies() {
				return dependencies();
			},

			get commons() {
				return commons();
			}
		};
	}

	return factory(entries);
}

module.exports = {
	getBuildConfig
};
