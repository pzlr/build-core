'use strict';

const
	Sugar = require('sugar'),
	validators = require('./validators');

const blockTypes = {
	i: 'interface',
	b: 'block',
	p: 'page',
	g: 'global',
	v: 'virtual'
};

class Declaration {
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

		const
			resName = `res${Date.now().toString(36)}${Sugar.Number.random(1000000000, 10000000000).toString(36)}`,
			code = `
const global = null;
let ${resName} = null;

function package(name) {
	${resName} = {name};

	const dependencies = (...names) => {
		${resName}.dependencies = names;
		return {libs};
	};

	const libs = (...libs) => {
		${resName}.libs = libs;
		return {dependencies};
	};

	const ext = (name) => {
		${resName}.parent = name; 
		return {dependencies, libs};
	};

	return {extends: ext, dependencies, libs};
}

${declaration};

return ${resName};
`;

		return new this(Function(code)());
	}

	/**
	 * @param {(string|!Object)} declaration
	 * @returns {!Declaration}
	 */
	constructor(declaration) {
		if (typeof declaration === 'string') {
			return this.constructor.parse(declaration);
		}

		const {name, parent, dependencies, libs} = validators.declaration(declaration);

		this.name = name;
		this.type = blockTypes[name.charAt(0)];
		this.parent = parent;
		this.dependencies = dependencies;
		this.libs = libs;
	}

	/** @returns {!Object} */
	toJSON() {
		return Sugar.Object.select(this, ['name', 'parent', 'dependencies', 'libs']);
	}

	/** @returns {string} */
	toString() {
		let res = `package('${this.name}')`;

		if (this.parent) {
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
