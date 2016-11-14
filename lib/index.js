var fs     = require('fs');
var path   = require('path');
var yargs  = require('yargs');
var _merge = require('lodash.merge');
var _set   = require('lodash.set');
var _get   = require('lodash.get');
var nconf  = require('nconf');
var json5  = require('json5');
var logger = require('bi-logger');

var ConfigError = require('./error/configError.js');

// adds .json5 loader require.extension
require('json5/lib/require');

var argv = yargs
.usage('node config [key] [value] ...')
.option('get', {
    alias: 'g',
    describe: 'Prints config option value',
    type: 'string'
}).help().argv;

var Config = {

    hasFileConfig: false,
    hasShellPositionalArgs: false,

    /**
     * $getNodeEnvVar
     *
     * @return {String}
     */
    $getNodeEnvVar: function() {
        return process.env.NODE_ENV || 'development';
    },

    /**
     * $getDefaultConfigPath
     *
     * @return {String}
     */
    $getDefaultConfigPath: function() {
        return path.normalize(
            `${process.cwd()}/${this.$getNodeEnvVar()}/config/settings.conf.json5`
        );
    },

    /**
     * $getFileOptions
     *
     * @param {String|undefined} filePath
     *
     * @return {Object}
     */
    $getFileOptions: function(filePath) {
        try {
            this.hasFileConfig = true;
            return require(filePath);
        } catch(e) {
            if (e instanceof SyntaxError) {
                throw e;
            }
            this.hasFileConfig = false;
            return {};
        }
    },

    /**
     * $getShellOptions
     *
     * @return {Object}
     */
    $getShellOptions: function() {
        var out = {};

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

        //for overwriting expected config filepath we can use --config option only
        if (argv.config) {
            out.config = argv.config;
            out.config = path.normalize(out.config);
        } else {
            delete out.config;
        }

        return out;
    },

    /**
     * initialize
     *
     * @return {undefined}
     */
    initialize: function() {
        var config = _merge({
            //defaults to settings.conf.json filepath if we don't explicitly set
            // "--cofing path/to/config" option
            config: this.$getDefaultConfigPath()
        }, this.$getShellOptions());

        //explicit command options from a shell have the hightest priority
        nconf.defaults(_merge(
            {},
            this.$getFileOptions(config.config),
            config
        ));
    },

    /**
     * get
     *
     * @param {String} propPath
     *
     * @return {mixed}
     */
    get: function(propPath) {
        return nconf.get(propPath);
    },
    nconf: nconf,
};

exports = module.exports = Object.create(Config);
exports.Config = Config;
exports.initialize();

if (module.parent === null) {
    if (argv.hasOwnProperty('get')) {
        var val;
        if (!argv.get) {
            val = exports.get();
        } else {
            val = _get(exports.get(), argv.get);
        }

        if (val !== undefined) {
            console.log(val);
            process.exit();
        } else {
            console.error(val);
            process.exit(1);
        }
    }
}
