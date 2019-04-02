var path = require("path");
var fs = require("fs");
var eachSeries = require("async/eachSeries");
const Config = require("truffle-config");

function FS(working_directory, contracts_build_directory) {
  this.working_directory = working_directory;
  this.contracts_build_directory = contracts_build_directory;
  this.truffle_directory = Config.detect().truffle_directory;
  this.contracts_directory = Config.detect().contracts_directory;
  this.test_directory = Config.detect().test_directory;
}

FS.prototype.require = function(import_path, search_path) {
  search_path = search_path || this.contracts_build_directory;

  // For Windows: Allow import paths to be either path separator ('\' or '/')
  // by converting all '/' to the default (path.sep);
  import_path = import_path.replace(/\//g, path.sep);

  var contract_name = this.getContractName(import_path, search_path); //not really getting contract name anymore
  console.log("contract_name", contract_name);

  console.log("import_path again:", import_path);

  // If we have an absoulte path, only check the file if it's a child of the working_directory.
  if (path.isAbsolute(import_path)) {
    if (import_path.indexOf(this.working_directory) !== 0) {
      return null;
    }
    //    import_path = import_path.replace(this.working_directory, "");
    //console.log("this working dir:", this.working_directory)
    //console.log("this contracts dir:", this.contracts_directory)
    //    console.log("this contracts_dir", this.contracts_build_directory)
    import_path = import_path.replace(this.contracts_directory, "");
    import_path = import_path.replace(this.working_directory, "");

    console.log("updated import_path:", import_path);

    contract_name = import_path.replace(/[.].+/, ""); //this.getContractName(import_path, search_path)
    //console.log("new contract_name:", contract_name)
  }

  try {
    var result = fs.readFileSync(
      path.join(search_path, contract_name + ".json"),
      "utf8"
    );
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
};

FS.prototype.getContractName = function(
  sourcePath,
  searchPath = this.contracts_build_directory
) {
  //console.log("searchPath??", searchPath)

  const glob = require("glob");
  const pattern = path.join(searchPath, "**/*.json");

  const filePaths = glob.sync(pattern);

  console.log("filePaths", filePaths);

  for (var i = 0; i < filePaths.length; i++) {
    var filePath = filePaths[i];

    var artifact = JSON.parse(fs.readFileSync(path.resolve(filePath)));

    //      console.log(artifact.sourcePath, sourcePath)
    /*const relativePath = path.relative(
        //        this.contracts_build_directory, artifact.sourcePath
        artifact.sourcePath, sourcePath
        //sourcePath
      );*/

    // TODO RENAME TO MORE OF A GETRELATIVEPATH

    console.log("searchPath:", searchPath);
    console.log("sourcePath to begin with:", sourcePath);
    console.log("artifact.sourcePath:", artifact.sourcePath);
    console.log("artifact.relativePath:", artifact.relativePath);

    let rebuiltPath;
    let newSourcePath;

    /*      if (sourcePath.startsWith("truffle/"))  {
        if (sourcePath === artifact.sourcePath) return sourcePath.replace(/[.].+/, "");
        //        if (sourcePath.includes("SafeSend")) 
        //console.log("truffleDir!:", this.truffle_directory)//rebuiltPath = path.resolve()
        newSourcePath = `build/${path.basename(sourcePath)}`
        //console.log("new sourcePath", newSourcePath)
        rebuiltPath = path.resolve(this.truffle_directory, newSourcePath)
      } else {
        rebuiltPath = path.resolve(this.working_directory, sourcePath)
      }*/

    //      const relativePath = path.relative(this.working_directory, artifact.sourcePath)
    //sourcePath = path.resolve(this.working_directory, relativePath)

    //console.log("rebuiltPath:", rebuiltPath)

    //      console.log(relativePath)

    //console.log(this.working_directory)

    /*      if (artifact.sourcePath === rebuiltPath) {
        if (newSourcePath) sourcePath = `truffle/${newSourcePath}`;
        //        console.log("sourcePath.replace", sourcePath.replace(/[.].+/, ""))
      return sourcePath.replace(/[.].+/, "");
    }*/
    if (artifact.relativePath === sourcePath) {
      return artifact.relativePath;
    }
  }

  // fallback
  return path.basename(sourcePath, ".sol");
};

FS.prototype.resolve = function(import_path, imported_from, callback) {
  imported_from = imported_from || "";

  var possible_paths = [
    import_path,
    path.join(path.dirname(imported_from), import_path)
  ];

  //console.log("possible_paths being resolved:", possible_paths)

  var resolved_body = null;
  var resolved_path = null;

  eachSeries(
    possible_paths,
    function(possible_path, finished) {
      if (resolved_body != null) {
        return finished();
      }

      // Check the expected path.
      fs.readFile(possible_path, { encoding: "utf8" }, function(err, body) {
        // If there's an error, that means we can't read the source even if
        // it exists. Treat it as if it doesn't by ignoring any errors.
        // body will be undefined if error.
        if (body) {
          resolved_body = body;
          resolved_path = possible_path;
        }

        return finished();
      });
    },
    function(err) {
      //console.log("err here?")
      if (err) return callback(err);
      callback(null, resolved_body, resolved_path);
    }
  );
};

// Here we're resolving from local files to local files, all absolute.
FS.prototype.resolve_dependency_path = function(import_path, dependency_path) {
  var dirname = path.dirname(import_path);
  //console.log("whoa dirname:", dirname)
  //console.log(path.resolve(path.join(dirname, dependency_path)));
  return path.resolve(path.join(dirname, dependency_path));
};

module.exports = FS;
