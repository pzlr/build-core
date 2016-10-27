'use strict';

const Sugar = require('sugar');

const validators = require('./validators');

class Declaration {
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
	
	const
		dependencies = (...names) => {${resName}.dependencies = names;},
		ext = (name) => {${resName}.parent = name; return {dependencies};};

	return {extends: ext, dependencies};
}

${declaration};

return ${resName};
`;

		return new this(Function(code)());
	}

	constructor(declaration) {
		if (typeof declaration === 'string') {
			return this.constructor.parse(declaration);
		}

		const {name, parent, dependencies} = validators.declaration(declaration);

		this.name = name;
		this.parent = parent;
		this.dependencies = dependencies;
	}

	toJSON() {
		return Sugar.Object.select(this, ['name', 'parent', 'dependencies']);
	}

	toString() {
		let res = `package('${this.name}')`;

		if (this.parent) {
			res += `\n	.extends('${this.parent}')`;
		}

		if (this.dependencies.length) {
			res += `\n	.dependencies('${this.dependencies.join(`', '`)}')`;
		}

		return `${res};`;
	}
}

module.exports = Declaration;
