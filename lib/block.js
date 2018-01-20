'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	path = require('path'),
	isPathInside = require('is-path-inside'),
	fs = require('fs-extra-promise'),
	glob = require('glob-promise');

const
	resolve = require('./resolve'),
	Declaration = require('./declaration'),
	{blockTypeList} = /** @type {{blockTypeList: Array<string>}} */ require('./validators');

const
	filesCache = Object.create(null),
	blockCache = Object.create(null);

async function validateCache(path, cache) {
	const
		{mtime} = await fs.statAsync(path);

	return {
		mtime,
		fromCache: Boolean(cache[path] && Sugar.Date.is(mtime, cache[path].mtime))
	};
}

async function getFile(path) {
	const
		cache = await validateCache(path, filesCache);

	if (!cache.fromCache) {
		filesCache[path] = {
			mtime: cache.mtime,
			content: await fs.readFileAsync(path, 'utf-8')
		};
	}

	return filesCache[path].content;
}

class Block {
	/**
	 * Returns a block manifest file by the specified name
	 *
	 * @param {string} name
	 * @returns {!Promise<Block>}
	 */
	static async get(name) {
		const
			blockPath = path.join(await resolve.block(name), 'index.js'),
			cache = await validateCache(blockPath, blockCache);

		if (cache.fromCache) {
			return new this(blockPath, blockCache[blockPath].decl);
		}

		async function getDecl(url) {
			return new Declaration(await getFile(path.join(await url, 'index.js')));
		}

		const
			decl = await getDecl(resolve.block(name));

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
		if (!names) {
			const
				b = `@(${blockTypeList.join('|')})-*`,
				components = `/**/${b}/index.js`,
				virtualComponents = `/**/${b}.index.js`;

			names = await $C([await resolve.block(), ...resolve.dependencies]).parallel().reduce(async (list, root) => {
				const files = await Promise.all([
					glob(path.join(root, components)),
					glob(path.join(root, virtualComponents))
				]);

				return list.concat(
					$C([].concat(...files)).map((nm) => path.dirname(path.relative(root, nm)))
				);
			}, []);

			names = [...new Set(names)];
		}

		const blocks = await $C(names).parallel().reduce(
			async (res, name, i) => {
				const
					block = await this.get(name);

				if (block) {
					res[i] = block;
				}

				return res;
			},

			[]
		);

		return $C(blocks).reduce((map, decl) => map.set(decl.name, decl), new Map());
	}

	/**
	 * Returns a path to the logic file
	 * @returns {!Promise<string>}
	 */
	get logic() {
		return resolve.block(`${this.name}/${this.name}.logic`);
	}

	/**
	 * Returns a path to the template file
	 * @returns {!Promise<string>}
	 */
	get tpl() {
		return resolve.block(`${this.name}/${this.name}.ss`);
	}

	/**
	 * Returns paths to the style files
	 * @returns {!Promise<Array<string>>}
	 */
	get styles() {
		return (async () => {
			const
				root = await resolve.block(),
				style = await resolve.block(`${this.name}/${this.name}.styl`),
				styles = [style];

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
	 * @returns {!Promise<Block>}
	 */
	async getParent() {
		return this.parent ? this.constructor.get(this.parent) : null;
	}

	/**
	 * Returns manifests of all block dependencies
	 *
	 * @param {boolean=} [onlyOwn] - if true parent dependencies also included
	 * @returns {!Promise<!Map<string, !Block>>}
	 */
	async getDependencies(onlyOwn = false) {
		const
			names = this.dependencies.slice();

		if (!onlyOwn) {
			let
				parent = await this.getParent();

			while (parent) {
				Sugar.Array.insert(names, parent.dependencies, 0);
				parent = await parent.getParent();
			}
		}

		return this.constructor.getAll(Sugar.Array.unique(names));
	}

	/**
	 * Returns manifests of all block libraries
	 *
	 * @param {boolean=} [onlyOwn] - if true parent libraries also included
	 * @returns {!Promise<!Set<string>>}
	 */
	async getLibs(onlyOwn = false) {
		const
			libs = this.libs.slice();

		if (!onlyOwn) {
			let
				parent = await this.getParent();

			while (parent) {
				Sugar.Array.insert(libs, parent.libs, 0);
				parent = await parent.getParent();
			}
		}

		return new Set(libs);
	}
}

module.exports = Block;
