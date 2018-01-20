'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	path = require('path'),
	fs = require('fs-extra-promise'),
	glob = require('glob-promise');

const
	{entry, entryDependencies, lib} = require('./resolve');

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
 * Returns a list of dependencies from an entry file
 *
 * @param {string} dir - entry directory
 * @param {string} content - file content
 * @param {!Array} [arr]
 * @returns {!Array<string>}
 */
function getEntryDepList(dir, content, arr = []) {
	const
		hasImport = /^import\s+(['"])(.*?)\1;?/,
		entriesDir = new RegExp(`^(?:${$C(entryDependencies).map(Sugar.RegExp.escape).join('|')})(?:[/\\\\]|$)`),
		insideEntry = /^\.\//;

	$C(content.split(/\r?\n|\r/)).forEach((line) => {
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

			getEntryDepList(path.dirname(f), fs.readFileSync(f, 'utf-8'), arr);

		} else {
			arr.push(nodeModule ? url : path.join(dir, url));
		}
	});

	return arr;
}

/**
 * Returns build config for entries
 * @returns {{entries, dependencies, commons}}
 */
function getBuildConfig() {
	const entries = $C(glob.sync(path.join(entry(), '*.js'))).reduce(
		(res, src) => {
			const
				name = path.basename(src, '.js'),
				source = fs.readFileSync(src, 'utf-8'),
				parent = getParent(source);

			res[name] = {
				path: src,
				source,
				parent,
				dependencies() {
					return getEntryDepList(path.dirname(src), source);
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
