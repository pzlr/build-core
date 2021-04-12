'use strict';

/**
 * Creates a Map instance that can be serialized to JSON
 *
 * @param {!Array<!Array<?>>=} [data] - data to create the instance
 * @returns {!Map<?, ?>}
 */
function createSerializableMap(data) {
	const map = new Map(data);

	map.toJSON = () => ({
		'%data': '%data:Map',
		'%data:Map': [...map.entries()].sort(([key1], [key2]) => {
			if (key1 > key2) {
				return 1;
			}

			if (key1 < key2) {
				return -1;
			}

			return 0;
		})
	});

	return map;
}

/**
 * Creates a Set instance that can be serialized to JSON
 *
 * @param {!Array<?>=} [data] - data to create the instance
 * @returns {!Set<?, ?>}
 */
function createSerializableSet(data) {
	const set = new Set(data);

	set.toJSON = () => ({
		'%data': '%data:Set',
		'%data:Set': [...set.values()].sort()
	});

	return set;
}

/**
 * Reviver for `JSON.parse` to parse Map/Set instances
 *
 * @param key
 * @param val
 * @returns {?}
 */
function jsonReviver(key, val) {
	if (val != null && typeof val === 'object' && '%data' in val) {
		return val[val['%data']];
	}

	if (/^%data:/.test(key)) {
		switch (key.split(':')[1]) {
			case 'Map': return new Map(val);
			case 'Set': return new Set(val);
		}
	}

	return val;
}

module.exports = {
	createSerializableMap,
	createSerializableSet,
	jsonReviver
};
