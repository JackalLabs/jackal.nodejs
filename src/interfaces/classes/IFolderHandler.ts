import {
  IChildDirInfo,
  IFolderFileFrame
} from '@/interfaces'
import {
  IFileMeta,
  IFileMetaHashMap
} from '@/interfaces/file'
import { IWalletHandler } from '@/interfaces/classes'
import { EncodeObject } from '@cosmjs/proto-signing'

export interface IFolderHandler {
  isFolder: boolean

  getWhoAmI(): string
  getWhereAmI(): string
  getWhoOwnsMe(): string
  getMyPath(): string
  getMyChildPath(child: string): string
  getFolderDetails(): IFolderFileFrame
  getChildDirs(): string[]
  getChildFiles(): { [name: string]: IFileMeta }
  getForFiletree(walletRef: IWalletHandler): Promise<EncodeObject>
  getChildMerkle(child: string): Promise<string>

  addChildDirs(
    childNames: string[],
    walletRef: IWalletHandler
  ): Promise<{ encoded: EncodeObject[]; existing: string[] }>
  addChildFileReferences(
    newFiles: IFileMetaHashMap,
    walletRef: IWalletHandler
  ): Promise<EncodeObject>
  removeChildDirReferences(
    toRemove: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject>
  removeChildFileReferences(
    toRemove: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject>
  removeChildDirAndFileReferences(
    dirs: string[],
    files: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject>
  makeChildDirInfo(childName: string): IChildDirInfo
}
