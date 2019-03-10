[![Build Status](https://travis-ci.org/lucid-services/serviser-config.svg?branch=master)](https://travis-ci.org/lucid-services/serviser-config)  

Configuration plugin for [serviser](https://github.com/lucid-services/serviser)  
Loads an application config file from a `fs` path which defaults to `<project_root>/config/config.js`.  
The config file can also be in `json` format given that you provide `serviser` with custom file path:  

```bash
project-root> ./node_modules/.bin/serviser run --config ./config/config.json
```

Usage examples:

- let `serviser` load its configuration from default `fs` path

```js
    const Service = require('serviser');
    const Config = require('serviser-config');

    const service = new Service(Config);
```

- provide `serviser` with in-memory config object

```js
    const Service = require('serviser');
    const Config = require('serviser-config');


    const config = Config.createMemoryProvider({
        //...config content
    });

    const service = new Service(config);
```

- set config value

```js
    config.set("path:to:nested:option", value);
```

- get config value

```js
    var value = config.get("path:to:nested:option");
    var value = config.getOrFail("path:to:nested:option"); //throws if value === undefined
```
