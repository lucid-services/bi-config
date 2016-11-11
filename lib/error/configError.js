var util = require('util');

module.exports = ConfigError;

/**
 * Error ConfigError
 * */
function ConfigError(message) {

    Error.call(this); //super constructor
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = message;
}

util.inherits(ConfigError, Error);
