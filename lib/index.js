var merge  = require('lodash.merge');
var fs     = require('fs');
var path   = require('path');
var nconf  = require('nconf');
var json5  = require('json5');
var argv   = require('yargs').argv;
var logger = require('bi-logger');

var ConfigError = require('./error/configError.js');

// adds .json5 loader require.extension
require('json5/lib/require');

var NODE_ENV = process.env.NODE_ENV || 'development';
var CONFIG_PATH = path.normalize(
    `${process.cwd()}/${NODE_ENV}/config/settings.conf.json`
);

var Config = {

    hasFileConfig: false,
    hasShellPositionalArgs: false,

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
                `Invalid number of positional arguments passed to the shell command.
                Possitional arguments are expected to be in "key value" format`
            );
        }

        options.names.forEach(function(name, index) {
            out[name] = json5.parse(options.values[index]);
        });

        if (options.names.length) {
            this.hasShellPositionalArgs = true;
        }

        //for overwriting expected config filepath we can use --config option only
        out.config = argv.config;

        return out;
    },

    /**
     * initialize
     *
     * @return {undefined}
     */
    initialize: function() {
        var config = merge({
            //defaults to settings.conf.json filepath if we don't explicitly set
            // "--cofing path/to/config" option
            config: CONFIG_PATH
        }, this.$getShellOptions());

        //explicit command options from a shell have the hightest priority
        nconf.defaults(merge(
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
