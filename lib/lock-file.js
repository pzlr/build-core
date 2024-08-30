'use strict';

const
	fs = require('fs-extra-promise'),
	Sugar = require('sugar'),
	path = require('upath');

const {jsonReviver} = require('./helpers');

/**
 * Reads lock file and returns parsed hash and data
 *
 * @param {string} lockFile
 * @param {{BlockPrototype: any}=} [opts]
 * @returns {{hash: string; data: unknown} | undefined}
 */
function readLockFile(lockFile, opts) {
	try {
		if (fs.existsSync(lockFile)) {
			const normalizedJSONReviver = (key, val) => {
				val = jsonReviver(key, val);

				if (Sugar.Object.isString(val) && path.extname(val) !== '') {
					return path.resolve(path.dirname(lockFile), val);
				}

				if (
					Sugar.Object.isObject(val) &&
					val.declaration != null &&
					opts?.BlockPrototype != null
				) {
					Object.setPrototypeOf(val, opts.BlockPrototype);
				}

				return val;
			};

			return fs.readJSONSync(lockFile, {reviver: normalizedJSONReviver});
		}

	} catch {}
}

module.exports = {
	readLockFile
};
