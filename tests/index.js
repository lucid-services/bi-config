var fs           = require('fs');
var rewire       = require('rewire');
var sinon        = require('sinon');
var chai         = require('chai');
var sinonChai    = require("sinon-chai");
var tmp          = require('tmp');
var childProcess = require('child_process');
var json5        = require('json5');

ConfigError = require('../lib/error/configError.js');

// adds .json5 loader require.extension
require('json5/lib/require');

var expect = chai.expect;

chai.use(sinonChai);
chai.should();

describe('Config', function() {
    before(function() {
        this.configFileContent = `{
            couchbase: {
                host: 'localhost',
                buckets: {
                    main: {
                        bucket: 'test'
                    }
                }
            },
            failOnErr: true,
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
        fs.writeFileSync(
            `${tmpDir.name}/config/settings.conf.json5`,
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
                    `${cwd}/${this.config.$getNodeEnvVar()}/config/settings.conf.json5`
                );
            });
        });

        describe('$getFileOptions', function() {
            it('should return loaded json5 file for given file path', function() {
                var data = this.config.$getFileOptions(`${this.tmpDir.name}/config/settings.conf.json5`);
                data.should.be.eql(this.configData);
            });

            it('should set the `hasFileConfig` option to true when the file config is loaded', function() {
                this.config.$getFileOptions(`${this.tmpDir.name}/config/settings.conf.json5`);
                this.config.hasFileConfig.should.be.equal(true);
            });

            it('should set the `hasFileConfig` to false when an error occurs while loading a file', function() {
                var error = new Error('test error');
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
                            'config',
                            '"incorrect/config/option"'
                        ],
                        config: 'path/to/config/file'
                    }
                });

                this.config.$getShellOptions().should.be.eql({
                    config: 'path/to/config/file'
                });
            });

            it('should not include reserved `config` option if included as a positional argument', function() {
                this.config.__set__({
                    argv: {
                        _: [
                            'config',
                            '"incorrect/config/option"'
                        ]
                    }
                });

                this.config.$getShellOptions().should.be.eql({});
            });
        });

        describe('initialize', function() {
            
        });
    });

    describe('as cli app', function() {
        before(function() {
            
        });
    });
});
