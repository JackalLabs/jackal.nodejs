import { Buffer } from 'node:buffer'
import {
  AccountData,
  isOfflineDirectSigner,
  OfflineSigner
} from '@cosmjs/proto-signing'
import { decrypt, encrypt, PrivateKey } from 'eciesjs'
import {
  defaultQueryAddr9091,
  defaultTxAddr26657,
  jackalMainnetChainId
} from '@/utils/globals'
import {
  IAbciHandler,
  IFileIo,
  IGovHandler,
  IMnemonicWallet,
  INotificationHandler,
  IOracleHandler,
  IProtoHandler,
  IQueryHandler,
  IRnsHandler,
  IStorageHandler,
  IWalletHandler
} from '@/interfaces/classes'
import { bufferToHex, hashAndHex, hexFullPath, merkleMeBro } from '@/utils/hash'
import {
  ICoin,
  IWalletConfig,
  IWalletHandlerPrivateProperties,
  IWalletHandlerPublicProperties
} from '@/interfaces'
import { ProtoHandler } from '@/classes/protoHandler'
import { Pubkey } from '@jackallabs/jackal.nodejs-protos'
import {
  AbciHandler,
  FileIo,
  GovHandler,
  NotificationHandler,
  OracleHandler,
  RnsHandler,
  StorageHandler
} from '@/index'
import { QueryHandler } from '@/classes/queryHandler'
import { signerNotEnabled } from '@/utils/misc'
import { TWalletExtensions } from '@/types/TWalletExtensions'

export class WalletHandler implements IWalletHandler {
  private readonly qH: IQueryHandler
  private properties: IWalletHandlerPrivateProperties | null
  traits: IWalletHandlerPublicProperties | null

  /**
   * Receives properties from trackWallet() or trackQueryWallet() to instantiate WalletHandler.
   * @param {IQueryHandler} qH - QueryHandler: Always present.
   * @param {IWalletHandlerPrivateProperties | null} properties - Properties that have getters and setters.
   * @param {IWalletHandlerPublicProperties | null} traits - Read-only properties. Can be reset with voidFullWallet().
   * @private
   */
  private constructor(
    qH: IQueryHandler,
    properties: IWalletHandlerPrivateProperties | null,
    traits: IWalletHandlerPublicProperties | null
  ) {
    this.qH = qH
    this.properties = properties
    this.traits = traits
  }

  /**
   * Creates full WalletHandler vs query-only from trackQueryWallet().
   * @param {IWalletConfig} config - Config items needed to create a signing WalletHandler.
   * @param {IMnemonicWallet} session - IMnemonicWallet instance.
   * @returns {Promise<IWalletHandler>} - Signing WalletHandler.
   */
  static async trackWallet(
    config: IWalletConfig,
    session: IMnemonicWallet
  ): Promise<IWalletHandler> {
    const qH = await QueryHandler.trackQuery(config.queryAddr)
    const { properties, traits } = await processWallet(config, session).catch(
      (err: Error) => {
        throw err
      }
    )
    return new WalletHandler(qH, properties, traits)
  }

  /**
   * Creates query WalletHandler vs signing wallet from trackWallet().
   * @param {string} queryUrl - URL to query api node.
   * @returns {Promise<IWalletHandler>} - Query-only WalletHandler.
   */
  static async trackQueryWallet(queryUrl?: string): Promise<IWalletHandler> {
    const qH = await QueryHandler.trackQuery(queryUrl)
    return new WalletHandler(qH, null, null)
  }

  /**
   * Merkle items together, intended for arbitrary paths.
   * @param {string} path - Path to merkle.
   * @param {string} item - Target to merkle.
   * @returns {Promise<string>} - Merkled result.
   */
  static async getAbitraryMerkle(path: string, item: string): Promise<string> {
    return await hexFullPath(await merkleMeBro(path), item)
  }

  /**
   * Converts query-only WalletHandler instance to signing instance.
   * @param {IWalletConfig} config - Requires same object as trackWallet().
   * @param {IMnemonicWallet} session - IMnemonicWallet instance.
   * @returns {Promise<void>}
   */
  async convertToFullWallet(
    config: IWalletConfig,
    session: IMnemonicWallet
  ): Promise<void> {
    const { properties, traits } = await processWallet(config, session).catch(
      (err: Error) => {
        throw err
      }
    )
    this.properties = properties
    this.traits = traits
  }

  /**
   * Converts signing WalletHandler instance to query-only instance.
   * @returns {void}
   */
  voidFullWallet(): void {
    this.properties = null
    this.traits = null
  }

