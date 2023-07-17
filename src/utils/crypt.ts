import { Buffer } from 'node:buffer'
import { randomBytes, webcrypto } from 'node:crypto'
import { keyAlgo } from '@/utils/globals'
import { hashAndHex } from '@/utils/hash'
import { IWalletHandler } from '@/interfaces/classes'
import { IAesBundle } from '@/interfaces'

const { subtle } = webcrypto

/**
 * Convert CryptoKey to storable format (see importJackalKey()).
 * @param {CryptoKey} key - CryptoKey to convert.
 * @returns {Promise<Buffer>} - CryptoKey as Uint8Array.
 */
export async function exportJackalKey(key: CryptoKey): Promise<Buffer> {
  return Buffer.from(await subtle.exportKey('raw', key))
}

/**
 * Convert stored format to CryptoKey (see exportJackalKey()).
 * @param {Buffer} rawExport - Uint8Array to recover to CryptoKey.
 * @returns {Promise<CryptoKey>} - Recovered CryptoKey.
 */
export function importJackalKey(rawExport: Buffer): Promise<CryptoKey> {
  return subtle.importKey('raw', rawExport, 'AES-GCM', true, [
    'encrypt',
    'decrypt'
  ])
}

/**
 * Generate a new CryptoKey from scratch. Compatible with AES-256 and exportJackalKey(). Supports encrypt and decrypt.
 * @returns {Promise<CryptoKey>} - Fresh random CryptoKey.
 */
export async function genKey(): Promise<CryptoKey> {
  return await subtle.generateKey(keyAlgo, true, ['encrypt', 'decrypt'])
}

/**
 * Generate a new iv from scratch. Compatible with AES-256.
 * @returns {Buffer} - Fresh random iv.
 */
export function genIv(): Buffer {
  // return crypto.getRandomValues(new Uint8Array(16))
  return randomBytes(16)
}

/**
 * Encrypt or decrypt a Blob using AES-256 (AES-GCM).
 * @param {Blob} data - Source to encrypt or decrypt.
 * @param {CryptoKey} key - Key to use. Decryption key must match encryption key that was used.
 * @param {Uint8Array} iv - Iv to use. Decryption iv must match encryption iv that was used.
 * @param {"encrypt" | "decrypt"} mode - Toggle between encryption and decryption.
 * @returns {Promise<Blob>} - Processed result.
 */
export async function aesCrypt(
  data: Buffer,
  key: CryptoKey,
  iv: Buffer,
  mode: 'encrypt' | 'decrypt'
): Promise<Buffer> {
  const algo = {
    name: 'AES-GCM',
    iv
  }
  if (data.byteLength < 1) {
    return Buffer.from([])
  } else if (mode?.toLowerCase() === 'encrypt') {
    return await subtle
      .encrypt(algo, key, data)
      .then((res) => {
        return Buffer.from(res)
      })
      .catch((err) => {
        console.error(`aesCrypt(encrypt) - ${err}`)
        throw err
      })
  } else {
    return await subtle
      .decrypt(algo, key, data)
      .then((res) => {
        return Buffer.from(res)
      })
      .catch((err) => {
        console.error(`aesCrypt(decrypt) - ${err}`)
        throw err
      })
  }
}

/**
 * Encrypts AES iv/CryptoKey set to string using receiver's ECIES public key.
 * @param {IWalletHandler} wallet - Wallet instance for accessing functions.
 * @param {string} pubKey - Receiver's ECIES public key.
 * @param {IAesBundle} aes - AES iv/CryptoKey set to encrypt.
 * @returns {Promise<string>} - Encrypted string with pipe "|" delimiter.
 */
export async function aesToString(
  wallet: IWalletHandler,
  pubKey: string,
  aes: IAesBundle
): Promise<string> {
  const theIv = wallet.asymmetricEncrypt(aes.iv, pubKey)
  const key = await exportJackalKey(aes.key)
  const theKey = wallet.asymmetricEncrypt(key, pubKey)
  return `${theIv}|${theKey}`
}

/**
 * Decrypts AES iv/CryptoKey set from string using owner's ECIES private key.
 * @param {IWalletHandler} wallet - Wallet instance for accessing functions and owner's private key.
 * @param {string} source - String containing encrypted AES iv/CryptoKey set with pipe "|" delimiter.
 * @returns {Promise<IAesBundle>} - Decrypted AES iv/CryptoKey set.
 */
