[![Build Status](https://travis-ci.org/BohemiaInteractive/bi-config.svg?branch=master)](https://travis-ci.org/BohemiaInteractive/bi-config)  

Configuration plugin for [bi-service](https://github.com/BohemiaInteractive/bi-service)  
Loads a config file from a fs path which defaults to `/config/NODE_ENV/config.json5`.  
`NODE_ENV` defaults to `development` string value.  
Config values can be either in valid `JSON` or in more lighweight [JSON5](https://github.com/json5/json5) format.

Example use:
```js
    const config = require('bi-config');
    config.initialize();
    //...stuff
    var listenPort = config.get("path:to:nested:option");
```

## JSON pointer

Supports pointers only within a file (does not support referencing other files from within a file)

Example use:

```javascript
{
    public: {
        storage: {
            couchbase: {$ref: '#/storage/couchbase'}
        }
    },
    storage: {
        couchbase: {
            host: '127.0.0.1'
        }
    }
}
```

will be resolved to

```javascript
{
    public: {
        storage: {
            couchbase: {
                host: '127.0.0.1'
            }
        }
    },
    storage: {
        couchbase: {
            host: '127.0.0.1'
        }
    }
}

```

## `$join` keyword

Joins all items of an array into one value. JSON pointer are resolved before concatenation

Example use: 
```javascript
{
    host: 'localhost',
    listen: 3000,
    url: {$join: [
        'http://',
        {$ref: '#/host'},
        ':'
        {$ref: '#/listen'},
    ]}
}

```
