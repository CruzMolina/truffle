declare class TruffleConfig {
  constructor(truffleDirectory: string, workingDirectory: string, network: string);
}

declare namespace TruffleConfig {
  function load(file?: string, options?: any): TruffleConfig;
  function detect(options?: any, file?: string): TruffleConfig;
}

export default TruffleConfig;
