'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar');

const
	fs = require('fs-extra-promise'),
	path = require('upath');

const
	glob = require('glob-promise'),
	vinyl = require('vinyl-fs'),
	hasha = require('hasha'),
	isPathInside = require('is-path-inside');

const
	resolve = require('./resolve'),
	Declaration = require('./declaration');

const
	{dependencies} = require('./config'),
	{blockTypeList} = /** @type {{blockTypeList: Array<string>}} */ require('./validators'),
	{createSerializableMap, createSerializableSet, jsonReviver} = require('./helpers');

const
	filesCache = Object.create(null),
	blockCache = Object.create(null);

/**
 * Validates a file by the specified path and return meta information
 *
 * @param {string} path
 * @param {!Object} cache - cache object
 * @returns {{mtime: !Object, fromCache: boolean}}
 */
function validateCache(path, cache) {
	const
		{mtime} = fs.statSync(path);

	return {
		mtime,
		fromCache: Boolean(cache[path] && Sugar.Date.is(mtime, cache[path].mtime))
	};
}

/**
 * Returns a file content by the specified path
 *
 * @param {string} path
 * @returns {string}
 */
function getFile(path) {
	const
		cache = validateCache(path, filesCache);

	if (!cache.fromCache) {
		filesCache[path] = {
			mtime: cache.mtime,
			content: fs.readFileSync(path, 'utf-8')
		};
	}

	return filesCache[path].content;
}

/**
 * Throws a new blockNotFound error by the specified name
 * @param {string} name
 */
function blockNotFound(name) {
	throw new Error(`Block "${name}" is not defined`);
}

class Block {
	/**
	 * Returns a block manifest file by the specified parameter
	 *
	 * @param {string} folder - block folder name
	 * @param {string} file - manifest file
	 * @returns {!Promise<Block>}
	 */
	static async get(folder, file = 'index.js') {
		const
			blockPath = await resolve.block(path.join(folder, file)),
			cache = validateCache(blockPath, blockCache);

		if (cache.fromCache) {
			return new this(blockPath, blockCache[blockPath].decl);
		}

		async function getDecl(url) {
			return new Declaration(getFile(path.join(await url, file)));
		}

		const
			decl = await getDecl(resolve.block(folder));

		if (decl.mixin) {
			let
				skip = 1,
				parent;

			while ((parent = await resolve.block(decl.name, skip))) {
				const
					parentDecl = await getDecl(parent.path);

				if (!decl.parent && parentDecl.parent) {
					decl.parent = parentDecl.parent;
				}

				decl.dependencies = [...new Set(decl.dependencies.concat(parentDecl.dependencies))];
				decl.libs = [...new Set(decl.libs.concat(parentDecl.libs))];

				if (parentDecl.mixin) {
					skip = parent.from;

				} else {
					break;
				}
			}
		}

		blockCache[blockPath] = {
			mtime: cache.mtime,
			decl
		};

		return new this(blockPath, decl);
	}

