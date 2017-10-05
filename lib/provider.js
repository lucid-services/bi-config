var Validator = require('ajv');
var nconf     = require('nconf');
var Promise   = require('bluebird');

module.exports = Provider;
module.exports.Provider = Provider;

function Provider(options) {
    nconf.Provider.call(this, options || {});

    //validator schema used for config integrity inspection
    this._schema    = {};

    this._validator = new Validator({
        $data: true, //data json references
        allErrors: false,
        verbose: true, //include validated data in errors
        schemaId: '$id',
        //it should fail if other keywords are present
        //along the $ref keywords in the schema
        extendRefs: 'fail',
        useDefaults: true,
        coerceTypes: true
    });
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
 * set ajv validation schema
 *
 * @param {Object} schema
 * @return {Object}
 */
Provider.prototype.setInspectionSchema = function(schema) {
    schema = schema || {};
    if (this._validator.getSchema('config_schema')) {
        this._validator.removeSchema('config_schema');
    }
    this._validator.addSchema(schema, 'config_schema');
    return schema;
};

/**
 * get ajv validation schema
 *
 * @return {Object}
 */
Provider.prototype.getInspectionSchema = function() {
    var _fn = this._validator.getSchema('config_schema');
    return _fn.schema;
};

/**
 * validate config
 * @return {Promise<>}
 */
Provider.prototype.inspectIntegrity = Promise.method(function() {
    const validate = this._validator.getSchema('config_schema');

    if (!validate) {
        return false;
    }

    if (validate(this.get())) {
        return true;
    }

    var err = validate.errors.shift();
    throw new Error(`${err.dataPath || '$DATA$'} ${err.message}`);
});