  /**
   * Check user's RNS initialization status.
   * @returns {boolean} - Indicates if user's RNS has been initialized.
   */
  getRnsInitStatus(): boolean {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getRnsInitStatus'))
    return this.properties.rnsInitComplete
  }

  /**
   * Save a RNS initialization status to the signing WalletHandler instance.
   * @param {boolean} status - RNS initialization status.
   * @returns {Promise<void>}
   */
  setRnsInitStatus(status: boolean): void {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'setRnsInitStatus'))
    this.properties.rnsInitComplete = status
  }

  /**
   * Check user's Storage initialization status.
   * @returns {boolean} - Indicates if user's Storage has been initialized.
   */
  getStorageInitStatus(): boolean {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getStorageInitStatus'))
    return this.properties.fileTreeInitComplete
  }

  /**
   * Save a Storage initialization status to the signing WalletHandler instance.
   * @param {boolean} status - Storage initialization status.
   * @returns {Promise<void>}
   */
  setStorageInitStatus(status: boolean): void {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'setStorageInitStatus'))
    this.properties.fileTreeInitComplete = status
  }

  /**
   * Expose signing WalletHandler instance ProtoHandler instance.
   * @returns {IProtoHandler}
   */
  getProtoHandler(): IProtoHandler {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getProtoHandler'))
    return this.properties.pH
  }

  /**
   * Expose query or signing WalletHandler instance QueryHandler instance.
   * @returns {IQueryHandler}
   */
  getQueryHandler(): IQueryHandler {
    return this.qH
  }

  /**
   * Expose signing WalletHandler instance Signer accounts.
   * @returns {Promise<readonly AccountData[]>}
   */
  getAccounts(): Promise<readonly AccountData[]> {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getAccounts'))
    return this.properties.signer.getAccounts()
  }

  /**
   * Expose signing WalletHandler instance Signer.
   * @returns {OfflineSigner}
   */
  getSigner(): OfflineSigner {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getSigner'))
    return this.properties.signer
  }

  /**
   * Expose signing WalletHandler instance jkl address.
   * @returns {string} - Jkl address.
   */
  getJackalAddress(): string {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getJackalAddress'))
    return this.properties.jackalAccount.address
  }

  /**
   * Expose signing WalletHandler instance jkl address' hex value.
   * @returns {Promise<string>} - Hashed and hexed jkl address.
   */
  async getHexJackalAddress(): Promise<string> {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getHexJackalAddress'))
    return await hashAndHex(this.properties.jackalAccount.address)
  }

  /**
   * Retrieve all signing WalletHandler instance tokens and balances for all supported chains.
   * @returns {Promise<ICoin[]>} - All tokens and balances held by Signer.
   */
  async getAllBalances(): Promise<ICoin[]> {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getAllBalances'))
    const res = await this.qH.bankQuery.queryAllBalances({
      address: this.properties.jackalAccount.address
    })
    return res.value.balances as ICoin[]
  }

  /**
   * Retrieve balance of $JKL in ujkl for signing WalletHandler instance.
   * @returns {Promise<ICoin>} - Balance in ujkl.
   */
  async getJackalBalance(): Promise<ICoin> {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getJackalBalance'))
    const res = await this.qH.bankQuery.queryBalance({
      address: this.properties.jackalAccount.address,
      denom: 'ujkl'
    })
    return res.value.balance as ICoin
  }

  /**
   * Expose signing WalletHandler instance public key as hex value.
   * @returns {string} - Public key as hex value.
   */
  getPubkey(): string {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'getPubkey'))
    return this.properties.keyPair.publicKey.toHex()
  }

  /**
   * Encrypt value using public key from either findPubKey() or getPubkey(). Half of an asymmetric keypair.
   * @param {Buffer} toEncrypt - Value to encrypt.
   * @param {string} pubKey - Public key as hex value.
   * @returns {string} - Encrypted value.
   */
  asymmetricEncrypt(toEncrypt: Buffer, pubKey: string): string {
    return encrypt(pubKey, toEncrypt).toString('hex')
  }

  /**
   * Decrypt value using signing WalletHandler instance private key. Half of an asymmetric keypair.
   * @param {string} toDecrypt - Value to decrypt.
   * @returns {ArrayBuffer} - Decrypted value.
   */
  asymmetricDecrypt(toDecrypt: string): Buffer {
    if (!this.properties)
      throw new Error(signerNotEnabled('WalletHandler', 'asymmetricDecrypt'))
    return decrypt(
      this.properties.keyPair.toHex(),
      Buffer.from(toDecrypt, 'hex')
    )
  }

  /**
   * Retrieve asymmetric keypair public key from chain for specified jkl address.
   * @param {string} address - Jkl address to check.
   * @returns {Promise<string>} - Target address' public key as hex value.
   */
  async findPubKey(address: string): Promise<string> {
    const result = await this.qH.fileTreeQuery.queryPubkey({ address })
    if (!result.success) {
      throw new Error(`${address} does not have a pubkey registered`)
    } else {
      return (result.value.pubkey as Pubkey).key
    }
  }

  /**
   * Handler Factories
   */

  /**
   * Create AbciHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<IAbciHandler>}
   */
  async makeAbciHandler(): Promise<IAbciHandler> {
    return await AbciHandler.trackAbci(this)
  }

  /**
   * Create FileIo instance and link to signing WalletHandler instance.
   * @returns {Promise<IFileIo | null>} - Query WalletHandler instance returns null instead.
   */
  async makeFileIoHandler(
    versionFilter?: string | string[]
  ): Promise<IFileIo | null> {
    return this.traits ? await FileIo.trackIo(this, versionFilter) : null
  }

  /**
   * Create GovHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<IGovHandler>}
   */
  async makeGovHandler(): Promise<IGovHandler> {
    return await GovHandler.trackGov(this)
  }

  /**
   * Create NotificationHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<INotificationHandler>}
   */
  async makeNotificationHandler(): Promise<INotificationHandler> {
    return await NotificationHandler.trackNotification(this)
  }

  /**
   * Create OracleHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<IOracleHandler>}
   */
  async makeOracleHandler(): Promise<IOracleHandler> {
    return await OracleHandler.trackOracle(this)
  }

  /**
   * Create RnsHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<IRnsHandler>}
   */
  async makeRnsHandler(): Promise<IRnsHandler> {
    return await RnsHandler.trackRns(this)
  }

  /**
   * Create StorageHandler instance and link to query or signing WalletHandler instance.
   * @returns {Promise<IStorageHandler>}
   */
  async makeStorageHandler(): Promise<IStorageHandler> {
    return await StorageHandler.trackStorage(this)
  }
}

