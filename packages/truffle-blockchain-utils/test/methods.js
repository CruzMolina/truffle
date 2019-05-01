const BlockchainUtils = require("../index");
const assert = require("assert");

describe("BlockchainUtils.parse", () => {
  it("returns empty parsed object if uri doesn't start with blockchain://", () => {
    const parsed = BlockchainUtils.parse("notBlockchain://");
    assert.deepStrictEqual(parsed, {});
  });
});

describe("BlockchainUtils.matches", () => {
  it("throws when passed an incorrect provider", () => {
    assert.throws(() => {
      BlockchainUtils.matches(
        "blockchain://f60903687b1559b9c80f2d935b4c4f468ad95c3076928c432ec34f2ef3d4eec9",
        "http://BadLocalHost:8545"
      );
    }, "should throw when passed a bad provider!");
  });
});

describe("BlockchainUtils.asURI", () => {
  it("throws when passed an incorrect provider", () => {
    assert.throws(() => {
      BlockchainUtils.asURI("http://BadLocalHost:8545");
    }, "should throw when passed a bad provider!");
  });
});
