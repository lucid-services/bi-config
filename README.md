[![Build Status](https://travis-ci.org/BohemiaInteractive/bi-config.svg?branch=master)](https://travis-ci.org/BohemiaInteractive/bi-config)  

Configuration plugin for [bi-service](https://github.com/BohemiaInteractive/bi-service)  
Loads an application config file from a fs path which defaults to `<project_root>/config/config.js`.

Example use (`bi-service` is responsible for config initialization):
```js
    const config = require('bi-config');
    config.initialize();
    //...stuff
    var listenPort = config.get("path:to:nested:option");
```

The config file can be also in valid `json` format given that you provide the file path to the `bi-service` application:

```bash
project-root> ./node_modules/.bin/bi-service run --config ./config/config.json
```
