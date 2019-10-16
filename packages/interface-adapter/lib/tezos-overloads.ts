import { InterfaceAdapter, InterfaceAdapterOptions } from "./interface-adapter";
import { Tezos } from "@taquito/taquito";

export const TezosDefinition = {
  async initNetworkType(
    web3: InterfaceAdapter,
    options: InterfaceAdapterOptions
  ) {
    overrides.getId(web3);
    overrides.getAccounts(web3, options);
    overrides.getBlock(web3);
    overrides.getBlockNumber(web3);
    overrides.getBalance(web3);
  }
};

const overrides = {
  getId: (web3: InterfaceAdapter) => {
    // here we define a tez namespace &
    // attach our Tezos provider to the InterfaceAdapter
    web3.tez = Tezos;
    const _oldGetId = web3.eth.net.getId;

    // @ts-ignore
    web3.eth.net.getId = async () => {
      // @ts-ignore (typings incomplete)
      const currentHost = web3.currentProvider.host;
      // web3 has some neat quirks
      const parsedHost = currentHost.match(/(^https?:\/\/)(.*?)\:\d.*/)[2];
      // sets the provider for subsequent Tezos provider calls
      await web3.tez.setProvider({ rpc: parsedHost });
      // @ts-ignore (typings incomplete)
      const { chainId } = await web3.tez.rpc.getBlockHeader();
      return chainId;
    };
  },

  getAccounts: (
    web3: InterfaceAdapter,
    { config }: InterfaceAdapterOptions
  ) => {
    const _oldGetAccounts = web3.eth.getAccounts;

    web3.eth.getAccounts = async () => {
      // here we import user's faucet account:
      // email, passphrase, mnemonic, & secret are all REQUIRED.
      // TODO: all logic to check if user is importing only a private secret key
      // that would unlock the account, or a psk w/ passphrase
      let mnemonic = config.networks[config.network].mnemonic;
      if (Array.isArray(mnemonic)) mnemonic = mnemonic.join(" ");
      await web3.tez.importKey(
        config.networks[config.network].email,
        config.networks[config.network].passphrase,
        mnemonic,
        config.networks[config.network].secret
      );

      const currentAccount = await web3.tez.signer.publicKeyHash();
      return [currentAccount];
    };
  },

  getBlock: (web3: InterfaceAdapter) => {
    const _oldGetBlock = web3.eth.getBlock;

    // @ts-ignore
    web3.eth.getBlock = async (blockNumber = "head") => {
      // translate ETH nomenclature to XTZ
      // @ts-ignore
      if (blockNumber === "latest") blockNumber = "head";
      const { hardGasLimitPerBlock } = await web3.tez.rpc.getConstants();
      const block = await web3.tez.rpc.getBlockHeader({
        block: `${blockNumber}`
      });
      // @ts-ignore
      block.gasLimit = hardGasLimitPerBlock;
      return block;
    };
  },

  getBlockNumber: (web3: InterfaceAdapter) => {
    const _oldGetBlockNumber = web3.eth.getBlockNumber;

    web3.eth.getBlockNumber = async () => {
      const { level } = await web3.tez.rpc.getBlockHeader();
      return level;
    };
  },

  getBalance: (web3: InterfaceAdapter) => {
    // since this is used in the tez reporter,
    // decided to namespace a specific tez getBalance method
    // @ts-ignore
    web3.tez.getBalance = async address => {
      const balance = (await web3.tez.tz.getBalance(address)).toString();
      return balance;
    };
  }
};
