## 3.0.0

* [CHANGED] - project renamed to `serviser-config`

## 3.0.0-alpha

* [CHANGED] - dropped `json5` file format support which is replaced with plain javascript configuration file
* [CHANGED] - by default config file is searched for at $project-root/config/config.js (`NODE_ENV` is ignored)

## 2.0.1

## 2.0.0

* [ADDED] - `Config.prototype.isInitialized` method

## 2.0.0-alpha

* [CHANGED] - config file for `production` environment has been moved to 'config/production/' subdirectory
* [REMOVED] - handling of shell process arguments (the arguments are processed directly by bi-service@1.0.0)

## 1.2.1

* [FIXED] - `Config` constructor should accept `data` argument when `memory` store is used
* [FIXED] - `inspectIntegrity` method should return `false` if no validation schema is set
* [ADDED] - `Config.prototype.createMemoryProvider`  method

## 1.2.0

* [FIXED] - `require('bi-config').set` method should work
* [ADDED] - `config.inspectIntegrity` method

## 1.1.1

* [FIXED] - `createLiteralProvider` should return config object with the `getOrFail` method

## 1.1.0

* [ADDED] - `$join` keyword
* [FIXED] - nested json pointers `$ref` were not being resolved in some cases

## 1.0.0

* [ADDED] `getOrFail` method
* [REMOVED] `bi-logger` dependency

## 0.7.3

* [FIXED] `config` shell option was being ignored when `parse-pos-args`==false

## 0.7.2

* [FIXED] relative config urls should be resolved before we attempt to require the config file

## 0.7.1

* [FIXED] default config filename changed to `config.json5` from (`settings.conf.json5`) - the deploy process expect config under correct filename

## 0.7.0 - 2016-12-15 16:09

* [ADDED] new `options` object argument to the `initialize` method (solves the issue with supporting creation of multiple `config` object instances)
* [ADDED] new `parse-pos-args` boolean cli option
