var nconf          = require('nconf');
var Promise        = require('bluebird');
var jsonInspector  = require('bi-json-inspector');
var _isPlainObject = require('lodash.isplainobject');

module.exports = Provider;
module.exports.Provider = Provider;

function Provider(options) {
    nconf.Provider.call(this, options || {});

    //validator schema used for config integrity inspection
    this._schema = {};
}

Provider.prototype = Object.create(nconf.Provider.prototype, {
    constructor: {
        value: Provider
    }
});

/**
 *
 * @param {String} propPath
 *
 * @throws {Error}
 * @return {mixed}
 */
Provider.prototype.getOrFail = function(propPath) {
    var out = this.get(propPath);
    if (out === undefined) {
        throw new Error(`Cant find config value of "${propPath}"`);
    }

    return out;
};

/**
 *
 * @param {Object} schema
 * @param {Boolean} [overwrite=false]
 *
 * @return {Object}
 */
Provider.prototype.setInspectionSchema = function(schema, overwrite) {
    schema = schema || {};

    if (overwrite === true) {
        this._schema = schema;
    } else {
        Object.assign(this._schema, schema);
    }

    return this._schema;
};

/**
 * @return {Promise<>}
 */
Provider.prototype.inspectIntegrity = Promise.method(function() {
    if (_isPlainObject(this._schema)) {
        return false;
    }

    var validator = new jsonInspector.Validator(this._schema, {
        filterData: false,
        nullable: true
    });

    validator.validate(this.get());

    if (!validator.success) {
        throw validator.error;
    }

    return true;
});
