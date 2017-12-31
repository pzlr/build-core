'use strict';

const
	$C = require('collection.js'),
	path = require('path'),
	fs = require('fs-extra-promise'),
	glob = require('glob-promise'),
	resolver = require('./resolve');

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
 * Returns build config for entries
 * @returns {{entries, dependencies, commons}}
 */
function getBuildConfig() {
	const entries = $C(glob.sync(path.join(resolver.entry(), '*.js'))).reduce(
		(res, filename) => {
			const
				name = path.basename(filename, '.js'),
				source = fs.readFileSync(filename, 'utf-8'),
				parent = getParent(source);

			res[name] = {
				path: filename,
				source,
				parent
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
