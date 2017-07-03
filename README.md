# Config module


Loads config file from path which defaults to `/config/NODE_ENV/settings.conf.json5`. `NODE_ENV` defaults to `development` string value.
To the above rule an exeption applies for default production config file path which is expected to be located at `config/settings.conf.json5` - It's searched for when `NODE_ENV='production'`

## How to use

example config in `config/development/settings.conf.json5`
```json
{
  "global": {
    "listenPort": 1234
  }
}
```

Config values can be either in valid `JSON` or in more lighweight [JSON5](https://github.com/json5/json5) format.

Example use:
```js
    var config = require('bi-config');
    //...stuff
    var listenPort = config.get("global:listenPort");
```

## CLI

```bash

node app --help
```

CLI config options overwrites those defined in config file.

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
