const Mocha = require("mocha");
const chai = require("chai");
const path = require("path");
const Web3 = require("web3");
const Config = require("truffle-config");
const Contracts = require("truffle-workflow-compile");
const Resolver = require("truffle-resolver");
const TestRunner = require("./testing/testrunner");
const TestResolver = require("./testing/testresolver");
const TestSource = require("./testing/testsource");
const SolidityTest = require("./testing/soliditytest");
const expect = require("truffle-expect");
const Migrate = require("truffle-migrate");
const Profiler = require("truffle-compile/profiler.js");
const originalrequire = require("original-require");

chai.use(require("./assertions"));

const Test = {
  run: (options, callback) => {
    const self = this;

    expect.options(options, [
      "contracts_directory",
      "contracts_build_directory",
      "migrations_directory",
      "test_files",
      "network",
      "network_id",
      "provider"
    ]);

    const config = Config.default().merge(options);

    config.test_files = config.test_files.map(test_file =>
      path.resolve(test_file)
    );

    // `accounts` will be populated before each contract() invocation
    // and passed to it so tests don't have to call it themselves.
    const web3 = new Web3();
    web3.setProvider(config.provider);

    // Override console.warn() because web3 outputs gross errors to it.
    // e.g., https://github.com/ethereum/web3.js/blob/master/lib/web3/allevents.js#L61
    // Output looks like this during tests: https://gist.github.com/tcoulter/1988349d1ec65ce6b958
    const warn = config.logger.warn;
    config.logger.warn = function(message) {
      if (message === "cannot find event for log") {
        return;
      } else {
        if (warn) {
          warn.apply(console, arguments);
        }
      }
    };

    const mocha = this.createMocha(config);

    const js_tests = config.test_files.filter(
      file => path.extname(file) !== ".sol"
    );

    const sol_tests = config.test_files.filter(
      file => path.extname(file) === ".sol"
    );

    // Add Javascript tests because there's nothing we need to do with them.
    // Solidity tests will be handled later.
    js_tests.forEach(file => {
      // There's an idiosyncracy in Mocha where the same file can't be run twice
      // unless we delete the `require` cache.
      // https://github.com/mochajs/mocha/issues/995
      delete originalrequire.cache[file];

      mocha.addFile(file);
    });

    let dependency_paths = [];
    let testContracts = [];
    let accounts = [];
    let runner;
    let test_resolver;

    web3.eth
      .getAccounts()
      .then(accs => {
        accounts = accs;

        if (!config.resolver) {
          config.resolver = new Resolver(config);
        }

        const test_source = new TestSource(config);
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
      .then(paths => {
        dependency_paths = paths;

        testContracts = sol_tests.map(test_file_path => {
          const built_name = `./${path.basename(test_file_path)}`;
          return test_resolver.require(built_name);
        });

        runner = new TestRunner(config);

        return self.performInitialDeploy(config, test_resolver);
      })
      .then(() =>
        self.defineSolidityTests(mocha, testContracts, dependency_paths, runner)
      )
      .then(() => self.setJSTestGlobals(web3, accounts, test_resolver, runner))
      .then(() => {
        // Finally, run mocha.
        process.on("unhandledRejection", reason => {
          throw reason;
        });

        mocha.run(failures => {
          config.logger.warn = warn;

          callback(failures);
        });
      })
      .catch(callback);
  },

  createMocha: config => {
    // Allow people to specify config.mocha in their config.
    const mochaConfig = config.mocha || {};

    // If the command line overrides color usage, use that.
    if (config.colors != null) {
      mochaConfig.useColors = config.colors;
    }

    // Default to true if configuration isn't set anywhere.
    if (mochaConfig.useColors == null) {
      mochaConfig.useColors = true;
    }

    const mocha = new Mocha(mochaConfig);

    return mocha;
  },

  compileContractsWithTestFilesIfNeeded: (
    solidity_test_files,
    config,
    test_resolver
  ) =>
    new Promise((accept, reject) => {
      Profiler.updated(
        config.with({
          resolver: test_resolver
        }),
        (err, updated) => {
          if (err) return reject(err);

          updated = updated || [];

          // Compile project contracts and test contracts
          Contracts.compile(
            config.with({
              all: config.compileAll === true,
              files: updated.concat(solidity_test_files),
              resolver: test_resolver,
              quiet: false,
              quietWrite: true
            }),
            (err, { outputs }) => {
              if (err) return reject(err);
              const paths = outputs.solc;
              accept(paths);
            }
          );
        }
      );
    }),

  performInitialDeploy: (config, resolver) =>
    new Promise((accept, reject) => {
      Migrate.run(
        config.with({
          reset: true,
          resolver,
          quiet: true
        }),
        err => {
          if (err) return reject(err);
          accept();
        }
      );
    }),

  defineSolidityTests: (mocha, contracts, dependency_paths, runner) =>
    new Promise(accept => {
      contracts.forEach(contract => {
        SolidityTest.define(contract, dependency_paths, runner, mocha);
      });

      accept();
    }),

  setJSTestGlobals: (web3, accounts, test_resolver, runner) =>
    new Promise(accept => {
      global.web3 = web3;
      global.assert = chai.assert;
      global.expect = chai.expect;
      global.artifacts = {
        require(import_path) {
          return test_resolver.require(import_path);
        }
      };

      const template = function(tests) {
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

      global.contract = (name, tests) => {
        Mocha.describe(`Contract: ${name}`, function() {
          template.bind(this, tests)();
        });
      };

      global.contract.only = (name, tests) => {
        Mocha.describe.only(`Contract: ${name}`, function() {
          template.bind(this, tests)();
        });
      };

      global.contract.skip = (name, tests) => {
        Mocha.describe.skip(`Contract: ${name}`, function() {
          template.bind(this, tests)();
        });
      };

      accept();
    })
};

module.exports = Test;
