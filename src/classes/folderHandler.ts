import { EncodeObject } from '@cosmjs/proto-signing'
import {
  IChildDirInfo,
  IFolderFileFrame
} from '@/interfaces'
import {
  IFileMeta,
  IFileMetaHashMap
} from '@/interfaces/file'
import { IFolderHandler, IWalletHandler } from '@/interfaces/classes'
import { signerNotEnabled, stripper } from '@/utils/misc'
import { merkleMeBro } from '@/utils/hash'
import { saveFileTreeEntry } from '@/utils/compression'

export class FolderHandler implements IFolderHandler {
  private readonly folderDetails: IFolderFileFrame
  readonly isFolder: boolean

  private constructor(folderDetails: IFolderFileFrame) {
    this.folderDetails = folderDetails
    this.isFolder = true
  }

  static async trackFolder(dirInfo: IFolderFileFrame): Promise<IFolderHandler> {
    return new FolderHandler(dirInfo)
  }
  static async trackNewFolder(dirInfo: IChildDirInfo): Promise<IFolderHandler> {
    const folderDetails: IFolderFileFrame = {
      whoAmI: stripper(dirInfo.myName),
      whereAmI: dirInfo.myParent,
      whoOwnsMe: dirInfo.myOwner,
      dirChildren: [],
      fileChildren: {}
    }
    return new FolderHandler(folderDetails)
  }

  getWhoAmI(): string {
    return this.folderDetails.whoAmI
  }
  getWhereAmI(): string {
    return this.folderDetails.whereAmI
  }
  getWhoOwnsMe(): string {
    return this.folderDetails.whoOwnsMe
  }
  getMyPath(): string {
    return `${this.getWhereAmI()}/${this.getWhoAmI()}`
  }
  getMyChildPath(child: string): string {
    return `${this.getMyPath()}/${child}`
  }
  getFolderDetails(): IFolderFileFrame {
    return this.folderDetails
  }
  getChildDirs(): string[] {
    return this.folderDetails.dirChildren
  }
  getChildFiles(): { [name: string]: IFileMeta } {
    return this.folderDetails.fileChildren
  }
  async getForFiletree(walletRef: IWalletHandler): Promise<EncodeObject> {
    if (!walletRef.traits)
      throw new Error(signerNotEnabled('FolderHandler', 'getForFiletree'))
    return await saveFileTreeEntry(
      walletRef.getJackalAddress(),
      this.getWhereAmI(),
      this.getWhoAmI(),
      this.folderDetails,
      walletRef
    )
  }
  async getChildMerkle(child: string): Promise<string> {
    return await merkleMeBro(
      `${this.getWhereAmI()}/${this.getWhoAmI()}/${child}`
    )
  }

  async addChildDirs(
    childNames: string[],
    walletRef: IWalletHandler
  ): Promise<{ encoded: EncodeObject[]; existing: string[] }> {
    const existing = childNames.filter((name) =>
      this.folderDetails.dirChildren.includes(name)
    )
    const more = childNames.filter(
      (name) => !this.folderDetails.dirChildren.includes(name)
    )
    const handlers: IFolderHandler[] = await Promise.all(
      more.map(
        async (name) =>
          await FolderHandler.trackNewFolder(this.makeChildDirInfo(name))
      )
    )
    const encoded: EncodeObject[] = await Promise.all(
      handlers.map(
        async (handler: IFolderHandler) =>
          await handler.getForFiletree(walletRef)
      )
    )
    if (more.length > 0) {
      this.folderDetails.dirChildren = [
        ...new Set([...this.folderDetails.dirChildren, ...more])
      ]
      encoded.push(await this.getForFiletree(walletRef))
    }
    return { encoded: encoded || [], existing }
  }
  async addChildFileReferences(
    newFiles: IFileMetaHashMap,
    walletRef: IWalletHandler
  ): Promise<EncodeObject> {
    this.folderDetails.fileChildren = {
      ...this.folderDetails.fileChildren,
      ...newFiles
    }
    return await this.getForFiletree(walletRef)
  }
  async removeChildDirReferences(
    toRemove: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject> {
    this.folderDetails.dirChildren = this.folderDetails.dirChildren.filter(
      (saved: string) => !toRemove.includes(saved)
    )
    return await this.getForFiletree(walletRef)
  }
  async removeChildFileReferences(
    toRemove: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject> {
    for (let i = 0; i < toRemove.length; i++) {
      delete this.folderDetails.fileChildren[toRemove[i]]
    }
    return await this.getForFiletree(walletRef)
  }
  async removeChildDirAndFileReferences(
    dirs: string[],
    files: string[],
    walletRef: IWalletHandler
  ): Promise<EncodeObject> {
    this.folderDetails.dirChildren = this.folderDetails.dirChildren.filter(
      (saved: string) => !dirs.includes(saved)
    )
    for (let i = 0; i < files.length; i++) {
      delete this.folderDetails.fileChildren[files[i]]
    }
    return await this.getForFiletree(walletRef)
  }

  makeChildDirInfo(childName: string): IChildDirInfo {
    const myName = stripper(childName)
    const myParent = `${this.folderDetails.whereAmI}/${this.folderDetails.whoAmI}`
    const myOwner = this.folderDetails.whoOwnsMe
    return { myName, myParent, myOwner }
  }
}
