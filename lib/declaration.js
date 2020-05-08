'use strict';

const
	Sugar = require('sugar'),
	validators = require('./validators'),
	declarationsCache = Object.create(null);

class Declaration {
	/**
	 * Map of block types
	 * @returns {!Object<string>}
	 */
	static get blockTypes() {
		return validators.blockTypes;
	}

	/**
	 * List of block types
	 * @returns {!Array<string>}
	 */
	static get blockTypeList() {
		return validators.blockTypeList;
	}

	/**
	 * Parses the specified string declaration of a package and returns a new Declaration object
	 *
	 * @param {string} declaration
	 * @param {boolean=} [test]
	 * @returns {Declaration}
	 */
	static parse(declaration, test = false) {
		if (test && !/package\(/.test(declaration)) {
			return null;
		}

		if (declarationsCache[declaration]) {
			return new this(declarationsCache[declaration]());
		}

		const
			resName = `res${Date.now().toString(36)}${Sugar.Number.random(1000000000, 10000000000).toString(36)}`,
			code = `
const global = null;
let ${resName} = null;

function package(name) {
	${resName} = {name};

	const flatMap = (arr) => arr
		.flatMap((el) => el)
		.filter((el) => el != null)
		.flatMap((el) => el.split(/\\s*,\\s*/))
		.map((el) => el.trim());

	const dependencies = (...names) => {
		${resName}.dependencies = flatMap(names);
		return {libs};
	};

	const libs = (...libs) => {
		${resName}.libs = flatMap(libs);
		return {dependencies};
	};

	const ext = (name) => {
		${resName}.parent = name == null ? null : name;
		return {dependencies, libs};
	};

	const mixin = () => {
		${resName}.mixin = true;
		return {dependencies, libs};
	};

	return {extends: ext, mixin, dependencies, libs};
}

${declaration};

return ${resName};
`;

		declarationsCache[declaration] = Function('require', code).bind(null, require);
		return new this(declarationsCache[declaration]());
	}

	/**
	 * @param {(string|!Object)} declaration
	 * @returns {!Declaration}
	 */
	constructor(declaration) {
		if (typeof declaration === 'string') {
			return this.constructor.parse(declaration);
		}

		const {
			name,
			parent,
			mixin,
			dependencies,
			libs
		} = validators.declaration(declaration);

		this.name = name;
		this.type = validators.blockTypes[name[0]];
		this.parent = parent;
		this.mixin = mixin;
		this.dependencies = dependencies;
		this.libs = libs;
	}

	/** @returns {!Object} */
	toJSON() {
		return Sugar.Object.select(this, ['name', this.mixin ? 'mixin' : 'parent', 'dependencies', 'libs']);
	}

	/** @returns {string} */
	toString() {
		let res = `package('${this.name}')`;

		if (this.mixin) {
			res += `\n\t.mixin()`;

		} else if (this.parent) {
			res += `\n\t.extends('${this.parent}')`;
		}

		if (this.dependencies.length) {
			res += `\n\t.dependencies('${this.dependencies.join(`', '`)}')`;
		}

		if (this.libs.length) {
			res += `\n\t.libs('${this.libs.join(`', '`)}')`;
		}

		return `${res};`;
	}
}

module.exports = Declaration;
