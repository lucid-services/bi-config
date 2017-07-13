var fs             = require('fs');
var path           = require('path');
var rewire         = require('rewire');
var sinon          = require('sinon');
var chai           = require('chai');
var chaiAsPromised = require('chai-as-promised');
var sinonChai      = require("sinon-chai");
var tmp            = require('tmp');
var childProcess   = require('child_process');
var json5          = require('json5');
var nconf          = require('nconf');
var _merge         = require('lodash.merge');

ConfigError = require('../lib/error/configError.js');

// adds .json5 loader require.extension
require('json5/lib/require');

//this makes sinon-as-promised available in sinon:
require('sinon-as-promised');

var expect = chai.expect;

chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.should();

describe('Config', function() {
    before(function() {
        this.configFileContent = `{
            apps: { //position matter
                s2s: {
                    listen: {$ref: '#/listen/public'},
                    baseUrl: {$join: [
                        {$ref: '#/proxy/public/protocol'},
                        "://",
                        {$ref: '#/proxy/public/host'},
                        ':',
                        {$ref: '#/apps/s2s/listen'},
                    ]}
                }
            },
            baseUrl: '127.0.0.1',
            failOnErr: false, // a property with false value should be on top of the tree
            pointer: {$ref: '#/couchbase'},
            memcached: {
                hosts: [{$ref: '#/baseUrl'}]
            },
            couchbase: {
                host: 'localhost',
                buckets: {
                    main: {
                        bucket: 'test'
                    }
                }
            },
            listen: { //position matter
                public: '4000',
                private: '4001',
            },
            proxy: { // position matter, should be after apps & listen sections
                public: {
                    host: {$ref: '#/baseUrl'},
                    protocol: 'http'
                }
            }
        }`;

        this.configFileContent = this.configFileContent.split('\n').reduce(function(newStr, line) {
            if (!line) {
                return newStr;
            }
            newStr += line.trim() + '\n';
            return newStr;
        }, '')

        this.configData = json5.parse(this.configFileContent);

        tmp.setGracefulCleanup();
        var tmpDir = this.tmpDir = tmp.dirSync({unsafeCleanup: true});

        fs.mkdirSync(`${tmpDir.name}/config`);
        fs.writeFileSync(
            `${tmpDir.name}/config/config.json5`,
            json5.stringify(this.configData, null, 4)
        );
    });

    describe('as node module', function() {
        before(function() {
            this.processCwdStub = sinon.stub(process, 'cwd');
            this.processCwdStub.returns(this.tmpDir.name);
        });

        beforeEach(function() {
            this.nodeEnvBck = process.env.NODE_ENV;
            this.processArgvBck = process.argv;

            process.argv = [];
            this.config = rewire('../lib/index.js');
        });

        afterEach(function() {
            process.env.NODE_ENV = this.nodeEnvBck;
            process.argv = this.processArgvBck;
        });

        after(function() {
            this.processCwdStub.restore();
        });

        it('should exports nconf module', function() {
            this.config.should.have.property('nconf').that.is.an.instanceof(nconf.Provider);
        });

        describe('$getNodeEnvVar', function() {
            it('should return NODE_ENV variable if set', function() {
                var env = 'production';
                process.env.NODE_ENV = env;
                this.config.$getNodeEnvVar().should.be.equal(env);
            });

            it('should return default `development` value if the environment value is not set', function() {
                delete process.env.NODE_ENV;
                this.config.$getNodeEnvVar().should.be.equal('development');
            });
        });

        describe('$getDefaultConfigPath', function() {
            it('should return default config absolute file path', function() {
                var cwd = this.tmpDir.name;
                var env = 'production';

                process.env.NODE_ENV = env;

                this.processCwdStub.returns();
                this.config.$getDefaultConfigPath().should.be.equal(
                    `${cwd}/config/config.json5`
                );
            });
        });

        describe('$getFileOptions', function() {
            it('should return loaded json5 file for given file path with resolved json keywords ($ref, $join, etc..)', function() {
                var path = `${this.tmpDir.name}/config/config.json5`;
                var data = this.config.$getFileOptions(path);
                var expected = _merge({}, this.configData);
                expected.pointer = expected.couchbase;
                expected.memcached = {
                    hosts: ['127.0.0.1']
                };
                expected.proxy = {public: {
                    host: '127.0.0.1',
                    protocol: 'http'
                }};
                expected.apps = {s2s: {
                    baseUrl: 'http://127.0.0.1:4000',
                    listen: '4000'
                }};
                data.should.be.eql(expected);
            });

            it('should set the `hasFileConfig` option to true when the file config is loaded', function() {
                var path = `${this.tmpDir.name}/config/config.json5`;
                this.config.$getFileOptions(path);
                this.config.hasFileConfig.should.be.equal(true);
            });

            it('should set the `hasFileConfig` to false when config file is not found', function() {
                var error = new Error('test error');
                error.code = 'MODULE_NOT_FOUND';
                var requireStub = sinon.stub();

                requireStub.throws(error);

                this.config.__set__({
                    require: requireStub
                });

                data = this.config.$getFileOptions(`${this.tmpDir.name}/config/config.json5`);
                data.should.be.eql({});
                this.config.hasFileConfig.should.be.equal(false);
            });

            it('should call path.resolve with provided config path', function() {
                var cfgPath = `../config/config.json5`;
                var pathResolveSpy = sinon.spy(path, 'resolve');
                this.config.$getFileOptions(cfgPath);
                pathResolveSpy.should.have.been.calledWithExactly(cfgPath);

                pathResolveSpy.restore();
            });

            it('should throw a SyntaxError when there is a problem with parsing json5 config file', function() {
                var configPath = `${this.tmpDir.name}/config/invalid_config.json5`;

                fs.writeFileSync(
                    configPath,
                    'some: "data"}'
                );

                function test() {
                    this.config.$getFileOptions(configPath);
                }

                expect(test.bind(this)).to.throw(SyntaxError);
            });
        });

        describe('$getShellOptions', function() {
            it('should throw a ConfigError when invalid number of arguments is provided', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'listen.public'
                        ]
                    }
                });

                function test() {
                    this.config.$getShellOptions();
                }

                expect(test.bind(this)).to.throw(ConfigError);
            });

            it('should set the `hasShellPositionalArgs` flag if there is at least one pair of positioinal arguments', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'listen.public',
                            '3000'
                        ]
                    }
                });

                this.config.$getShellOptions();
                this.config.hasShellPositionalArgs.should.be.equal(true);
            });

            it('should return an object', function() {
                this.config.__set__({
                    argv: {
                        _: []
                    }
                });

                this.config.$getShellOptions().should.be.eql({});
            });

            it('should return an object with expected options set', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'listen.public',
                            3000,
                            'listen.private',
                            '3001',
                            'couchbase',
                            "{host: 'localhost', buckets: {}}"
                        ]
                    }
                });

                this.config.$getShellOptions().should.be.eql({
                    listen: {
                        public: 3000,
                        private: 3001,
                    },
                    couchbase: {
                        host: 'localhost',
                        buckets: {}
                    }
                });
            });

            it('should return an object with correct `config` option', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'fileConfigPath',
                            '"incorrect/config/option"'
                        ],
                        config: 'path/to/config/file'
                    }
                });

                this.config.$getShellOptions().should.be.eql({
                    fileConfigPath: 'path/to/config/file'
                });
            });

            it('should return an object with correct `config` option (2)', function() {
                this.config.__set__({
                    argv: {
                        _: [],
                        'parse-pos-args': false,
                        config: 'path/to/config/file'
                    }
                });

                this.config.$getShellOptions().should.be.eql({
                    fileConfigPath: 'path/to/config/file'
                });
            });

            it('should not include reserved `config` option if included as a positional argument', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'fileConfigPath',
                            '"incorrect/config/option"'
                        ]
                    }
                });

                this.config.$getShellOptions().should.be.eql({});
            });
        });

        describe('initialize', function() {
            it('should setup default config object', function() {
                var defaults = this.config.stores.defaults.store;
                defaults.should.be.eql({
                    fileConfigPath: null,
                    type: 'literal'
                });
            });

            it('should overwrite config options by those passed to the method as the argument', function() {
                var path = `${this.tmpDir.name}/config/config.json5`;

                this.config.__set__({
                    'process.env.NODE_ENV': 'production'
                });
                this.config.__set__({
                    argv: {
                        _: [
                            'couchbase.host',
                            '"127.0.0.1:8091"',
                            'listen',
                            '{public: 3000, private: 3001}',
                            'some.new.option',
                            '"value"'
                        ]
                    }
                });

                this.config.initialize({
                    failOnErr: true,
                    couchbase: {
                        host: '127.0.0.1:9999'
                    }
                });


                var defaults = this.config.stores.defaults.store;

                defaults.should.have.property('listen').that.is.eql({
                    public: 3000,
                    private: 3001
                });
                defaults.should.have.property('failOnErr').that.is.eql(true);
                defaults.should.have.property('couchbase').that.is.eql({
                    host: '127.0.0.1:9999',
                    buckets: {
                        main: {
                            bucket: 'test'
                        }
                    }
                });
            });

            it('should overwrite file config options by those defined as shell positional arguments', function() {
                var path = `${this.tmpDir.name}/config/config.json5`;

                this.config.__set__({
                    'process.env.NODE_ENV': 'production'
                });
                this.config.__set__({
                    argv: {
                        _: [
                            'couchbase.host',
                            '"127.0.0.1:8091"',
                            'listen',
                            '{public: 3000, private: 3001}',
                            'some.new.option',
                            '"value"'
                        ]
                    }
                });

                this.config.initialize();


                var defaults = this.config.stores.defaults.store;
                defaults.should.be.eql({
                    baseUrl: '127.0.0.1',
                    fileConfigPath: path,
                    type: 'literal',
                    couchbase: {
                        host: '127.0.0.1:8091',
                        buckets: {
                            main: {
                                bucket: 'test'
                            }
                        }
                    },
                    memcached: {
                        hosts: ['127.0.0.1']
                    },
                    pointer: {
                        host: 'localhost',
                        buckets: {
                            main: {
                                bucket: 'test'
                            }
                        }
                    },
                    failOnErr: false,
                    listen: {
                        public: 3000,
                        private: 3001,
                    },
                    some: {
                        new: {
                            option: 'value'
                        }
                    },
                    proxy: {
                        public: {
                            host: '127.0.0.1',
                            protocol: 'http'
                        }
                    },
                    apps: {
                        s2s: {
                            baseUrl: 'http://127.0.0.1:4000',
                            listen: '4000'
                        }
                    }
                });
            });
        });

        describe('get', function() {
            beforeEach(function() {
                this.getSpy = sinon.spy(this.config, 'get');
            });

            afterEach(function() {
                this.getSpy.restore();
            });

            it('should call nconf.get method with provide property path', function() {
                var propPath = 'couchbase:host';
                this.config.get(propPath);
                this.getSpy.should.have.been.calledOnce;
                this.getSpy.should.have.been.calledWith(propPath);
            });
        });

        describe('getOrFail', function() {
            beforeEach(function() {
                this.getSpy = sinon.spy(this.config, 'get');
            });

            afterEach(function() {
                this.getSpy.restore();
            });

            it('should call nconf.get method with property path', function() {
                var propPath = 'type';
                this.config.getOrFail(propPath);
                this.getSpy.should.have.been.calledOnce;
                this.getSpy.should.have.been.calledWith(propPath);
            });

            it('should throw an Error when provided option value is not set (aka. undefined)', function() {
                var self = this;

                expect(function() {
                    self.config.getOrFail('non-existing-key');
                }).to.throw(Error);
            });
        });

        describe('createLiteralProvider', function() {
            it('should return new Provider object with provided config data', function() {
                var data = {
                    some: 'value'
                };
                var provider = this.config.createLiteralProvider(data);
                provider.should.be.instanceof(nconf.Provider);
                provider.get().should.be.eql(data);
            });

            it('should return object with getOrFail method', function() {
                var data = {
                    some: 'value'
                };
                var provider = this.config.createLiteralProvider(data);
                provider.should.be.instanceof(nconf.Provider);
                provider.should.have.property('getOrFail').that.is.a('function');
            });
        });

        describe('setInspectionSchema', function() {
            it('should have the setInspectionSchema method', function() {
                this.config.should.have.property('setInspectionSchema').that.is.a('function');
            });

            it('should join received schema with currently set value', function() {
                this.config.setInspectionSchema({
                    prop: {$is:String},
                    prop2: {$is:Number},
                });

                this.config.setInspectionSchema({
                    prop2: {$is: Object},
                    prop3: {$is: Boolean}
                });

                this.config._schema.should.be.eql({
                    prop: {$is: String},
                    prop2: {$is: Object},
                    prop3: {$is: Boolean}
                });
            });

            it('should overwrite currently set schema value', function() {
                this.config.setInspectionSchema({
                    prop: {$is:String},
                    prop2: {$is:Number},
                });

                this.config.setInspectionSchema({
                    prop3: {$is: Boolean}
                }, true);

                this.config._schema.should.be.eql({
                    prop3: {$is: Boolean}
                });
            });
        });

        describe('inspectIntegrity', function() {
            before(function() {
                this.schema = {
                    listen: {
                        public: {
                            port: {$is: Number}
                        }
                    },
                    apps: {
                        $forOwn: {
                            listen: {$is: Number},
                            baseUrl: {$isURL: null}
                        }
                    }
                };
            });

            it('should have the inspectIntegrity method', function() {
                this.config.should.have.property('inspectIntegrity').that.is.a('function');
            });

            it('should successfully validate config object', function() {
                var conf = this.config.createLiteralProvider({
                    listen: {
                        public: {
                            port: 3000
                        }
                    },
                    apps: {
                        public: {
                            listen: 3000,
                            baseUrl: 'http://127.0.0.1:3000',
                        }
                    }
                });

                conf.setInspectionSchema(this.schema);

                return conf.inspectIntegrity().should.become(true);
            });

            it('should NOT successfully validate config object', function() {
                var conf = this.config.createLiteralProvider({
                    listen: {
                        public: {
                            port: 'invalid'
                        }
                    }
                });

                conf.setInspectionSchema(this.schema);

                return conf.inspectIntegrity().should.be.rejectedWith(Error);
            });
        });
    });

    describe('as cli app', function() {
        before(function() {
            this.spawn = spawn;

            function spawn(args) {
                var cmd = path.normalize(__dirname + '/../lib/index.js');
                args.unshift(cmd);

                var result = childProcess.spawnSync('node', args, {
                    cwd: this.tmpDir.name,
                    env: {
                        NODE_ENV: 'production'
                    }
                });

                if (result.error) {
                    throw result.error;
                }

                return result;
            }
        });

        describe('--get-conf, -g option', function() {
            it('should print option value', function() {
                var result = this.spawn([
                    '--get-conf',
                    'couchbase.buckets'
                ]);

                var stdout = json5.parse(result.stdout.toString());
                result.status.should.be.equal(0);
                stdout.should.be.eql({
                    main: {
                        bucket: 'test'
                    }
                });
            });

            it('should print option value', function() {
                var result = this.spawn([
                    '-g',
                    'failOnErr'
                ]);

                var stdout = json5.parse(result.stdout.toString());
                result.status.should.be.equal(0);
                stdout.should.be.equal(false);
            });

            it('should exit with 1 and print "undefined" when there is not such option', function() {
                var result = this.spawn([
                    '-g',
                    'some.options.which.does.not.exist'
                ]);

                result.status.should.be.equal(1);
                result.stderr.toString().should.be.equal('undefined\n');
            });
        });

        describe('--json5 option', function() {
            it('should print json data in json5 format', function() {
                var result = this.spawn([
                    '--get-conf',
                    'couchbase.buckets',
                    '--json5'
                ]);

                var stdout = result.stdout.toString();
                result.status.should.be.equal(0);
                stdout.should.be.equal('{\n' +
                '    main: {\n'              +
                '        bucket: "test"\n'   +
                '    }\n'                    +
                '}\n')
            });
        });

        describe('--offset option', function() {
            it('should print json data with correct space offset set', function() {
                var result = this.spawn([
                    '--get-conf',
                    'couchbase.buckets',
                    '--offset',
                    '2'
                ]);

                var stdout = result.stdout.toString();
                result.status.should.be.equal(0);
                stdout.should.be.equal('{\n' +
                '  "main": {\n'              +
                '    "bucket": "test"\n'     +
                '  }\n'                      +
                '}\n')
            });

            it('should replace space character with given string value in JSON output', function() {
                var result = this.spawn([
                    '--get-conf',
                    'couchbase.buckets',
                    '--offset',
                    '__'
                ]);

                var stdout = result.stdout.toString();
                result.status.should.be.equal(0);
                stdout.should.be.equal('{\n' +
                '__"main": {\n'              +
                '____"bucket": "test"\n'     +
                '__}\n'                      +
                '}\n')
            });
        });

        describe('--parse-pos-args option', function() {
            it('should not parse positional arguments from shell when the option is set to false', function() {
                var result = this.spawn([
                    '--parse-pos-args',
                    false,
                    '--get-conf',
                    'couchbase.host',
                    'couchbase.host',
                    'valuewhichwillnotbeset'
                ]);

                result.status.should.be.equal(0);
                result.stdout.toString().should.be.equal('localhost\n');
            });
        });

        describe('shell positional arguments', function() {
            it('(positional args) should overwrite file config options', function() {
                var result = this.spawn([
                    '-g',
                    'couchbase.host',
                    'couchbase.host',
                    '"127.0.0.3"'
                ]);

                result.status.should.be.equal(0);
                result.stdout.toString().should.be.equal('127.0.0.3\n');
            });

            it('should exit with 1 when we provide invalid number of positional args', function() {
                var result = this.spawn([
                    'couchbase.host',
                    '"127.0.0.3"',
                    'another.config.option.with.no.value'
                ]);

                result.status.should.be.equal(1);
            });
        });
    });
});
