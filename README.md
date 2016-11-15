# Config module


Loads config file from path which defaults to `/config/NODE_ENV/settings.conf.json5`. `NODE_ENV` defaults to `development` string value.

## How to use

example config in `config\developemnt\main.conf.json`
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
