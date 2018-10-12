const CompilerSupplier = require("../compilerSupplier");
const assert = require("assert");
const sinon = require("sinon");
const fs = require("fs");
let expectedResult;

describe("CompilerSupplier", () => {
  describe("prototype.versionIsCached(version)", () => {
    beforeEach(() => {
      const compilerFileNames = [
        "soljson-v0.4.22+commit.124ca40d.js",
        "soljson-v0.4.11+commit.124234rd.js",
        "soljson-v0.4.23+commit.1534a40d.js"
      ];
      sinon.stub(fs, "readdirSync").returns(compilerFileNames);
    });
    afterEach(() => {
      fs.readdirSync.restore();
    });

    describe("when a cached version of the compiler is present", () => {
      beforeEach(() => {
        expectedResult = "0.4.11";
      });

      it("returns a valid version name", () => {
        assert.equal(CompilerSupplier.prototype.versionIsCached("0.4.11"), expectedResult);
      });
    });
    describe("when a cached version of the compiler is not present", () => {
      beforeEach(() => {
        expectedResult = undefined;
      });

      it("returns undefined", () => {
        assert.equal(CompilerSupplier.prototype.versionIsCached("0.4.29"), expectedResult);
      });
    });
  });
  describe(".getLocal(version)", () => {

  });
});