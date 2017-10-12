'use strict';

const
	$C = require('collection.js'),
	Sugar = require('sugar'),
	path = require('path'),
	fs = require('fs-extra-promise');

const
	resolve = require('./resolve'),
	Declaration = require('./declaration');

const filesCache = {};
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
	static async get(name) {
		const indexContent = await getFile(
			path.join(resolve.block(name), 'index.js')
		);

		return new this(new Declaration(indexContent));
	}

	static async getAll(names) {
		if (!names) {
			names = await fs.readdirAsync(resolve.block());
		}

		return $C(names)
			.async
			.reduce(
				(res, name, i, data, o) => {
					o.wait(this.get(name).then((block) => {
						res[i] = block;
					}));

					return res;
				},

				[]
			);
	}

	get name() {
		return this.declaration.name;
	}

	get type() {
		return this.declaration.type;
	}

	get parent() {
		return this.declaration.parent;
	}

	get mixin() {
		return this.declaration.mixin;
	}

	get dependencies() {
		return this.declaration.dependencies;
	}

	get libs() {
		return this.declaration.libs;
	}

	constructor(declaration) {
		this.declaration = declaration;
		Object.freeze(this);
	}

	async getParent() {
		return this.parent ?
			this.constructor.get(this.parent) :
			null;
	}

	async getDependencies(onlyOwn = false) {
		const names = Sugar.Array.clone(this.dependencies);

		if (!onlyOwn) {
			let parent = await this.getParent();

			while (parent) {
				Sugar.Array.insert(names, parent.dependencies, 0);
				parent = await parent.getParent();
			}
		}

		return this.constructor.getAll(Sugar.Array.unique(names));
	}

	async getLibs(onlyOwn = false) {
		const libs = Sugar.Array.clone(this.libs);

		if (!onlyOwn) {
			let parent = await this.getParent();

			while (parent) {
				Sugar.Array.insert(libs, parent.libs, 0);
				parent = await parent.getParent();
			}
		}

		return libs;
	}
}

module.exports = Block;