	/**
	 * Returns block manifests file by the specified names
	 *
	 * @param {Array<string>=} [names]
	 * @returns {!Promise<!Map<string, !Block>>}
	 */
	static async getAll(names) {
		const
			projectCWD = await resolve.cwd,
			projectHash = hasha(path.join(resolve.sourceDir, '/**/*'));

		const
			cachedBlockMap = new Map(),
			sources = [projectCWD, ...dependencies];

		const blockProto = {
			async getParent() {
				return this.resolvedParent;
			},

			async getDependencies({onlyOwn} = {}) {
				if (onlyOwn) {
					return this.resolvedDependencies;
				}

				return this.resolvedOwnDependencies;
			},

			async getLibs({onlyOwn} = {}) {
				if (onlyOwn) {
					return this.resolvedOwnLibs;
				}

				return this.resolvedLibs;
			},

			async getRuntimeDependencies() {
				return this.runtimeDependencies;
			}
		};

		const normalizedJSONReviver = (key, val) => {
			val = jsonReviver(key, val);

			if (Sugar.Object.isString(val) && path.extname(val) !== '') {
				return path.join(projectCWD, val);
			}

			return val;
		};

		for (let i = sources.length; i--;) {
			try {
				const
					dep = Sugar.Object.isString(sources[i]) ? sources[i] : sources[i],
					file = require.resolve(path.join(dep, 'graph-lock.json'));

				if (!fs.existsSync(file)) {
					break;
				}

				const
					fromCache = fs.readJSONSync(file, {reviver: normalizedJSONReviver});

				if (i === 0 && fromCache.hash !== projectHash) {
					break;
				}

				$C.extend(false, cachedBlockMap, fromCache.data);
				sources[i] = null;

			} catch {
				// We can ignore the deepest layer, i. e. @v4fire/core
				if (i === sources.length - 1) {
					sources[i] = null;
					continue;
				}

				break;
			}
		}

		if (sources.every((el) => el === null)) {
			return $C(cachedBlockMap).to(createSerializableMap()).reduce((map, decl, key) => {
				Object.setPrototypeOf(decl, blockProto);
				map.set(key, decl);
				return map;
			});
		}

		if (!names) {
			const
				b = `@(${blockTypeList.join('|')})-*`,
				components = `/**/${b}/index.js`,
				virtualComponents = `/**/${b}.index.js`;

			let
				dests = [await resolve.block(), ...resolve.dependencies];

			for (let i = 0; i < sources.length; i++) {
				if (sources[i] === null) {
					dests[i] = null;
				}
			}

			dests = dests.filter((el) => el !== null);

			names = await $C(dests)
				.async
				.to(new Map())
				.reduce(async (map, root) => {
					const src = [
						path.join(root, components),
						path.join(root, virtualComponents)
					];

					if (!map.has(src)) {
						map.set(
							src,

							await $C(vinyl.src(src, {read: false}))
								.async
								.to([])
								.map((file) => {
									file.base = root;
									return [path.dirname(file.relative), file.basename];
								})
						);
					}

					return map;
				});
		}

		const
			set = Object.create(null);

		const blocks = await $C(names)
			.parallel()
			.to([])
			.reduce(async (res, el) => {
				const
					i = res.push([]) - 1;

				await $C(el || []).async.forEach(async ([folder, name], j) => {
					if (set[folder] && set[folder] === name) {
						return;
					}

					set[folder] = name;

					const
						block = await this.get(folder, name);

					if (block) {
						res[i][j] = block;
					}
				});

				return res;
			});

		const blockMap = await $C(Sugar.Array.flatten(blocks)).to(new Map()).reduce((map, decl) => {
			if (!map.has(decl.name)) {
				return map.set(decl.name, decl);
			}

			return map;
		});

		const
			mixedBlockMap = $C.extend({traits: true}, new Map(), blockMap, cachedBlockMap);

		const normalizedBlockMap = await $C(mixedBlockMap).async.to(createSerializableMap()).reduce(async (map, decl, key) => {
			if (!blockMap.has(key)) {
				Object.setPrototypeOf(decl, blockProto);
				map.set(key, decl);

			} else {
				map.set(key, {
					...decl,

					name: decl.name,

					parent: decl.parent,
					resolvedParent: await decl.getParent({cache: mixedBlockMap}),

					dependencies: decl.dependencies,
					resolvedDependencies: await decl.getDependencies({cache: mixedBlockMap}),
					resolvedOwnDependencies: await decl.getDependencies({cache: mixedBlockMap}),

					libs: decl.libs,
					resolvedLibs: await decl.getLibs({cache: mixedBlockMap}),
					resolvedOwnLibs: await decl.getLibs({onlyOwn: true, cache: mixedBlockMap}),
					runtimeDependencies: await decl.getRuntimeDependencies({cache: mixedBlockMap}),

					type: decl.type,
					mixin: decl.mixin,

					index: await decl.index,
					logic: await decl.logic,
					styles: await decl.styles,
					tpl: await decl.tpl,
					etpl: await decl.etpl,

					__proto__: blockProto
				});
			}

			return map;
		});

		const blockMapToSave = $C(blockMap).to(createSerializableMap()).reduce((map, decl, key) => {
			if (blockMap.has(key)) {
				map.set(key, normalizedBlockMap.get(key));
			}

			return map;
		});

		const cacheData = {
			hash: projectHash,
			data: blockMapToSave
		};

		const jsonReplacer = (key, val) => {
			if (Sugar.Object.isString(val) && path.extname(val) !== '' && path.isAbsolute(val)) {
				return path.relative(projectCWD, val);
			}

			return val;
		};

		fs.writeFileSync(path.join(projectCWD, 'graph-lock.json'), JSON.stringify(cacheData, jsonReplacer, 2));

		return normalizedBlockMap;
	}

	/**
	 * Returns a path to the logic file
	 * @returns {!Promise<?string>}
	 */
	get logic() {
		return resolve.block(`${this.name}/${this.name}.logic`);
	}

	/**
	 * Returns a path to the template file
	 * @returns {!Promise<?string>}
	 */
	get tpl() {
		return resolve.block(`${this.name}/${this.name}.ss`);
	}

	/**
	 * Returns a path to the ess template file
	 * @returns {!Promise<?string>}
	 */
	get etpl() {
		return resolve.block(`${this.name}/${this.name}.ess`);
	}

