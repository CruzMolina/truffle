// Compares .sol files to their .sol.js counterparts,
// determines which .sol files have been updated.

const path = require("path");
const async = require("async");
const fs = require("fs");
const Parser = require("./parser");
const CompilerSupplier = require("./compilerSupplier");
const expect = require("truffle-expect");
const find_contracts = require("truffle-contract-sources");
const debug = require("debug")("compile:profiler"); // eslint-disable-line no-unused-vars

module.exports = {
  updated(options, callback) {
    expect.options(options, ["resolver"]);

    const contracts_directory = options.contracts_directory;
    const build_directory = options.contracts_build_directory;

    function getFiles(done) {
      if (options.files) {
        done(null, options.files);
      } else {
        find_contracts(contracts_directory, done);
      }
    }

    const sourceFilesArtifacts = {};
    const sourceFilesArtifactsUpdatedTimes = {};

    const updatedFiles = [];

    async.series(
      [
        // Get all the source files and create an object out of them.
        c => {
          getFiles((err, files) => {
            if (err) return c(err);

            // Use an object for O(1) access.
            files.forEach(sourceFile => {
              sourceFilesArtifacts[sourceFile] = [];
            });

            c();
          });
        },
        // Get all the artifact files, and read them, parsing them as JSON
        c => {
          const glob = require("glob");
          const pattern = path.join(build_directory, "**/*.json");

          let build_files = glob.sync(pattern);
          async.map(
            build_files,
            (buildFile, finished) => {
              fs.readFile(
                buildFile,
                //path.join(build_directory, buildFile),
                "utf8",
                (err, body) => {
                  //                    console.log("path.join",path.join(build_directory, buildFile) )
                  if (err) return finished(err);
                  finished(null, body);
                }
              );
            },
            (err, jsonData) => {
              if (err) return c(err);

              try {
                for (let i = 0; i < jsonData.length; i++) {
                  const data = JSON.parse(jsonData[i]);

                  // In case there are artifacts from other source locations.
                  if (sourceFilesArtifacts[data.sourcePath] == null) {
                    sourceFilesArtifacts[data.sourcePath] = [];
                  }

                  sourceFilesArtifacts[data.sourcePath].push(data);
                }
              } catch (e) {
                //console.log("uh oh")
                return c(e);
              }

              c();
            }
          );
        },

        /*fs.readdir(build_directory, (err, build_files) => {
            if (err) {
              // The build directory may not always exist.
              if (err.message.includes("ENOENT: no such file or directory")) {
                // Ignore it.
                build_files = [];
              } else {
                return c(err);
              }
            }

            build_files = build_files.filter(
              build_file => path.extname(build_file) === ".json"
            );

            async.map(
              build_files,
              (buildFile, finished) => {
                fs.readFile(
                  path.join(build_directory, buildFile),
                  "utf8",
                  (err, body) => {
                    if (err) return finished(err);
                    finished(null, body);
                  }
                );
              },
              (err, jsonData) => {
                if (err) return c(err);

                try {
                  for (let i = 0; i < jsonData.length; i++) {
                    const data = JSON.parse(jsonData[i]);

                    // In case there are artifacts from other source locations.
                    if (sourceFilesArtifacts[data.sourcePath] == null) {
                      sourceFilesArtifacts[data.sourcePath] = [];
                    }

                    sourceFilesArtifacts[data.sourcePath].push(data);
                  }
                } catch (e) {
                  return c(e);
                }

                c();
              }
            );
          });*/
        c => {
          // Get the minimum updated time for all of a source file's artifacts
          // (note: one source file might have multiple artifacts).
          Object.keys(sourceFilesArtifacts).forEach(sourceFile => {
            const artifacts = sourceFilesArtifacts[sourceFile];

            sourceFilesArtifactsUpdatedTimes[sourceFile] = artifacts.reduce(
              (minimum, current) => {
                const updatedAt = new Date(current.updatedAt).getTime();

                if (updatedAt < minimum) {
                  return updatedAt;
                }
                return minimum;
              },
              Number.MAX_SAFE_INTEGER
            );

            // Empty array?
            if (
              sourceFilesArtifactsUpdatedTimes[sourceFile] ===
              Number.MAX_SAFE_INTEGER
            ) {
              sourceFilesArtifactsUpdatedTimes[sourceFile] = 0;
            }
          });

          c();
        },
        // Stat all the source files, getting there updated times, and comparing them to
        // the artifact updated times.
        c => {
          const sourceFiles = Object.keys(sourceFilesArtifacts);
          //console.log("sourceFiles:", sourceFiles)

          async.map(
            sourceFiles,
            (sourceFile, finished) => {
              fs.stat(sourceFile, (err, stat) => {
                if (err) {
                  // Ignore it. This means the source file was removed
                  // but the artifact file possibly exists. Return null
                  // to signfy that we should ignore it.
                  stat = null;
                }
                finished(null, stat);
              });
            },
            (err, sourceFileStats) => {
              if (err) return callback(err);

              sourceFiles.forEach((sourceFile, index) => {
                const sourceFileStat = sourceFileStats[index];

                // Ignore updating artifacts if source file has been removed.
                if (sourceFileStat == null) {
                  return;
                }

                const artifactsUpdatedTime =
                  sourceFilesArtifactsUpdatedTimes[sourceFile] || 0;
                const sourceFileUpdatedTime = (
                  sourceFileStat.mtime || sourceFileStat.ctime
                ).getTime();

                if (sourceFileUpdatedTime > artifactsUpdatedTime) {
                  updatedFiles.push(sourceFile);
                }
              });

              c();
            }
          );
        }
      ],
      err => {
        callback(err, updatedFiles);
      }
    );
  },

  // Returns the minimal set of sources to pass to solc as compilations targets,
  // as well as the complete set of sources so solc can resolve the comp targets' imports.
  required_sources(options, callback) {
    const self = this;

    expect.options(options, ["paths", "base_path", "resolver"]);

    const resolver = options.resolver;

    // Fetch the whole contract set
    find_contracts(options.contracts_directory, (err, allPaths) => {
      if (err) return callback(err);

      // Solidity test files might have been injected. Include them in the known set.
      options.paths.forEach(_path => {
        if (!allPaths.includes(_path)) {
          allPaths.push(_path);
        }
      });

      const updates = self
        .convert_to_absolute_paths(options.paths, options.base_path)
        .sort();
      allPaths = self
        .convert_to_absolute_paths(allPaths, options.base_path)
        .sort();

      const allSources = {};
      const compilationTargets = [];

      //console.log("allPaths", allPaths)

      // Load compiler
      const supplier = new CompilerSupplier(options.compilers.solc);
      supplier
        .load()
        .then(async solc => {
          // Get all the source code
          const resolved = await self.resolveAllSources(
            resolver,
            allPaths,
            solc
          );

          //console.log("sources resolvedall!")
          // Generate hash of all sources including external packages - passed to solc inputs.
          const resolvedPaths = Object.keys(resolved);
          resolvedPaths.forEach(file => {
            // Don't throw vyper files into solc!
            if (path.extname(file) !== ".vy")
              allSources[file] = resolved[file].body;
          });

          // Exit w/out minimizing if we've been asked to compile everything, or nothing.
          if (self.listsEqual(options.paths, allPaths)) {
            return callback(null, allSources, {});
          } else if (!options.paths.length) {
            return callback(null, {}, {});
          }

          // Seed compilationTargets with known updates
          updates.forEach(update => compilationTargets.push(update));

          // While there are updated files in the queue, we take each one
          // and search the entire file corpus to find any sources that import it.
          // Those sources are added to list of compilation targets as well as
          // the update queue because their own ancestors need to be discovered.
          async.whilst(
            () => updates.length > 0,
            updateFinished => {
              const currentUpdate = updates.shift();
              const files = allPaths.slice();

              // While files: dequeue and inspect their imports
              async.whilst(
                () => files.length > 0,
                fileFinished => {
                  const currentFile = files.shift();

                  // Ignore targets already selected.
                  if (compilationTargets.includes(currentFile)) {
                    return fileFinished();
                  }

                  let imports;
                  try {
                    //console.log("are we here?")
                    imports = self.getImports(
                      currentFile,
                      resolved[currentFile],
                      solc
                    );
                    //console.log("this succeeded")
                  } catch (err) {
                    err.message = `Error parsing ${currentFile}: ${e.message}`;
                    return fileFinished(err);
                  }

                  // If file imports a compilation target, add it
                  // to list of updates and compilation targets
                  if (imports.includes(currentUpdate)) {
                    updates.push(currentFile);
                    compilationTargets.push(currentFile);
                  }

                  fileFinished();
                },
                err => updateFinished(err)
              );
            },
            err =>
              err
                ? callback(err)
                : callback(null, allSources, compilationTargets)
          );
        })
        .catch(callback);
    });
  },

  // Resolves sources in several async passes. For each resolved set it detects unknown
  // imports from external packages and adds them to the set of files to resolve.
  async resolveAllSources(resolver, initialPaths, solc) {
    //console.log("resolver:", resolver)
    let contracts_directory;
    if (resolver.resolver)
      contracts_directory = resolver.source.config.contracts_directory;
    else contracts_directory = resolver.options.contracts_directory;

    //console.log("initialPaths:", initialPaths)
    const self = this;
    const mapping = {};
    const allPaths = initialPaths.slice();

    // Begin generateMapping
    function generateMapping(finished) {
      const promises = [];

      // Dequeue all the known paths, generating resolver promises,
      // We'll add paths if we discover external package imports.
      while (allPaths.length) {
        let file;
        let parent = null;

        const candidate = allPaths.shift();

        // Some paths will have been extracted as imports from a file
        // and have information about their parent location we need to track.
        if (typeof candidate === "object") {
          file = candidate.file;
          parent = candidate.parent;
        } else {
          file = candidate;
        }

        //console.log("file:", file)
        //console.log("parent:", parent)
        const promise = new Promise((accept, reject) => {
          resolver.resolve(file, parent, (err, body, absolutePath, source) => {
            const cleanFilePath = file.replace(/[.].+/, "");

            //console.log("Cleaned file:", cleanFilePath)
            const relativeFilePath = path.relative(
              contracts_directory,
              cleanFilePath
            );
            //console.log("relativeFilePath:", relativeFilePath)
            //console.log("absolutePath:", absolutePath)
            err
              ? reject(err)
              : accept({
                  file: absolutePath,
                  relativePath: relativeFilePath,
                  body,
                  source
                });
          });
        });
        promises.push(promise);
      }

      // Resolve everything known and add it to the map, then inspect each file's
      // imports and add those to the list of paths to resolve if we don't have it.
      Promise.all(promises)
        .then(results => {
          // Generate the sources mapping
          results.forEach(
            item => (mapping[item.file] = Object.assign({}, item))
          );

          // Queue unknown imports for the next resolver cycle
          while (results.length) {
            const result = results.shift();

            // Inspect the imports
            let imports;
            try {
              //console.log("are we doing imports?")
              //              console.log("result:", result)
              imports = self.getImports(result.file, result, solc);

              //console.log("imports successful")
            } catch (err) {
              //console.log("import failed")
              err.message = `Error parsing ${result.file}: ${err.message}`;
              return finished(err);
            }

            // Detect unknown external packages / add them to the list of files to resolve
            // Keep track of location of this import because we need to report that.
            imports.forEach(item => {
              if (!mapping[item])
                allPaths.push({ file: item, parent: result.file });
            });
          }
        })
        .catch(finished)
        .then(finished);
    }
    // End generateMapping

    return new Promise((resolve, reject) => {
      async.whilst(() => allPaths.length, generateMapping, error => {
        //        console.log("mapping:", mapping)
        if (error) reject(new Error(error));
        resolve(mapping);
      });
    });
  },

  getImports(file, { body, source }, solc) {
    const self = this;

    // No imports in vyper!
    if (path.extname(file) === ".vy") return [];

    //console.log("gonna parseImports")

    const imports = Parser.parseImports(body, solc);
    //console.log("parsed imports:", imports)

    // Convert explicitly relative dependencies of modules back into module paths.
    return imports.map(
      dependencyPath =>
        self.isExplicitlyRelative(dependencyPath)
          ? source.resolve_dependency_path(file, dependencyPath)
          : dependencyPath
    );
  },

  listsEqual(listA, listB) {
    const a = listA.sort();
    const b = listB.sort();

    return JSON.stringify(a) === JSON.stringify(b);
  },

  convert_to_absolute_paths(paths, base) {
    const self = this;
    return paths.map(p => {
      // If it's anabsolute paths, leave it alone.
      if (path.isAbsolute(p)) return p;

      // If it's not explicitly relative, then leave it alone (i.e., it's a module).
      if (!self.isExplicitlyRelative(p)) return p;

      // Path must be explicitly releative, therefore make it absolute.
      return path.resolve(path.join(base, p));
    });
  },

  isExplicitlyRelative(import_path) {
    //console.log(import_path.indexOf(".") === 0)
    return import_path.indexOf(".") === 0;
  }
};
