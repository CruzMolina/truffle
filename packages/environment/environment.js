const Web3 = require("web3");
const { InterfaceAdapter } = require("@truffle/interface-adapter");
const expect = require("@truffle/expect");
const TruffleError = require("@truffle/error");
const Resolver = require("@truffle/resolver");
const Artifactor = require("@truffle/artifactor");
const Ganache = require("ganache-core/public-exports");

const Environment = {
  // It's important config is a Config object and not a vanilla object
  detect: async function(config) {
    expect.options(config, ["networks"]);

    helpers.setUpConfig(config);
    helpers.validateNetworkConfig(config);

    const adapter = new InterfaceAdapter({
      config,
      provider: config.provider,
      networkType: config.networks[config.network].type
    });

    await helpers.detectAndSetNetworkId(config, adapter);
    await helpers.setFromOnConfig(config, adapter);
  },

  // Ensure you call Environment.detect() first.
  fork: async function(config) {
    expect.options(config, ["from", "provider", "networks", "network"]);

    const adapter = new InterfaceAdapter({
      provider: config.provider,
      networkType: config.networks[config.network].type
    });

    const accounts = await adapter.eth.getAccounts();
    const block = await adapter.eth.getBlock("latest");

    const upstreamNetwork = config.network;
    const upstreamConfig = config.networks[upstreamNetwork];
    const forkedNetwork = config.network + "-fork";

    config.networks[forkedNetwork] = {
      network_id: config.network_id,
      provider: Ganache.provider({
        fork: config.provider,
        unlocked_accounts: accounts,
        gasLimit: block.gasLimit
      }),
      from: config.from,
      gas: upstreamConfig.gas,
      gasPrice: upstreamConfig.gasPrice
    };
    config.network = forkedNetwork;
  },

  develop: async (config, ganacheOptions) => {
    expect.options(config, ["networks"]);

    const network = config.network || "develop";
    const url = `http://${ganacheOptions.host}:${ganacheOptions.port}/`;

    config.networks[network] = {
      network_id: ganacheOptions.network_id,
      provider: function() {
        return new Web3.providers.HttpProvider(url, { keepAlive: false });
      }
    };

    config.network = network;

    return await Environment.detect(config);
  }
};

const helpers = {
  setFromOnConfig: async (config, adapter) => {
    if (config.from) return;
    let accounts;

    // TODO temp stopgap!
    if (config.networks[config.network].type === "tezos")
      accounts = await adapter.eth.getAccounts(config);
    else accounts = await adapter.eth.getAccounts();
    config.networks[config.network].from = accounts[0];
  },

  detectAndSetNetworkId: async (config, adapter) => {
    const configNetworkId = config.networks[config.network].network_id;
    const providerNetworkId = await adapter.getNetworkId();
    if (configNetworkId !== "*") {
      // Ensure the network id matches the one in the config for safety
      if (providerNetworkId.toString() !== configNetworkId.toString()) {
        const error =
          `The network id specified in the truffle config ` +
          `(${configNetworkId}) does not match the one returned by the network ` +
          `(${providerNetworkId}).  Ensure that both the network and the ` +
          `provider are properly configured.`;
        throw new Error(error);
      }
    } else {
      // We have a "*" network. Get the current network and replace it with the real one.
      // TODO: Should we replace this with the blockchain uri?
      config.networks[config.network].network_id = providerNetworkId;
    }
  },

  validateNetworkConfig: config => {
    const networkConfig = config.networks[config.network];

    if (!networkConfig) {
      throw new TruffleError(
        `Unknown network "${config.network}` +
          `". See your Truffle configuration file for available networks.`
      );
    }

    const configNetworkId = config.networks[config.network].network_id;

    if (configNetworkId == null) {
      throw new Error(
        `You must specify a network_id in your '` +
          `${config.network}' configuration in order to use this network.`
      );
    }
  },

  setUpConfig: config => {
    if (!config.resolver) {
      config.resolver = new Resolver(config);
    }

    if (!config.artifactor) {
      config.artifactor = new Artifactor(config.contracts_build_directory);
    }

    if (!config.network) {
      if (config.networks["development"]) {
        config.network = "development";
      } else {
        config.network = "ganache";
        config.networks[config.network] = {
          host: "127.0.0.1",
          port: 7545,
          network_id: 5777
        };
      }
    }
  }
};

module.exports = Environment;
