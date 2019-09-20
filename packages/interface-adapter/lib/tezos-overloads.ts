import { Web3Shim, Web3ShimOptions } from "./web3-shim";
import { Tezos } from '@tezos-ts/tezos-ts';

export const TezosDefinition = {
  async initNetworkType(web3: Web3Shim, options: Web3ShimOptions) {
    overrides.getId(web3);
    overrides.getAccounts(web3, options);
    overrides.getBlock(web3);
    overrides.getBlockNumber(web3);
    overrides.getBalance(web3);
//    overrides.loadWallet(web3);
//    overrides.sendTransaction(web3)
  }
};

const overrides = {
  // The ts-ignores are ignoring the checks that are
  // saying that web3.eth.net.getId is a function and doesn't
  // have a `method` property, which it does
  getId: (web3: Web3Shim) => {
    // @ts-ignore
    web3.tez = Tezos;
    // @ts-ignore
    const _oldGetId = web3.eth.net.getId;
    // @ts-ignore
    web3.eth.net.getId = async () => {
      // chaincode-fabric-evm currently returns a "fabric-evm" string
      // instead of a hex networkID. Instead of trying to decode the hexToNumber,
      // let's just accept `fabric-evm` as a valid networkID for now.
      // @ts-ignore
      const currentHost = web3.currentProvider.host;
      const parsedHost = currentHost.match(/(^https?:\/\/)(.*?)\:\d.*/)[2];
      // @ts-ignore
      await web3.tez.setProvider({ rpc: parsedHost })
      // @ts-ignore
      const { chainId } = await web3.tez.rpc.getBlockHeader();
      return chainId;
    };
  },

  // The ts-ignores are ignoring the checks that are
  // saying that web3.eth.getAccounts is a function and doesn't
  // have a `method` property, which it does
  getAccounts: (web3: Web3Shim, { config } : Web3ShimOptions) => {
    // @ts-ignore
    //web3.tez = Tezos;
    // @ts-ignore
    const _oldGetAccounts = web3.eth.getAccounts;
    // @ts-ignore
    web3.eth.getAccounts = async () => {
      // chaincode-fabric-ev1Gm currently returns a "fabric-evm" string
      // instead of a hex networkID. Instead of trying to decode the hexToNumber,
      // let's just accept `fabric-evm` as a valid networkID for now.
      // @ts-ignore
      await web3.tez.importKey(
        // @ts-ignore
        config.networks[config.network].email,
        // @ts-ignore
        config.networks[config.network].passphrase,
        // @ts-ignore
        config.networks[config.network].mnemonic,
        // @ts-ignore
        config.networks[config.network].secret
      )

      // @ts-ignore
//      await web3.tez.setProvider({ rpc: config.networks[config.network].host }//, web3.tez.signer })
      // @ts-ignore
      //await console.log(web3.tez);
      // @ts-ignore
      const currentAccount = await web3.tez.signer.publicKeyHash();
      return [ currentAccount ];
    };
  },

  // The ts-ignores are ignoring the checks that are
  // saying that web3.eth.getBlock is a function and doesn't
  // have a `method` property, which it does
  getBlock: (web3: Web3Shim) => {
    // @ts-ignore
    const _oldGetBlock = web3.eth.getBlock;

    // @ts-ignore
    web3.eth.getBlock = async (blockNumber = "head") => {
      // @ts-ignore
      //const currentHost = web3.currentProvider.host;
     // const parsedHost = currentHost.match(/(^https?:\/\/)(.*?)\:\d.*/)[2];
     // await Tezos.setProvider({ rpc: "https://rpcalpha.tzbeta.net" })
      if (blockNumber === "latest") blockNumber = "head"
      // @ts-ignore
      const { hardGasLimitPerBlock } = await web3.tez.rpc.getConstants();
      // @ts-ignore
      const block = await web3.tez.rpc.getBlockHeader({ block: `${blockNumber}` })
      block.gasLimit = hardGasLimitPerBlock
      return block;
    };
  },

  // The ts-ignores are ignoring the checks that are
  // saying that web3.eth.net.getId is a function and doesn't
  // have a `method` property, which it does
  getBlockNumber: (web3: Web3Shim) => {
    // @ts-ignore
    const _oldGetBlockNumber = web3.eth.getBlockNumber;
    // @ts-ignore
    web3.eth.getBlockNumber = async () => {
      // chaincode-fabric-evm currently returns a "fabric-evm" string
      // instead of a hex networkID. Instead of trying to decode the hexToNumber,
      // let's just accept `fabric-evm` as a valid networkID for now.
      // @ts-ignore
      //const currentHost = web3.currentProvider.host;
      //const parsedHost = currentHost.match(/(^https?:\/\/)(.*?)\:\d.*/)[2];
      //await Tezos.setProvider({ rpc: "https://rpcalpha.tzbeta.net" })
      // @ts-ignore
      const { level } = await web3.tez.rpc.getBlockHeader();
      return level;
    };
  },

  // The ts-ignores are ignoring the checks that are
  // saying that web3.eth.net.getId is a function and doesn't
  // have a `method` property, which it does
  getBalance: (web3: Web3Shim) => {
    // @ts-ignore
    const _oldGetBlockNumber = web3.eth.getBalance;
    // @ts-ignore
    web3.eth.getBalance = async(address) => {
      // chaincode-fabric-evm currently returns a "fabric-evm" string
      // instead of a hex networkID. Instead of trying to decode the hexToNumber,
      // let's just accept `fabric-evm` as a valid networkID for now.
      // @ts-ignore
      //const currentHost = web3.currentProvider.host;
      //const parsedHost = currentHost.match(/(^https?:\/\/)(.*?)\:\d.*/)[2];
      //await Tezos.setProvider({ rpc: "https://rpcalpha.tzbeta.net" })
      // @ts-ignore
      const balance = await web3.tez.tz.getBalance(address);
      await console.log(balance, balance.toString())
      // @ts-ignore
      return await web3.tez.tz.getBalance(address);
    };
  },

  /*sendTransaction: (web3: Web3Shim) => {
    // @ts-ignore
    const _oldsendTransaction = web3.eth.sendTransaction;;
    // @ts-ignore
    web3.eth.sendTransaction = async (params) => {
      // chaincode-fabric-evm currently returns a "fabric-evm" string
      // instead of a hex networkID. Instead of trying to decode the hexToNumber,
      // let's just accept `fabric-evm` as a valid networkID for now.
      // @ts-ignore
      const receipt = await web3.tez.contract.originate(params);
      // @ts-ignore
      return receipt;
    };
  }*/


  /*,

  loadWallet: (web3: Web3Shim, { config } : Web3ShimOptions) => {
    // @ts-ignore
    web3.tez = Tezos
    // @ts-ignore
    web3.tez.loadWallet = async () => {
      // @ts-ignore
      const currentHost = web3.currentProvider.host;

      // @ts-ignore
      const signer = await web3.tez.importKey(
        // @ts-ignore
        config.networks[config.network].email,
        // @ts-ignore
        config.networks[config.network].passphrase,
        // @ts-ignore
        config.networks[config.network].mnemonic,
        // @ts-ignore
        config.networks[config.network].secret
      )

      //@ts-ignore
      await web3.tez.setProvider({ rpc: "https://rpcalpha.tzbeta.net", signer })
    };
  }*/
};