	/**
	 * Returns paths to the style files
	 * @returns {!Promise<!Array<string>>}
	 */
	get styles() {
		return (async () => {
			const
				root = await resolve.block(),
				style = await resolve.block(`${this.name}/${this.name}.styl`),
				styles = [].concat(style || []);

			if (this.mixin && !isPathInside(style, root)) {
				styles.push(...await glob(path.join(root, `/**/${this.name}/${this.name}_*.styl`)));
			}

			return styles;
		})();
	}

	/**
	 * Block name
	 * @returns {string}
	 */
	get name() {
		return this.declaration.name;
	}

	/**
	 * Block type
	 * @returns {string}
	 */
	get type() {
		return this.declaration.type;
	}

	/**
	 * Block parent
	 * @returns {?string}
	 */
	get parent() {
		return this.declaration.parent;
	}

	/**
	 * Block mixin status
	 * @returns {boolean}
	 */
	get mixin() {
		return this.declaration.mixin;
	}

	/**
	 * Block dependencies
	 * @returns {!Array<string>}
	 */
	get dependencies() {
		return this.declaration.dependencies;
	}

	/**
	 * Block libraries
	 * @returns {!Array<string>}
	 */
	get libs() {
		return this.declaration.libs;
	}

	/**
	 * @param index - block index src
	 * @param declaration - block declaration
	 */
	constructor(index, declaration) {
		this.index = index;
		this.declaration = declaration;
	}

	/**
	 * Returns the block parent manifest
	 *
	 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
	 * @returns {!Promise<Block>}
	 */
	async getParent({cache} = {}) {
		if (!this.parent) {
			return null;
		}

		const
			block = cache ? cache.get(this.parent) : await this.constructor.get(this.parent);

		if (!block) {
			blockNotFound(this.parent);
		}

		return block;
	}

	/**
	 * Returns manifests of all block dependencies
	 *
	 * @param {boolean=} [onlyOwn] - if true parent dependencies also included
	 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
	 * @returns {!Promise<!Map<string, !Block>>}
	 */
	async getDependencies({onlyOwn, cache} = {}) {
		let
			names = this.dependencies.slice();

		if (!onlyOwn) {
			let
				parent = await this.getParent({cache});

			while (parent) {
				names = [...parent.dependencies, ...names];
				parent = await parent.getParent({cache});
			}
		}

		if (cache) {
			return $C(names).to(createSerializableMap()).reduce((map, name) => {
				const
					block = cache.get(name);

				if (!block) {
					blockNotFound(name);
				}

				return map.set(name, block);
			});
		}

		return this.constructor.getAll([...new Set(names)]);
	}

	/**
	 * Returns manifests of all block libraries
	 *
	 * @param {boolean=} [onlyOwn] - if true parent libraries also included
	 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
	 * @returns {!Promise<!Set<string>>}
	 */
	async getLibs({onlyOwn, cache} = {}) {
		let
			libs = this.libs.slice();

		if (!onlyOwn) {
			let
				parent = await this.getParent({cache});

			while (parent) {
				libs = [...parent.libs, ...libs];
				parent = await parent.getParent({cache});
			}
		}

		return createSerializableSet(libs);
	}

	/**
	 * Returns an object with block runtime dependencies
	 *
	 * @param {Map<string, !Block>=} [cache] - optional cache object with predefined blocks
	 * @returns {!Promise<{runtime: !Map<string, !Block>, parents: !Map<string, !Block>, libs: !Set<string>}>}
	 */
	async getRuntimeDependencies({cache} = {}) {
		let
			runtime = createSerializableMap(),
			parents = createSerializableMap();

		const get = async (name, isParent) => {
			const
				block = name === this.name ? this : cache ? cache.get(name) : await this.constructor.get(name);

			if (!block) {
				blockNotFound(name);
			}

			runtime = createSerializableMap([[name, block], ...runtime.entries()]);
			if (!isParent && parents.has(name)) {
				parents.delete(name);
			}

			await $C(await block.getDependencies({onlyOwn: true, cache})).async.forEach(async (block) => {
				runtime = createSerializableMap([[block.name, block], ...runtime.entries()]);
				await get(block.name, false, runtime, parents);
			});

			const
				parentName = block.parent;

			if (parentName) {
				const
					parent = await block.getParent({cache});

				if (!runtime.has(parentName)) {
					parents = createSerializableMap([[parentName, parent], ...parents.entries()]);
					runtime = createSerializableMap([[parentName, parent], ...runtime.entries()]);
				}

				await get(parentName, true, runtime, parents);
			}
		};

		const [libs] = await Promise.all([
			this.getLibs({cache}),
			get(this.name)
		]);

		return {runtime, parents, libs};
	}
}

module.exports = Block;
