var fs             = require('fs');
var path           = require('path');
var yargs          = require('yargs');
var nconf          = require('nconf');
var json5          = require('json5');
var _merge         = require('lodash.merge');
var _forOwn        = require('lodash.forown');
var _isPlainObject = require('lodash.isplainobject');
var _set           = require('lodash.set');
var _get           = require('lodash.get');

var ConfigError = require('./error/configError.js');
var Provider    = require('./provider');

// adds .json5 loader require.extension
require('json5/lib/require');

var argv = yargs
.usage('node app [option]... [key] [value] ...')
.option('get-conf', {
    alias: 'g',
    describe: 'Prints config option value',
    type: 'string'
})
.option('json5', {
    describe: 'Prints json data in json5 format',
    type: 'boolean',
    default: false
})
.option('parse-pos-args', {
    describe: 'Whether to parse positional shell arguments passed to node process',
    type: 'boolean',
    default: true
})
.option('offset', {
    describe: "A String or Number that's used to insert white space into the output JSON string for readability purposes.",
    default: 4
})
.option('config', {
    describe: 'Custom config file destination',
    type: 'string'
}).help().argv;

/**
 * @param {Object|Array} [data]
 * @param {String} [type] - literal|memory|file ...
 * @constructor
 **/
function Config(data, type) {
    this.hasFileConfig = false;
    this.hasShellPositionalArgs = false;
    this.nconf = nconf;

    var options = {
        store: {
            type: type || 'memory',
        }
    };

    if (type !== 'memory') {
        options.store.store = data || {};
    }

    Provider.call(this, options);

    if (type === 'memory') {
        this.set(null, data);
    }
}

Config.prototype = Object.create(Provider.prototype, {
    constructor: {
        value: Provider
    }
});

/**
 * @private
 * @return {String}
 */
Config.prototype.$getNodeEnvVar = function() {
    return process.env.NODE_ENV || 'development';
};

/**
 * @private
 * @return {String}
 */
Config.prototype.$getDefaultConfigPath = function() {
    var subdir = this.$getNodeEnvVar();
    if (subdir.toLowerCase() === 'production') {
        subdir = '';
    }
    return path.normalize(
        `${process.cwd()}/config/${subdir}/config.json5`
    );
};

/**
 * @private
 * @param {String|undefined} filePath
 *
 * @return {Object}
 */
Config.prototype.$getFileOptions = function(filePath) {
    try {
        this.hasFileConfig = true;
        return this.$resolveJsonRefs(require(path.resolve(filePath)));
    } catch(e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }
        this.hasFileConfig = false;
        return {};
    }
};

/**
 * @private
 * @param {Object|Array} root
 * @return {Object}
 */
Config.prototype.$resolveJsonRefs = function(root) {
    var convertPath = this.$convertJsonRefPath.bind(this);
    var joinValues = this.$joinValues.bind(this);
    resolve(root, '', root);
    return root;

    /*
     * @param {mixed} val
     * @param {String|Int} key
     * @param {Object|Array} object
     */
    function resolve(val, key, object) {
        if (_isPlainObject(val)) {
            if (   val.hasOwnProperty('$ref')
                && typeof val.$ref === 'string'
                && Object.keys(val).length === 1
            ) {
                var resolved = _get(root, convertPath(val.$ref));
                _set(object, key, resolved);

                do {
                    resolve(resolved, key, object);
                } while (_isPlainObject(object[key]) && object[key].hasOwnProperty('$ref'));
            } else if (val.hasOwnProperty('$join')
                && Object.keys(val).length === 1
                && val.$join instanceof Array
                && val.$join.length
            ) {
                if (val.$join.length == 1) {
                    resolve(val.$join.pop(), key, object);
                } else {
                    resolve(val.$join[0], 0, val.$join);
                    var joinedValue = val.$join.shift()
                    ,   type = typeof joinedValue;

                    val.$join.forEach(function(item, k, o) {
                        resolve(item, k, o);

                        if (typeof o[k] !== type) {
                            throw new ConfigError(`$join item type mismatch. Expected ${type} got ${typeof o[k]}`);
                        }

                        joinedValue = joinValues(joinedValue, o[k]);
                    });
                    _set(object, key, joinedValue);
                }
            } else {
                _forOwn(val, resolve);
            }
        } else if (val instanceof Array) {
            val.forEach(resolve);
        }
        //can not return anything because of the lodash.forOwn
    }
};

