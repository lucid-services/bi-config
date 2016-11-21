var fs           = require('fs');
var path         = require('path');
var rewire       = require('rewire');
var sinon        = require('sinon');
var chai         = require('chai');
var sinonChai    = require("sinon-chai");
var tmp          = require('tmp');
var childProcess = require('child_process');
var json5        = require('json5');
var nconf        = require('nconf');
var _merge       = require('lodash.merge');

ConfigError = require('../lib/error/configError.js');

// adds .json5 loader require.extension
require('json5/lib/require');

var expect = chai.expect;

chai.use(sinonChai);
chai.should();

describe('Config', function() {
    before(function() {
        this.configFileContent = `{
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
            listen: {
                public: '127.0.0.1:3000',
                private: '127.0.0.1:3001',
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
        fs.mkdirSync(`${tmpDir.name}/config/production`);
        fs.writeFileSync(
            `${tmpDir.name}/config/production/settings.conf.json5`,
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
                    `${cwd}/config/${this.config.$getNodeEnvVar()}/settings.conf.json5`
                );
            });
        });

        describe('$getFileOptions', function() {
            it('should return loaded json5 file for given file path with resolved json pointers', function() {
                var path = `${this.tmpDir.name}/config/production/settings.conf.json5`;
                var data = this.config.$getFileOptions(path);
                var expected = _merge({}, this.configData);
                expected.pointer = expected.couchbase;
                expected.memcached = {
                    hosts: ['127.0.0.1']
                };
                data.should.be.eql(expected);
            });

            it('should set the `hasFileConfig` option to true when the file config is loaded', function() {
                var path = `${this.tmpDir.name}/config/production/settings.conf.json5`;
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

                data = this.config.$getFileOptions(`${this.tmpDir.name}/config/settings.conf.json5`);
                data.should.be.eql({});
                this.config.hasFileConfig.should.be.equal(false);
            });

            it('should throw a SyntaxError when there is a problem with parsing json5 config file', function() {
                var configPath = `${this.tmpDir.name}/config/config.json5`;

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
                var defaults = this.config.nconf.stores.defaults.store;
                defaults.should.be.eql({
                    fileConfigPath: null,
                    type: 'literal'
                });
            });

            it('should overwrite file config options by those defined as shell positional arguments', function() {
                var path = `${this.tmpDir.name}/config/production/settings.conf.json5`;

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


                var defaults = this.config.nconf.stores.defaults.store;
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
                    }
                });
            });
        });

        describe('get', function() {
            before(function() {
                this.getSpy = sinon.spy(this.config.nconf, 'get');
            });

            it('should call nconf.get method with provide property path', function() {
                var propPath = 'couchbase:host';
                this.config.get(propPath);
                this.getSpy.should.have.been.calledOnce;
                this.getSpy.should.have.been.calledWith(propPath);
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

        describe('shell positional argument', function() {
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
