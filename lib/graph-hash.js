'use strict';

const
	path = require('upath'),
	glob = require('glob-promise'),
	objectHash = require('node-object-hash'),
	hashFiles = require('hash-files');

const
	{blockTypeList} = require('./validators'),
	{readLockFile} = require('./lock-file');

/**
 * Calculates the project graph hash and returns it
 *
 * @param {CalculateGraphHashOptions} opts
 * @returns {string}
 */
function calculateGraphHash(opts) {
	const {projectCWD, sourceDirs, objToHash, ignoreDirs, entryDir, lockPrefix = ''} = opts;

	const globOpts = {
		ignore: ignoreDirs ?? [
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

		objToHash
	});
}

/**
 * Reads graph hash from lock file and returns it
 *
 * @param {string} lockFile
 * @returns {string | undefined}
 */
function readGraphHashFromLockFile(lockFile) {
	const lockFileData = readLockFile(lockFile);

	return lockFileData?.hash;
}

module.exports = {
	calculateGraphHash,
	readGraphHashFromLockFile
};
