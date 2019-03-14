var Deployed = require("./deployed");
var path = require("path");
var fs = require("fs");
var contract = require("truffle-contract");
var find_contracts = require("truffle-contract-sources");

function TestSource(config) {
  this.config = config;
}

TestSource.prototype.require = function() {
  return null; // FSSource will get it.
};

TestSource.prototype.resolve = function(import_path, callback) {
  var self = this;

  if (import_path === "truffle/DeployedAddresses.sol") {
    return find_contracts(this.config.contracts_directory, function(
      err,
      source_files
    ) {
      // Ignore this error. Continue on.

      fs.readdir(self.config.contracts_build_directory, function(
        err,
        abstraction_files
      ) {
        if (err) return callback(err);

        var mapping = {};
        let vy = false;

        var blacklist = ["Assert", "DeployedAddresses"];

        // Ensure we have a mapping for source files and abstraction files
        // to prevent any compile errors in tests.
        source_files.forEach(function(file) {
          var name = path.basename(file, ".sol");
          var otherName = path.basename(file, ".vy");
          if (blacklist.indexOf(otherName >= 0)) return;
          if (blacklist.indexOf(name) >= 0) return;
          mapping[name] = false;
        });

        abstraction_files.forEach(function(file) {
          var name = path.basename(file, ".json");
          if (blacklist.indexOf(name) >= 0) return;
          mapping[name] = false;
        });

        var promises = abstraction_files.map(function(file) {
          return new Promise(function(accept, reject) {
            fs.readFile(
              path.join(self.config.contracts_build_directory, file),
              "utf8",
              function(err, body) {
                if (err) return reject(err);
                accept(body);
              }
            );
          });
        });

        Promise.all(promises)
          .then(function(files_data) {
            var addresses = files_data
              .map(function(data) {
                return JSON.parse(data);
              })
              .map(function(json) {
                console.log("json!", json);
                if (path.extname(json.sourcePath) === ".vy") vy = true;
                return contract(json);
              })
              .map(function(c) {
                c.setNetwork(self.config.network_id);
                if (c.isDeployed()) {
                  return c.address;
                }
                return null;
              });

            addresses.forEach(function(address, i) {
              var name = path.basename(abstraction_files[i], ".json");

              if (blacklist.indexOf(name) >= 0) return;

              mapping[name] = address;
            });

            console.log("mapping:", mapping);

            //            if (vy) return Deployed.makeVyperDeployedAddressesLibrary(mapping)

            return Deployed.makeSolidityDeployedAddressesLibrary(mapping);
          })
          .then(function(addressSource) {
            callback(null, addressSource, import_path);
          })
          .catch(callback);
      });
    });
  }
  const assertLibraries = [
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
    "AssertUintArray"
  ];

  for (const lib of assertLibraries) {
    if (import_path === `truffle/${lib}.sol`)
      return fs.readFile(
        path.resolve(path.join(__dirname, `${lib}.sol`)),
        { encoding: "utf8" },
        (err, body) => callback(err, body, import_path)
      );
  }

  return callback();
};

TestSource.prototype.resolve_dependency_path = function(
  import_path,
  dependency_path
) {
  return dependency_path;
};

module.exports = TestSource;
