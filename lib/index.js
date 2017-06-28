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

var Config = {

    hasFileConfig: false,
    hasShellPositionalArgs: false,

    /**
     * @private
     * @return {String}
     */
    $getNodeEnvVar: function() {
        return process.env.NODE_ENV || 'development';
    },

    /**
     * @private
     * @return {String}
     */
    $getDefaultConfigPath: function() {
        var subdir = this.$getNodeEnvVar();
        if (subdir.toLowerCase() === 'production') {
            subdir = '';
        }
        return path.normalize(
            `${process.cwd()}/config/${subdir}/config.json5`
        );
    },

    /**
     * @private
     * @param {String|undefined} filePath
     *
     * @return {Object}
     */
    $getFileOptions: function(filePath) {
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
    },

    /**
     * @private
     * @param {mixed} val
     * @param {String|Int} key
     * @param {Object|Array} object
     */
    $resolveJsonRefs: function(root) {
        var convertPath = this.$convertJsonRefPath.bind(this);
        resolve(root, '', root);
        return root;

        function resolve(val, key, object) {
            if (_isPlainObject(val)) {
                if (   val.hasOwnProperty('$ref')
                    && typeof val.$ref === 'string'
                    && Object.keys(val).length === 1
                ) {
                    _set(object, key, _get(root, convertPath(val.$ref)) );
                } else {
                    _forOwn(val, resolve);
                }
            } else if (val instanceof Array) {
                val.forEach(resolve);
            }
            //can not return anything because of the lodash.forOwn
        }
    },

    /**
     * @private
     * @param {String} path - path in json pointer format
     *
     * return {String}
     */
    $convertJsonRefPath: function(path) {
        path = path.substr(1);
        if (path[0] == '/') {
            return this.$convertJsonRefPath(path);
        }
        return path.replace(/\//g, '.');
    },

    /**
     * @private
     * @return {Object}
     */
    $getShellOptions: function() {
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

    },

    /**
     * @public
     * @param {Object} options - config option values with highest priority - these options will overwrite everything else
     * @return {undefined}
     */
    initialize: function(options) {
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
        nconf.defaults(_merge(
            {},
            fileConfig,
            config
        ));
    },

    /**
     * @public
     * @param {Object} config
     *
     * @return {Provider}
     */
    createLiteralProvider: function(config) {
        return new nconf.Provider({
            store: {
                type: 'literal',
                store: config
            }
        });
    },

    /**
     * @public
     * @param {String} propPath
     *
     * @return {mixed}
     */
    get: function(propPath) {
        return nconf.get(propPath);
    },

    /**
     * @public
     * @param {String} propPath
     *
     * @throws {Error}
     * @return {mixed}
     */
    getOrFail: function(propPath) {
        var out = nconf.get(propPath);
        if (out === undefined) {
            throw new Error(`Cant find config value of "${propPath}"`);
        }

        return out;
    },
    nconf: nconf,
};

exports = module.exports = Object.create(Config);
exports.Config = Config;
exports.initialize();

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
