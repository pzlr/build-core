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
	isPathInside = require('is-path-inside');

const
	resolve = require('./resolve'),
	Declaration = require('./declaration');

const
	{blockTypeList} = /** @type {{blockTypeList: Array<string>}} */ require('./validators'),
	{createSerializableMap, createSerializableSet} = require('./helpers'),
	{calculateProjectGraphHash} = require('./graph-hash'),
	{readLockFile} = require('./lock-file');

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
	 * Object that affects the project hash
	 *
	 * @protected
	 * @type {Object}
	 */
	static objToHash = null;

	/**
	 * Sets an object that affects the project hash
	 * @param obj
	 */
	static setObjToHash(obj) {
		this.objToHash = obj;
	}

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
	 * @param {{lockPrefix: ?string}=} [opts]
	 * @returns {!Promise<!Map<string, !Block>>}
	 */
	static async getAll(names, opts = {}) {
		const projectCWD = resolve.cwd;

		console.log('Calculating a project graph hash');

		const projectHash = calculateProjectGraphHash({
			projectCWD,
			lockPrefix: opts.lockPrefix,
			sourceDirs: resolve.sourceDirs,
			entryDir: resolve.entry()
		});

		console.log(`The project graph hash has been calculated`);

		const componentsLockFile = path.join(
			projectCWD,
			[].concat(opts.lockPrefix || [], 'components-lock.json').join('.')
		);

		const lockFileData = readLockFile(componentsLockFile, {BlockPrototype: Block.prototype});

		if (lockFileData?.hash === projectHash) {
			console.log(`The project graph has been loaded from a cache`);
			return lockFileData.data;
		}

		console.log(`The project graph hasn't been loaded from a cache`);

		if (!names) {
			const
				b = `@(${blockTypeList.join('|')})-*`,
				components = `/**/${b}/index.js`,
				virtualComponents = `/**/${b}.index.js`;

			names = await $C([await resolve.block(), ...resolve.dependencies])
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

				await $C([].concat(el || [])).async.forEach(async ([folder, name], j) => {
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

		const normalizedBlockMap = await $C(blockMap)
			.parallel(3)
			.to(createSerializableMap())
			.reduce(async (map, decl, key) => {
				const [
					resolvedLibs,
					resolvedOwnLibs,

					index,
					logic,
					styles,
					tpl,
					etpl
				] = await Promise.all([
					decl.getLibs({cache: blockMap}),
					decl.getLibs({onlyOwn: true, cache: blockMap}),

					decl.index,
					decl.logic,
					decl.styles,
					decl.tpl,
					decl.etpl
				]);

				map.set(key, {
					...decl,

					name: decl.name,
					parent: decl.parent,
					dependencies: decl.dependencies,

					libs: decl.libs,
					resolvedLibs,
					resolvedOwnLibs,

					type: decl.type,
					mixin: decl.mixin,

					index,
					logic,
					styles,
					tpl,
					etpl,

					__proto__: Block.prototype
				});

				return map;
			});

		const cacheData = {
			hash: projectHash,
			data: normalizedBlockMap
		};

		const jsonReplacer = (key, val) => {
			if (Sugar.Object.isString(val) && path.extname(val) !== '' && path.isAbsolute(val)) {
				return path.relative(projectCWD, val);
			}

			if (Sugar.Object.isObject(val) && val.declaration != null) {
				return normalizedBlockMap.get(key);
			}

			return val;
		};

		fs.writeFileSync(componentsLockFile, JSON.stringify(cacheData, jsonReplacer, 2));

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
		if (onlyOwn) {
			if ('resolvedOwnLibs' in this) {
				return this.resolvedOwnLibs;
			}

		} else if ('resolvedLibs' in this) {
			return this.resolvedLibs;
		}

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
