'use strict';

const
	path = require('upath'),
	glob = require('glob-promise'),
	objectHash = require('node-object-hash'),
	hashFiles = require('hash-files');

const {blockTypeList} = require('./validators');

/**
 * Calculates the project graph hash and returns it
 *
 * @param {{cwd: string; sourceDirs: string[]; entryDir?: string; ignoreDirs?: string[]; lockPrefix?: string}=} [opts]
 * @returns {string}
 */
function calculateProjectGraphHash(opts) {
	const {projectCWD, sourceDirs, ignoreDirs, entryDir, lockPrefix = ''} = opts;

	const globOpts = {
		ignore: ignoreDirs || [
			...entryDir ? path.join(entryDir, '/**') : [],
			...sourceDirs.map((dir) => path.join(dir, '**/tmp/**'))
		]
	};

	return objectHash().hash({
		lockPrefix,

		srcHash: hashFiles.sync({
			files: sourceDirs
				.flatMap((dir) => glob.sync(path.join(dir, `/**/@(${blockTypeList.join('|')})-*/index.js`), globOpts))
				.sort()
		}),

		projectFiles: glob.sync(path.join(sourceDirs[0], `/**/@(${blockTypeList.join('|')}-*/*.@(js|ts|styl|ss|ess)`), globOpts)
			.sort()
			.map((src) => path.relative(projectCWD, src)),

		objToHash: this.objToHash
	});
}

module.exports = {
	calculateProjectGraphHash
};
