import { DeliverTxResponse } from '@cosmjs/stargate'
import {
  IPayData,
  ISharedTracker,
  IStoragePaymentInfo,
  IStray
} from '@/interfaces'
import { EncodeObject } from '@cosmjs/proto-signing'

export interface IStorageHandler {
  buyStorage(
    forAddress: string,
    duration: number,
    space: number
  ): Promise<DeliverTxResponse>
  upgradeStorage(
    forAddress: string,
    duration: number,
    space: number
  ): Promise<DeliverTxResponse>
  makeStorageInitMsg(): EncodeObject
  getAllStrays(): Promise<IStray[]>
  getClientFreeSpace(address: string): Promise<number>
  getStorageJklPrice(space: number, duration: number): Promise<number>
  getPayData(address: string): Promise<IPayData>
  getStoragePaymentInfo(address: string): Promise<IStoragePaymentInfo>
  saveSharing(toAddress: string, shared: ISharedTracker): Promise<EncodeObject>
  readSharing(owner: string, rawPath: string): Promise<ISharedTracker>
  stopSharing(rawPath: string): Promise<EncodeObject>
}
