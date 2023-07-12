import { IEditorsViewers } from '@/interfaces'

export interface IFileConfigRelevant {
  editAccess: IEditorsViewers // object of sha256 hash of wallet address:enc aes key
  viewingAccess: IEditorsViewers // object of sha256 hash of wallet address:enc aes key
  trackingNumber: string // uuid
}
