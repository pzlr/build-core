'use strict';

const joi = require('joi');

const blockNameRegExp = /^[bigp]-[a-z0-9][a-z0-9-_]*$/;

function blockName(name) {
	return blockNameRegExp.test(name);
}

const declarationSchema = joi.object().keys({
	name: joi
		.string()
		.description('Block name')
		.regex(blockNameRegExp, 'block name')
		.required(),

	parent: joi
		.string()
		.description('Name of the parent block')
		.regex(blockNameRegExp, 'block name')
		.allow(null)
		.default(null),

	dependencies: joi
		.array()
		.description('Dependencies of the block')
		.default(() => [], 'Empty list')
		.items(joi.string().regex(blockNameRegExp, 'block name'))
});

function declaration(obj) {
	const {error, value} = joi.validate(obj, declarationSchema);
	if (error) {
		throw new TypeError(`Invalid declaration object: ${error.message}`);
	}

	return value;
}

exports.blockName = blockName;
exports.declaration = declaration;
