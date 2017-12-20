'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	path = require('path'),
	fs = require('fs-extra-promise'),
	glob = require('glob-promise');

const
	resolve = require('./resolve'),
	Declaration = require('./declaration'),
	{blockTypeList} = require('./validators');

const
	filesCache = Object.create(null);

async function getFile(path) {
	const
		{mtime} = await fs.statAsync(path);

	if (!filesCache[path] || !Sugar.Date.is(mtime, filesCache[path].mtime)) {
		filesCache[path] = {
			mtime,
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
		const indexContent = await getFile(
			path.join(await resolve.block(name), 'index.js')
		);

		return new this(new Declaration(indexContent));
	}

	/**
	 * Returns block manifests file by the specified names
	 *
	 * @param {Array<string>=} [names]
	 * @returns {!Promise<!Array<!Block>>}
	 */
	static async getAll(names) {
		if (!names) {
			const
				root = await resolve.block(),
				b = `@(${blockTypeList.join('|')})-*`;

			const
				components = `/**/${b}/index.js`,
				virtualComponents = `/**/${b}.index.js`;

			const files = await Promise.all([
				glob(path.join(root, components)),
				glob(path.join(root, virtualComponents))
			]);

			names = $C([].concat(...files)).map((nm) => path.dirname(path.relative(root, nm)));
		}

		return $C(names).parallel().reduce(
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
	 * @param declaration - block declaration
	 */
	constructor(declaration) {
		this.declaration = declaration;
		Object.freeze(this);
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
	 * @returns {!Promise<!Array<!Block>>}
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
	 * @returns {!Promise<!Array<string>>}
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

		return libs;
	}
}

module.exports = Block;
