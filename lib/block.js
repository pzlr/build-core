const
	path = require('path'),
	fs = require('fs-extra-promise'),
	resolve = require('./resolve'),
	Declaration = require('./declaration'),
	Sugar = require('sugar');

const filesCache = {};
async function getFile(path) {
	const {mtime} = await fs.statAsync(path);

	if (!filesCache[path] || !Sugar.Date.is(mtime, filesCache[path].mtime)) {
		filesCache[path] = {
			mtime,
			content: await fs.readFileAsync(path, 'utf-8')
		};
	}

	return filesCache[path].file;
}

class Block {
	static async get(name) {
		const indexContent = await fs.readFileAsync(
			path.join(resolve.block(name), 'index.js'),
			'utf-8'
		);

		return new this(new Declaration(indexContent));
	}

	static async getList() {}

	constructor(declaration) {
		this.declaration = declaration;
		Object.freeze(this);
	}

	toString() {
		return this.declaration.toString();
	}
}

module.exports = Block;
