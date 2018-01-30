'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	fs = require('fs-extra-promise'),
	vinyl = require('vinyl-fs'),
	path = require('path');

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
 * Returns a list of imports from the specified entry file
 *
 * @param {string} dir - entry directory
 * @param {string} content - file content
 * @param {!Array} [arr]
 * @returns {!Promise<!Array<string>>}
 */
async function getEntryImports(dir, content, arr = []) {
	await $C(content.split(eol)).async.forEach(async (line) => {
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
 * @returns {!Promise<!{entries, dependencies, commons}>}
 */
async function getBuildConfig() {
	const entries = await $C(vinyl.src(path.join(entry(), '*.js'), {read: false})).reduce(
		(res, {path: src}) => {
			const
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
				const down = (entry, name, set = new Set()) => {
					set = new Set([name, ...set]);

					$C(entry.parents).reverse.forEach((name) => {
						set = down(entries[name], name, set);
					});

					return set;
				};

				dependenciesCache = $C(entries).map((entry, name) => down(entry, name));
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

						res[parent] = $C(dependencies()).reduce((set, deps, name) => {
							if (deps.has(parent)) {
								set.add(name);
							}

							return set;
						}, new Set());

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
