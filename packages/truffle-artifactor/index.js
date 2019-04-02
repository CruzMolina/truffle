var Schema = require("truffle-contract-schema");
var fs = require("fs-extra");
var path = require("path");
var _ = require("lodash");
const Config = require("truffle-config");
var debug = require("debug")("artifactor");

function Artifactor(destination) {
  this.destination = destination;
  this.contracts_directory = Config.detect().contracts_directory;
}

Artifactor.prototype.save = function(object, testCompilation) {
  var self = this;

  return new Promise(function(accept, reject) {
    //console.log("object before normalize", object)
    object = Schema.normalize(object);
    //console.log("object after normalize", object)

    if (object.contractName == null) {
      return reject(new Error("You must specify a contract name."));
    }

    //const config = Config.detect();
    //console.log("here is destination:", self.destination)
    //console.log("here is the sourcePath:", object.sourcePath)
    //let output_path = object.sourcePath.replace(/[.].+/, '')
    //const relative = path.relative(config.contracts_directory, output_path)
    //console.log("here's the relative path!", relative)
    //console.log("here is parsed output_path:", output_path)
    let output_path;
    /*if (testCompilation) {

      const cleanSourcePath = object.sourcePath.replace(/[.].+/, "");
      const relativePath = path.relative(
      self.contracts_directory,
      cleanSourcePath
      );
      const testPath = relativePath.substring(1)
      output_path = path.resolve(self.destination, testPath)
      console.log("resolved to this:", output_path)
    } else {*/
    //    let output_path = object.relativePath
    /* CURRENT SOLUTION
    const cleanSourcePath = object.sourcePath.replace(/[.].+/, "");
    const relativePath = path.relative(
      self.contracts_directory,
      cleanSourcePath
    ); 

    if (testCompilation) {
      let testPath = object.relativePath.substring(1)
      //console.log("the testPath:", testPath)
      if (testPath.includes("/truffle/packages/truffle/build/")) testPath = `truffle/build/${path.basename(testPath)}`
        output_path = path.resolve(self.destination, testPath)
    } else {
    //console.log(output_path)
    //console.log(object) // TODO ADD TO SCHEMA!!!!!

    // Create new path off of destination.
    output_path = path.resolve(self.destination, relativePath);
    }*/

    //console.log("new path of output_path", output_path); */
    //
    console.log(object.relativePath);
    output_path = path.resolve(self.destination, object.relativePath);

    console.log("output_path", output_path);

    // Add json extension.
    output_path = output_path + ".json";

    fs.readFile(output_path, { encoding: "utf8" }, function(err, json) {
      // No need to handle the error. If the file doesn't exist then we'll start afresh
      // with a new object.

      var finalObject = object;

      if (!err) {
        var existingObjDirty;
        try {
          existingObjDirty = JSON.parse(json);
        } catch (e) {
          reject(e);
        }

        // normalize existing and merge into final
        finalObject = Schema.normalize(existingObjDirty);

        // merge networks
        var finalNetworks = {};
        _.merge(finalNetworks, finalObject.networks, object.networks);

        // update existing with new
        _.assign(finalObject, object);
        finalObject.networks = finalNetworks;
      }

      // update timestamp
      finalObject.updatedAt = new Date().toISOString();

      // output object
      fs.outputFile(
        output_path,
        JSON.stringify(finalObject, null, 2),
        "utf8",
        function(err) {
          if (err) return reject(err);
          accept();
        }
      );
    });
  });
};

Artifactor.prototype.saveAll = function(objects, testCompilation) {
  var self = this;

  if (Array.isArray(objects)) {
    var array = objects;
    objects = {};

    array.forEach(function(item) {
      objects[item.contract_name] = item;
    });
  }

  return new Promise(function(accept, reject) {
    fs.stat(self.destination, function(err, stat) {
      if (err) {
        return reject(
          new Error("Desination " + self.destination + " doesn't exist!")
        );
      }
      accept();
    });
  }).then(function() {
    var promises = [];

    Object.keys(objects).forEach(function(contract) {
      var object = objects[contract];
      //      var object = objects[contractFilePath];
      //      object.contractName = objects[contract].contractName
      //      object.contractFilePath = objects[contractFilePath].contractName;
      //console.log("this is the object", object);
      console.log("this is the boolean", testCompilation);
      promises.push(self.save(object, testCompilation));
    });

    return Promise.all(promises);
  });
};

module.exports = Artifactor;
