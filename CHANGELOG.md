## FUTURE

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
