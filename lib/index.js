const fs     = require('fs');
const path   = require('path');
const nconf  = require('nconf');
const _merge = require('lodash.merge');

var ConfigError = require('./error/configError.js');
var Provider    = require('./provider');

/**
 * @param {Object|Array} [data]
 * @param {String} [type] - literal|memory|file ...
 * @constructor
 **/
function Config(data, type) {
    this._initialized = false;
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

Config.prototype = Object.create(Provider.prototype);


/**
 * @return {Boolean}
 */
Config.prototype.isInitialized = function() {
    return !!this._initialized;
};

/**
 * @private
 * @return {String}
 */
Config.prototype.$getDefaultConfigPath = function() {
    return path.normalize(
        `${process.cwd()}/config/config.js`
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
        return require(path.resolve(filePath));
    } catch(e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            throw e;
        }
        this.hasFileConfig = false;
        return {};
    }
};

/**
 * @public
 * @param {Object} options - config option values with highest priority - these options will overwrite everything else
 * @return {undefined}
 */
Config.prototype.initialize = function(options) {
    var config = _merge({
        //defaults to config.js filepath if we don't explicitly set
        // "--cofing path/to/config" option
        fileConfigPath: this.$getDefaultConfigPath()
    }, options);

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

    this._initialized = true;
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
