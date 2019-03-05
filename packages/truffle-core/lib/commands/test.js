const command = {
  command: "test",
  description: "Run JavaScript and Solidity tests",
  builder: {
    "show-events": {
      describe: "Show all test logs",
      type: "boolean",
      default: false
    }
  },
  help: {
    usage:
      "truffle test [<test_file>] [--compile-all] [--network <name>] [--verbose-rpc] [--show-events]",
    options: [
      {
        option: "<test_file>",
        description:
          "Name of the test file to be run. Can include path information if the file " +
          "does not exist in the\n                    current directory."
      },
      {
        option: "--compile-all",
        description:
          "Compile all contracts instead of intelligently choosing which contracts need " +
          "to be compiled."
      },
      {
        option: "--network <name>",
        description:
          "Specify the network to use, using artifacts specific to that network. Network " +
          "name must exist\n                    in the configuration."
      },
      {
        option: "--verbose-rpc",
        description:
          "Log communication between Truffle and the Ethereum client."
      },
      {
        option: "--show-events",
        description: "Log all contract events."
      }
    ]
  },
  run: (options, done) => {
    const OS = require("os");
    const dir = require("node-dir");
    const temp = require("temp");
    const path = require("path");
    const Config = require("truffle-config");
    const Artifactor = require("truffle-artifactor");
    const Develop = require("../develop");
    const Test = require("../test");
    const fs = require("fs");
    const copy = require("../copy");
    const Environment = require("../environment");

    const config = Config.detect(options);

    // if "development" exists, default to using that for testing
    if (!config.network && config.networks.development) {
      config.network = "development";
    }

    if (!config.network) {
      config.network = "test";
    }

    let ipcDisconnect;
    let files = [];

    if (options._.length > 0) {
      files = options._;
    }

    if (files.length === 0) {
      files = dir.files(config.test_directory, { sync: true });
    }

    files = files.filter(
      file => file.match(config.test_file_extension_regexp) !== null
    );

    files.forEach(file => {
      if (!fs.existsSync(file))
        throw new Error(
          `Cannot find module '${path.join(config.working_directory, file)}'`
        );
    });

    const tempDir = temp.mkdirSync("test-");

    const cleanup = () => {
      temp.cleanupSync();
      if (ipcDisconnect) {
        ipcDisconnect();
      }
      done();
    };

    const run = () => {
      // Set a new artifactor; don't rely on the one created by Environments.
      // TODO: Make the test artifactor configurable.
      config.artifactor = new Artifactor(tempDir);

      Test.run(
        config.with({
          test_files: files,
          contracts_build_directory: tempDir
        }),
        cleanup
      );
    };

    const environmentCallback = err => {
      if (err) return done(err);
      // Copy all the built files over to a temporary directory, because we
      // don't want to save any tests artifacts. Only do this if the build directory
      // exists.
      fs.stat(config.contracts_build_directory, err => {
        if (err) return run();

        copy(config.contracts_build_directory, tempDir, err => {
          if (err) return done(err);

          config.logger.log(`Using network '${config.network}'.${OS.EOL}`);

          run();
        });
      });
    };

    if (config.networks[config.network]) {
      Environment.detect(config, environmentCallback);
    } else {
      const ipcOptions = {
        network: "test"
      };

      const ganacheOptions = {
        host: "127.0.0.1",
        port: 7545,
        network_id: 4447,
        mnemonic:
          "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
        gasLimit: config.gas,
        noVMErrorsOnRPCResponse: true
      };

      Develop.connectOrStart(
        ipcOptions,
        ganacheOptions,
        (started, disconnect) => {
          ipcDisconnect = disconnect;
          Environment.develop(config, ganacheOptions, environmentCallback);
        }
      );
    }
  }
};

module.exports = command;