/**
 * @param {mixed} val1
 * @param {mixed} val2
 *
 * @return {mixed}
 */
Config.prototype.$joinValues = function(val1, val2) {
    var primitives = ['string', 'number'];
    var type1 = typeof val1;
    var type2 = typeof val2;

    if (~primitives.indexOf(type1) && ~primitives.indexOf(type2)) {
        return val1 + val2;
    } else if (val1 instanceof Array && val2 instanceof Array) {
        return val1.concat(val2);
    } else if (_isPlainObject(val1) && _isPlainObject(val2)) {
        return Object.assign(val1, val2);
    }
};

/**
 * @private
 * @param {String} path - path in json pointer format
 *
 * return {String}
 */
Config.prototype.$convertJsonRefPath = function(path) {
    path = path.substr(1);
    if (path[0] == '/') {
        return this.$convertJsonRefPath(path);
    }
    return path.replace(/\//g, '.');
};

/**
 * @private
 * @return {Object}
 */
Config.prototype.$getShellOptions = function() {
    var out = {};

    //we behave as default `parse-pos-args` value is `true`, it must be
    //explicitly set to falsy value thus undefined & null values does not count
    if (argv['parse-pos-args'] === false || argv['parse-pos-args'] === 0) {
        setConfigPathOption(out);
        return out;
    }

    var options = argv._.reduce(function(out, option, index) {
        if (index % 2 === 0) {
            out.names.push(option);
        } else {
            out.values.push(option);
        }
        return out;
    }, {
        names: [],
        values: []
    });

    if (argv._.length % 2 !== 0) {
        throw new ConfigError(
            `Invalid number of shell positional arguments received.
            Possitional arguments are expected to be in "[key] [value]" pairs`
        );
    }

    options.names.forEach(function(propPath, index) {
        _set(
            out,
            propPath,
            json5.parse(options.values[index])
        );
    });

    if (options.names.length) {
        this.hasShellPositionalArgs = true;
    }

    setConfigPathOption(out);

    return out;

    function setConfigPathOption(obj) {
        //for overwriting expected config filepath we can use --config option only
        if (argv.config) {
            obj.fileConfigPath = argv.config;
            obj.fileConfigPath = path.normalize(obj.fileConfigPath);
        } else {
            delete obj.fileConfigPath;
        }
    }

};

/**
 * @public
 * @param {Object} options - config option values with highest priority - these options will overwrite everything else
 * @return {undefined}
 */
Config.prototype.initialize = function(options) {
    var config = _merge({
        //defaults to config.json5 filepath if we don't explicitly set
        // "--cofing path/to/config" option
        fileConfigPath: this.$getDefaultConfigPath()
    }, this.$getShellOptions(), options);

    var fileConfig = this.$getFileOptions(config.fileConfigPath);

    if (!this.hasFileConfig) {
        config.fileConfigPath = null;
    }

    //explicit command options from a shell have the highest priority
    this.defaults(_merge(
        {},
        fileConfig,
        config
    ));
};

/**
 * creates readonly config
 * @public
 * @param {Object} config
 *
 * @return {Provider}
 */
Config.prototype.createLiteralProvider = function(config) {
    return new Config(config, 'literal');
};

/**
 * creates writable config store
 * @public
 * @param {Object} config
 *
 * @return {Provider}
 */
Config.prototype.createMemoryProvider = function(config) {
    var provider =  new Config(config, 'memory');
    if (config && typeof config === 'object') {
        provider.set(null, config);
    }

    return provider;
};

exports = module.exports = new Config();
exports.Config = Config;
exports.initialize();
//make it backward compatible
//@deprecated - should be removed in v2.0.0
nconf.add('defaults', exports.stores.defaults);

/* istanbul ignore next */
//Tested by spawning new node process in tests
if (argv['get-conf'] !== undefined) {
    var getOptionVal = argv['get-conf'];
    var val;
    if (!getOptionVal) {
        val = exports.get();
    } else {
        val = _get(exports.get(), getOptionVal);
    }

    if (val !== undefined) {
        if (typeof val === 'object') {
            var jsonUtils = argv.json5 ? json5 : JSON;

            val = jsonUtils.stringify(val, null, argv.offset);
        }
        console.log(val);
        process.exit();
    } else {
        console.error(val);
        process.exit(1);
    }
}
