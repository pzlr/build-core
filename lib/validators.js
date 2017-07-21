'use strict';


const
	joi = require('joi');

const blockTypes = {
	i: 'interface',
	b: 'block',
	p: 'page',
	g: 'global',
	v: 'virtual'
};

const
	blockTypeList = Object.keys(blockTypes),
	baseBlockName = `[${blockTypeList.join('')}]-[a-z0-9][a-z0-9-_]*`,
	blockNameRegExp = new RegExp(`^${baseBlockName}$`),
	blockDepRegExp = new RegExp(`^(@|[a-z][a-z0-9-_]*\\/)?${baseBlockName}$`);

/**
 * Returns true if the specified name is valid for a block
 *
 * @param {string} name
 * @returns {boolean}
 */
function blockName(name) {
	return blockNameRegExp.test(name);
}

const declarationSchema = joi.object().keys({
	name: joi
		.string()
		.description('Block name')
		.regex(blockNameRegExp, 'block name')
		.required(),

	mixin: joi
		.boolean()
		.description('Name of the parent block')
		.allow(null)
		.default(false),

	parent: joi
		.string()
		.description('Name of the parent block')
		.regex(blockDepRegExp, 'block name')
		.allow(null)
		.default(null),

	dependencies: joi
		.array()
		.description('Dependencies of the block')
		.default(() => [], 'Empty list')
		.items(joi.string().regex(blockDepRegExp, 'block name')),

	libs: joi
		.array()
		.description('Additional libraries of the block')
		.default(() => [], 'Empty list')
		.items(joi.string())
});

/**
 * Validates the specified package declaration
 *
 * @template {T}
 * @param {T} obj
 * @returns {T}
 */
function declaration(obj) {
	const
		{error, value} = joi.validate(obj, declarationSchema);

	if (error) {
		throw new TypeError(`Invalid declaration object: ${error.message}`);
	}

	return value;
}

exports.blockName = blockName;
exports.declaration = declaration;
exports.blockTypes = blockTypes;
exports.blockTypeList = blockTypeList;
exports.blockNameRegExp = blockNameRegExp;
exports.blockDepRegExp = blockDepRegExp;
