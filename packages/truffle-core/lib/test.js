var Mocha = require("mocha");
var chai = require("chai");
var path = require("path");
var Web3 = require("web3");
var Config = require("truffle-config");
var Contracts = require("truffle-workflow-compile");
var Resolver = require("truffle-resolver");
var TestRunner = require("./testing/testrunner");
var TestResolver = require("./testing/testresolver");
var TestSource = require("./testing/testsource");
var SolidityTest = require("./testing/soliditytest");
var expect = require("truffle-expect");
var Migrate = require("truffle-migrate");
var Profiler = require("truffle-compile/profiler.js");
var originalrequire = require("original-require");

chai.use(require("./assertions"));

var Test = {
  run: function(options, callback) {
    var self = this;

    expect.options(options, [
      "contracts_directory",
      "contracts_build_directory",
      "migrations_directory",
      "test_files",
      "network",
      "network_id",
      "provider"
    ]);

    var config = Config.default().merge(options);

    config.test_files = config.test_files.map(function(test_file) {
      return path.resolve(test_file);
    });

    // `accounts` will be populated before each contract() invocation
    // and passed to it so tests don't have to call it themselves.
    var web3 = new Web3();
    web3.setProvider(config.provider);

    // Override console.warn() because web3 outputs gross errors to it.
    // e.g., https://github.com/ethereum/web3.js/blob/master/lib/web3/allevents.js#L61
    // Output looks like this during tests: https://gist.github.com/tcoulter/1988349d1ec65ce6b958
    var warn = config.logger.warn;
    config.logger.warn = function(message) {
      if (message === "cannot find event for log") {
        return;
      } else {
        if (warn) {
          warn.apply(console, arguments);
        }
      }
    };

    var mocha = this.createMocha(config);

    var js_tests = config.test_files.filter(function(file) {
      return path.extname(file) !== ".sol";
    });

    var sol_tests = config.test_files.filter(function(file) {
      return path.extname(file) === ".sol";
    });

    //console.log("sol_tests", sol_tests)

    // Add Javascript tests because there's nothing we need to do with them.
    // Solidity tests will be handled later.
    js_tests.forEach(function(file) {
      // There's an idiosyncracy in Mocha where the same file can't be run twice
      // unless we delete the `require` cache.
      // https://github.com/mochajs/mocha/issues/995
      delete originalrequire.cache[file];

      mocha.addFile(file);
    });

    var dependency_paths = [];
    var testContracts = [];
    var accounts = [];
    var runner;
    var test_resolver;

    this.getAccounts(web3)
      .then(function(accs) {
        accounts = accs;

        if (!config.resolver) {
          config.resolver = new Resolver(config);
        }

        var test_source = new TestSource(config);
        test_resolver = new TestResolver(
          config.resolver,
          test_source,
          config.contracts_build_directory
        );
        test_resolver.cache_on = false;

        return self.compileContractsWithTestFilesIfNeeded(
          sol_tests,
          config,
          test_resolver
        );
      })
      .then(function(paths) {
        dependency_paths = paths;

        testContracts = sol_tests.map(function(test_file_path) {
          // OG
          //var built_name = "./" + path.basename(test_file_path);
          //return test_resolver.require(built_name);
          //
          console.log("test_file_path:", test_file_path);
          //console.log("config.contracts_directory", config.contracts_directory)
          const testRelativePath = path.relative(
            config.working_directory,
            test_file_path
          );
          //console.log("test_file_path:", test_file_path)
          //          console.log("config.contracts_dir", config.contracts_directory)
          console.log("testRelativePath", testRelativePath);
          //var built_name = testRelativePath.substring(3);
          //          const example = testRelativePath.replace(/\.[^.$]+$/, '');
          //          console.log("example", example)

          //          var built_name = "./" + path.basename(testRelativePath);
          return test_resolver.require(testRelativePath.replace(/[.].+/, "")); //built_name)//testRelativePath);
        });

        //console.log("heyo!")

        runner = new TestRunner(config);
        //console.log("hiiii")

        //console.log("here those contracts bch", testContracts)
        //console.log("here the dep paths", dependency_paths)

        return self.performInitialDeploy(config, test_resolver);
      })
      .then(function() {
        return self.defineSolidityTests(
          //TODO
          mocha,
          testContracts,
          dependency_paths,
          runner
        );
      })
      .then(function() {
        //console.log("about to setJSTests")
        return self.setJSTestGlobals(web3, accounts, test_resolver, runner);
      })
      .then(function() {
        // Finally, run mocha.
        process.on("unhandledRejection", function(reason) {
          throw reason;
        });

        //console.log("about to mocha.run")

        mocha.run(function(failures) {
          config.logger.warn = warn;

          //console.log("inside mocha.run")

          callback(failures);
        });
        //console.log("after mocha.run")
      })
      .catch(callback);
  },

  createMocha: function(config) {
    // Allow people to specify config.mocha in their config.
    var mochaConfig = config.mocha || {};

    // If the command line overrides color usage, use that.
    if (config.colors != null) {
      mochaConfig.useColors = config.colors;
    }

    // Default to true if configuration isn't set anywhere.
    if (mochaConfig.useColors == null) {
      mochaConfig.useColors = true;
    }

    var mocha = new Mocha(mochaConfig);

    return mocha;
  },

  getAccounts: function(web3) {
    return new Promise(function(accept, reject) {
      web3.eth.getAccounts(function(err, accs) {
        if (err) return reject(err);
        accept(accs);
      });
    });
  },

  compileContractsWithTestFilesIfNeeded: function(
    solidity_test_files,
    config,
    test_resolver
  ) {
    return new Promise(function(accept, reject) {
      Profiler.updated(
        config.with({
          resolver: test_resolver
        }),
        function(err, updated) {
          if (err) return reject(err);
          //console.log("updated:", updated)

          updated = updated || [];

          // Compile project contracts and test contracts
          Contracts.compile(
            config.with({
              all: config.compileAll === true,
              files: updated.concat(solidity_test_files),
              resolver: test_resolver,
              quiet: false,
              quietWrite: true,
              tests: true
            }),
            function(err, result) {
              if (err) return reject(err);
              const paths = result.outputs.solc;
              accept(paths);
            }
          );
        }
      );
    });
  },

  performInitialDeploy: function(config, resolver) {
    return new Promise(function(accept, reject) {
      Migrate.run(
        config.with({
          reset: true,
          resolver: resolver,
          quiet: true
        }),
        function(err) {
          if (err) return reject(err);
          accept();
        }
      );
    });
  },

  defineSolidityTests: function(mocha, contracts, dependency_paths, runner) {
    return new Promise(function(accept) {
      contracts.forEach(function(contract) {
        SolidityTest.define(contract, dependency_paths, runner, mocha);
      });

      //console.log("all solidity tests defined!")

      accept();
    });
  },

  setJSTestGlobals: function(web3, accounts, test_resolver, runner) {
    return new Promise(function(accept) {
      global.web3 = web3;
      global.assert = chai.assert;
      global.expect = chai.expect;
      global.artifacts = {
        require: function(import_path) {
          return test_resolver.require(import_path);
        }
      };

      var template = function(tests) {
        this.timeout(runner.TEST_TIMEOUT);

        before("prepare suite", function(done) {
          this.timeout(runner.BEFORE_TIMEOUT);
          runner.initialize(done);
        });

        beforeEach("before test", function(done) {
          runner.startTest(this, done);
        });

        afterEach("after test", function(done) {
          runner.endTest(this, done);
        });

        tests(accounts);
      };

      //console.log("template declared")

      global.contract = function(name, tests) {
        Mocha.describe("Contract: " + name, function() {
          template.bind(this, tests)();
        });
      };

      global.contract.only = function(name, tests) {
        Mocha.describe.only("Contract: " + name, function() {
          template.bind(this, tests)();
        });
      };

      global.contract.skip = function(name, tests) {
        Mocha.describe.skip("Contract: " + name, function() {
          template.bind(this, tests)();
        });
      };

      //console.log("JS tests defined!")

      accept();
    });
  }
};

module.exports = Test;
