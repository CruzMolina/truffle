const TestCase = require("mocha/lib/test.js");
const Suite = require("mocha/lib/suite.js");
const Deployer = require("truffle-deployer");
const find_contracts = require("truffle-contract-sources");
const compile = require("truffle-compile");
const abi = require("web3-eth-abi");
const series = require("async").series;
const path = require("path");
const semver = require("semver");

let SafeSend;

const SolidityTest = {
  define(abstraction, dependency_paths, runner, mocha) {
    const self = this;

    //console.log("abstraction.contract_name", abstraction.contract_name)

    const suite = new Suite(abstraction.contract_name, {});
    suite.timeout(runner.BEFORE_TIMEOUT);

    //console.log("about to do prepare suite")

    // Set up our runner's needs first.
    suite.beforeAll("prepare suite", function(done) {
      series(
        [
          runner.initialize.bind(runner),
          self.compileNewAbstractInterface.bind(this, runner),
          self.deployTestDependencies.bind(
            this,
            abstraction,
            dependency_paths,
            runner
          )
        ],
        done
      );
    });

    //console.log("about to do before test")

    suite.beforeEach("before test", function(done) {
      runner.startTest(this, done);
    });

    //console.log("after beforeEach before test")

    // Function that decodes raw logs from unlinked third party assertion
    // libraries and returns usable TestEvent logs
    function decodeTestEvents(result) {
      if (result.logs.length) return result.logs;

      const logs = [];
      const signature = web3.utils.sha3("TestEvent(bool,string)");

      result.receipt.logs.forEach(log => {
        if (log.topics.length === 2 && log.topics[0] === signature) {
          const decoded = {
            event: "TestEvent",
            args: {
              result: abi.decodeLog(["bool"], log.topics[1], log.topics)[0],
              message: abi.decodeLog(["string"], log.data, log.topics)[0]
            }
          };
          logs.push(decoded);
        }
      });
      return logs;
    }

    // Function that checks transaction logs to see if a test failed.
    function processResult(result) {
      result.logs = decodeTestEvents(result);

      result.logs.forEach(log => {
        if (log.event === "TestEvent" && !log.args.result)
          throw new Error(log.args.message);
      });
    }

    // Add functions from test file.
    abstraction.abi.forEach(item => {
      if (item.type !== "function") return;

      ["beforeAll", "beforeEach", "afterAll", "afterEach"].forEach(fn_type => {
        if (item.name.indexOf(fn_type) === 0) {
          suite[fn_type](item.name, () => {
            return abstraction
              .deployed()
              .then(deployed => {
                return deployed[item.name]();
              })
              .then(processResult);
          });
        }
      });

      if (item.name.indexOf("test") === 0) {
        const test = new TestCase(item.name, () => {
          return abstraction
            .deployed()
            .then(deployed => {
              return deployed[item.name]();
            })
            .then(processResult);
        });

        test.timeout(runner.TEST_TIMEOUT);
        suite.addTest(test);
      }
    });

    //console.log("before afterEach suite")

    suite.afterEach("after test", function(done) {
      runner.endTest(this, done);
    });

    //console.log("after afterEach suite")

    //console.log("before mocha addSuite")

    mocha.suite.addSuite(suite);
    //console.log("suite added!")
  },

  compileNewAbstractInterface(runner, callback) {
    find_contracts(runner.config.contracts_directory, (err, files) => {
      if (err) return callback(err);

      //console.log("find_contracts files", files)

      const config = runner.config;
      if (!config.compilers.solc.version) SafeSend = "NewSafeSend.sol";
      else if (semver.lt(semver.coerce(config.compilers.solc.version), "0.5.0"))
        SafeSend = "OldSafeSend.sol";
      else SafeSend = "NewSafeSend.sol";

      compile.with_dependencies(
        runner.config.with({
          paths: [
            path.join(__dirname, "Assert.sol"),
            path.join(__dirname, "AssertAddress.sol"),
            path.join(__dirname, "AssertAddressArray.sol"),
            // path.join(__dirname, "AssertAddressPayableArray.sol"), only compatible w/ ^0.5.0
            path.join(__dirname, "AssertBalance.sol"),
            path.join(__dirname, "AssertBool.sol"),
            path.join(__dirname, "AssertBytes32.sol"),
            path.join(__dirname, "AssertBytes32Array.sol"),
            path.join(__dirname, "AssertGeneral.sol"),
            path.join(__dirname, "AssertInt.sol"),
            path.join(__dirname, "AssertIntArray.sol"),
            path.join(__dirname, "AssertString.sol"),
            path.join(__dirname, "AssertUint.sol"),
            path.join(__dirname, "AssertUintArray.sol"),
            "truffle/DeployedAddresses.sol", // generated by deployed.js
            path.join(__dirname, SafeSend)
          ],
          quiet: true
        }),
        (err, contracts) => {
          if (err) return callback(err);

          // Set network values.
          Object.keys(contracts).forEach(name => {
            contracts[name].network_id = runner.config.network_id;
            contracts[name].default_network = runner.config.default_network;
          });

          //console.log("contracts about to run through:", contracts)

          runner.config.artifactor
            .saveAll(contracts, true) // testCompilation
            .then(() => {
              callback();
            })
            .catch(callback);
        }
      );
    });
  },

  deployTestDependencies(abstraction, dependency_paths, runner, callback) {
    const deployer = new Deployer(
      runner.config.with({
        logger: { log() {} }
      })
    );

    const testLibraries = [
      "Assert",
      "AssertAddress",
      "AssertAddressArray",
      //      "AssertAddressPayableArray", only compatible w/ ^0.5.0
      "AssertBalance",
      "AssertBool",
      "AssertBytes32",
      "AssertBytes32Array",
      "AssertGeneral",
      "AssertInt",
      "AssertIntArray",
      "AssertString",
      "AssertUint",
      "AssertUintArray",
      "DeployedAddresses"
    ];

    const testAbstractions = testLibraries.map(name =>
      runner.config.resolver.require(`truffle/${name}.sol`)
    );

    SafeSend = runner.config.resolver.require(`truffle/${SafeSend}`);

    for (const testLib of testAbstractions) {
      deployer.deploy(testLib);
      deployer.link(testLib, abstraction);
    }

    dependency_paths.forEach(dependency_path => {
      const dependency = runner.config.resolver.require(dependency_path);

      if (dependency.isDeployed()) deployer.link(dependency, abstraction);
    });

    let deployed;
    deployer
      .deploy(abstraction)
      .then(() => {
        return abstraction.deployed();
      })
      .then(instance => {
        deployed = instance;
        if (deployed.initialBalance) {
          return deployed.initialBalance.call();
        } else {
          return 0;
        }
      })
      .then(balance => {
        if (balance !== 0) {
          return deployer
            .deploy(SafeSend, deployed.address, {
              value: balance
            })
            .then(() => {
              return SafeSend.deployed();
            })
            .then(safesend => {
              return safesend.deliver();
            });
        }
      });

    deployer
      .start()
      .then(() => {
        callback();
      })
      .catch(callback);
  }
};

module.exports = SolidityTest;
