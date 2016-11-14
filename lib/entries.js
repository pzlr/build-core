'use strict';

const
	fs = require('fs-extra');

function getParent(source) {
	const parentSearch = /^import\s+'\.\/(.*?)';/m.exec(source);

	return parentSearch && parentSearch[1];
}

/**
 *
 * @param {Array<{source: string, path: string}>} entries
 * @returns
 */
function buildGraph(entries) {
	const graph = {};


}