export async function stringToAes(
  wallet: IWalletHandler,
  source: string
): Promise<IAesBundle> {
  if (source.indexOf('|') < 0) {
    throw new Error('stringToAes() : Invalid source string')
  }
  const parts = source.split('|')
  return {
    iv: wallet.asymmetricDecrypt(parts[0]),
    key: await importJackalKey(wallet.asymmetricDecrypt(parts[1]))
  }
}

/**
 * Converts raw File to encrypted File.
 * @param {File} workingFile - Source File.
 * @param {CryptoKey} key - AES-256 CryptoKey.
 * @param {Buffer} iv - AES-256 iv.
 * @returns {Promise<File>} - Encrypted File.
 */
export async function convertToEncryptedFile(
  workingFile: File,
  key: CryptoKey,
  iv: Buffer
): Promise<File> {

  const chunkSize = 32 * Math.pow(1024, 2) /** in bytes */
  const details = {
      name: workingFile.name,
      lastModified: workingFile.lastModified,
      type: workingFile.type,
      size: workingFile.size
    }
  const detailsBuf = Buffer.from(JSON.stringify(details))
  const encryptedArray: Buffer[] = [
    Buffer.from((detailsBuf.length + 8).toString().padStart(8, '0')),
    await aesCrypt(detailsBuf, key, iv, 'encrypt')
  ]
  for (let i = 0; i < workingFile.size; i += chunkSize) {
    const bufChunk = Buffer.from(await workingFile.slice(i, i + chunkSize).arrayBuffer())
    encryptedArray.push(
      Buffer.from((bufChunk.length + 8).toString().padStart(8, '0')),
      await aesCrypt(bufChunk, key, iv, 'encrypt')
    )
  }
  console.log('convertToEncryptedFile() - detailsBuf:', detailsBuf.toString())
  console.log('convertToEncryptedFile() - encryptedArray:', encryptedArray.length)
  const finalName = `${await hashAndHex(
    details.name + Date.now().toString()
  )}.jkl`
  const abArray = encryptedArray.map((el) => el.buffer.slice(el.byteOffset, el.byteOffset + el.byteLength))
  return new File(abArray, finalName, { type: 'text/plain' })
}

/**
 * Converts raw Blob to decrypted File.
 * @param {Buffer} source - Source raw Blob.
 * @param {CryptoKey} key - AES-256 CryptoKey.
 * @param {Buffer} iv - AES-256 iv.
 * @returns {Promise<File>} - Decrypted File.
 */
export async function convertFromEncryptedFile(
  source: Buffer,
  key: CryptoKey,
  iv: Buffer
): Promise<File> {

  let detailsBuf = Buffer.from('')
  const bufParts: Buffer[] = []
  for (let i = 0; i < source.length; ) {
    const offset = i + 8
    const segSize = Number(source.slice(i, offset).toString())
    const last = offset + segSize
    const segment = source.slice(offset, last)

    await aesCrypt(segment, key, iv, 'decrypt')
    if (i === 0) {
      detailsBuf = segment
    } else {
      bufParts.push(segment)
    }
    i = last
  }
  console.log('convertFromEncryptedFile() - detailsBuf:', detailsBuf.toString())
  console.log('convertFromEncryptedFile() - bufParts:', bufParts.length)
  const details = JSON.parse(detailsBuf.toString())
  const abArray = bufParts.map((el) => el.buffer.slice(el.byteOffset, el.byteOffset + el.byteLength))
  return new File(abArray, details.name, details)
}

/**
 * Encrypt or decrypt a string using AES-256 (AES-GCM).
 * @param {string} input - Source string to encrypt or decrypt.
 * @param {CryptoKey} key - CryptoKey to use. Decryption CryptoKey must match encryption CryptoKey that was used.
 * @param {Uint8Array} iv - Iv to use. Decryption iv must match encryption iv that was used.
 * @param {"encrypt" | "decrypt"} mode - Toggle between encryption and decryption.
 * @returns {Promise<string>} - Processed result.
 */
export async function cryptString(
  input: string,
  key: CryptoKey,
  iv: Buffer,
  mode: 'encrypt' | 'decrypt'
): Promise<string> {
  if (mode === 'encrypt') {
    const result = await aesCrypt(Buffer.from(input), key, iv, mode)
    return result.toString('base64')
  } else if (mode === 'decrypt') {
    const result = await aesCrypt(Buffer.from(input, 'base64'), key, iv, mode)
    return result.toString('utf-8')
  } else {
    throw new Error('cryptString() - Invalid Mode!')
  }
 }
