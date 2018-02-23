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

//this makes sinon-as-promised available in sinon:
require('sinon-as-promised');

var expect = chai.expect;

chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.should();

describe('Config', function() {
    before(function() {

        this.configFileContent = `
        const ENV = process.env;
        module.exports = {
            apps: {
                s2s: {
                    listen: ENV.S2S_PORT,
                    baseUrl: ENV.PRIVATE_VHOST_PROTOCOL + ENV.PRIVATE_VHOST + ENV.S2S_PORT,
                }
            },
            baseUrl: '127.0.0.1',
            failOnErr: false,
            listen: {
                public: 4000,
                private: 4001
            }
        };`;

        this.configFileContent = this.configFileContent.split('\n').reduce(function(newStr, line) {
            if (!line) {
                return newStr;
            }
            newStr += line.trim() + '\n';
            return newStr;
        }, '')

        tmp.setGracefulCleanup();
        var tmpDir = this.tmpDir = tmp.dirSync({unsafeCleanup: true});

        fs.mkdirSync(`${tmpDir.name}/config`);
        fs.writeFileSync(
            `${tmpDir.name}/config/config.js`,
            this.configFileContent
        );

        this.configData = require(`${tmpDir.name}/config/config.js`);
    });

    beforeEach(function() {
        this.config = rewire('../lib/index.js');
        this.config.initialize({fileConfigPath: `${this.tmpDir.name}/config/config.js`});
    });

    describe('as node module', function() {
        before(function() {
            this.processCwdStub = sinon.stub(process, 'cwd');
            this.processCwdStub.returns(this.tmpDir.name);
        });

        after(function() {
            this.processCwdStub.restore();
        });

        it('should exports nconf module', function() {
            this.config.should.have.property('nconf').that.is.an.instanceof(nconf.Provider);
        });

        describe('$getDefaultConfigPath', function() {
            it('should return default config absolute file path', function() {
                var cwd = this.tmpDir.name;

                this.processCwdStub.returns(cwd);
                this.config.$getDefaultConfigPath().should.be.equal(
                    `${cwd}/config/config.js`
                );
            });
        });

        describe('$getFileOptions', function() {
            it('should return configuration for given config.js file path', function() {
                var path = `${this.tmpDir.name}/config/config.js`;
                var data = this.config.$getFileOptions(path);
                var expected = _merge({}, this.configData);
                data.should.be.eql(expected);
            });

            it('should set the `hasFileConfig` option to true when the file config is loaded', function() {
                var path = `${this.tmpDir.name}/config/config.js`;
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

                data = this.config.$getFileOptions(`${this.tmpDir.name}/invalid/config.js`);
                data.should.be.eql({});
                this.config.hasFileConfig.should.be.equal(false);
            });

            it('should call path.resolve with provided config path', function() {
                var cfgPath = `../config/config.js`;
                var pathResolveSpy = sinon.spy(path, 'resolve');
                this.config.$getFileOptions(cfgPath);
                pathResolveSpy.should.have.been.calledWithExactly(cfgPath);

                pathResolveSpy.restore();
            });

            it('should throw a SyntaxError when there is a problem with parsing json5 config file', function() {
                var configPath = `${this.tmpDir.name}/config/invalid_config.js`;

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

        describe('isInitialized', function() {
            it('should return false', function() {
                let config = new this.config.Config();
                config.isInitialized().should.be.equal(false);
            });

            it('should return true', function() {
                this.config.initialize();
                this.config.isInitialized().should.be.equal(true);
            });
        });

        describe('initialize', function() {
            it('should setup default config object', function() {
                var defaults = this.config.stores.defaults.store;
                defaults.should.have.property('fileConfigPath').that.is.a('string');
                defaults.should.have.property('type', 'literal');
            });

            it('should overwrite config options by those passed to the method as the argument', function() {

                this.config.initialize({
                    failOnErr: true,
                    couchbase: {
                        host: '127.0.0.1:9999'
                    }
                });


                var defaults = this.config.stores.defaults.store;

                defaults.should.have.property('failOnErr').that.is.eql(true);
                defaults.should.have.property('couchbase').that.is.eql({
                    host: '127.0.0.1:9999'
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
                var propPath = 'listen';
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

        describe('createMemoryProvider', function() {
            it('should return new Provider object with provided config data', function() {
                var data = {
                    some: 'value'
                };
                var provider = this.config.createMemoryProvider(data);
                provider.should.be.instanceof(nconf.Provider);
                provider.get().should.be.eql(data);
            });

            it('should return object with getOrFail method', function() {
                var data = {
                    some: 'value'
                };
                var provider = this.config.createMemoryProvider(data);
                provider.should.be.instanceof(nconf.Provider);
                provider.should.have.property('getOrFail').that.is.a('function');
            });

            it('should set property in the config store', function() {
                var data = {
                    some: 'value'
                };
                var provider = this.config.createMemoryProvider(data);
                provider.set('prop', 'prop');
                provider.get('prop').should.be.equal('prop');
            });
        });

        describe('getInspectionSchema', function() {
            it('should have the getInspectionSchema method', function() {
                this.config.should.have.property('getInspectionSchema').that.is.a('function');
            });

            it('should return current "config_schema" ajv schema', function() {
                var schema = {
                    type: 'integer'
                };

                this.config.setInspectionSchema(schema);
                this.config.getInspectionSchema().should.be.eql(schema);
            });
        });

        describe('setInspectionSchema', function() {
            it('should have the setInspectionSchema method', function() {
                this.config.should.have.property('setInspectionSchema').that.is.a('function');
            });

            it('should overwrite currently set schema value', function() {
                this.config.setInspectionSchema({
                    type: 'object',
                    properties: {
                        prop: {type: 'string'},
                        prop2: {type: "integer"}
                    }
                });

                this.config.setInspectionSchema({
                    type: 'object',
                    properties: {
                        prop3: {type: "boolean"}
                    }
                });

                this.config.getInspectionSchema().should.be.eql({
                    type: 'object',
                    properties: {
                        prop3: {type: "boolean"}
                    }
                });
            });
        });

        describe('inspectIntegrity', function() {
            before(function() {
                this.schema = {
                    type: 'object',
                    properties: {
                        listen: {
                            type: 'object',
                            additionalProperties: {
                                type: 'object',
                                properties: {
                                    port: {type: 'integer'}
                                }
                            }
                        },
                        apps: {
                            type: 'object',
                            additionalProperties: {
                                type: 'object',
                                properties: {
                                    listen: {type: 'integer'},
                                    baseUrl: {type: 'string', format: 'uri'}
                                }
                            }
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
});