/**
 * Generate a mnemonic-specific signature to use as a seed for creating an asymmetric keypair.
 * @param {string} acct - The wallet address matching the chainId.
 * @param {IMnemonicWallet} walletExtension - Custom wallet session to use for signArbitrary() call.
 * @returns {Promise<string>} - Generated signature.
 */
async function makeSecret(
  acct: string,
  walletExtension: TWalletExtensions
): Promise<string> {
  const memo = 'Initiate Jackal Session'
  const signed = await walletExtension
    .signArbitrary(acct, memo)
    .catch((err: Error) => {
      throw err
    })
  return signed.signature
}

/**
 * Create the traits and properties used by a signing WalletHandler.
 * @param {IWalletConfig} config - Config items needed to create a signing WalletHandler.
 * @param {IMnemonicWallet} session - CustomWallet instance.
 * @returns {Promise<{traits: IWalletHandlerPublicProperties, properties: IWalletHandlerPrivateProperties}>}
 */
async function processWallet(config: IWalletConfig, session: IMnemonicWallet) {
  const { signerChain, queryAddr, txAddr } = config
  const chainId = signerChain || jackalMainnetChainId
  const signer = await session.getOfflineSignerAuto()
  const queryUrl = (queryAddr || defaultQueryAddr9091).replace(/\/+$/, '')
  const rpcUrl = (txAddr || defaultTxAddr26657).replace(/\/+$/, '')
  const jackalAccount = (await signer.getAccounts())[0]

  const pH = await ProtoHandler.trackProto({ signer, queryUrl, rpcUrl })
  const rnsInitComplete = (
    await pH.rnsQuery.queryInit({ address: jackalAccount.address })
  ).value.init
  const {
    value: { pubkey },
    success
  } = await pH.fileTreeQuery.queryPubkey({ address: jackalAccount.address })
  const secret = await makeSecret(jackalAccount.address, session).catch(
    (err: Error) => {
      throw err
    }
  )
  const fileTreeInitComplete = success && !!pubkey?.key
  const secretAsHex = bufferToHex(Buffer.from(secret, 'base64').subarray(0, 32))
  const keyPair = PrivateKey.fromHex(secretAsHex)
  const isDirect = isOfflineDirectSigner(signer)
  const properties: IWalletHandlerPrivateProperties = {
    signer,
    keyPair,
    rnsInitComplete,
    fileTreeInitComplete,
    jackalAccount,
    pH
  }
  const traits: IWalletHandlerPublicProperties = {
    chainId,
    isDirect
  }
  return { properties, traits }
}
