import type { Collection } from '@brightchain/db';
import type {
  IFileMetadataBase,
  IVaultContainerBase,
  IVaultContainerRepository,
} from '@brightchain/digitalburnbag-lib';
import { PlatformID } from '@digitaldefiance/ecies-lib';
import { filter, fromDoc, toDoc, type IdSerializer } from './brightdb-helpers';

export class BrightDBVaultContainerRepository<TID extends PlatformID>
  implements IVaultContainerRepository<TID>
{
  constructor(
    private readonly containers: Collection,
    private readonly folders: Collection,
    private readonly fileMetadata: Collection,
    private readonly ids: IdSerializer<TID>,
  ) {}

  async getContainerById(
    containerId: TID,
  ): Promise<IVaultContainerBase<TID> | null> {
    const doc = await this.containers.findOne(
      filter({ _id: containerId }, this.ids),
    );
    return doc ? fromDoc<TID, IVaultContainerBase<TID>>(doc, this.ids) : null;
  }

  async getContainersByOwner(
    ownerId: TID,
  ): Promise<IVaultContainerBase<TID>[]> {
    const docs = await this.containers
      .find(filter({ ownerId }, this.ids))
      .toArray();
    return docs.map((d) => fromDoc<TID, IVaultContainerBase<TID>>(d, this.ids));
  }

  async createContainer(
    container: IVaultContainerBase<TID>,
  ): Promise<IVaultContainerBase<TID>> {
    await this.containers.insertOne(toDoc(container, this.ids));
    return container;
  }

  async updateContainer(
    containerId: TID,
    updates: Partial<IVaultContainerBase<TID>>,
  ): Promise<IVaultContainerBase<TID>> {
    const { id: _id, ...rest } = updates as Record<string, unknown>;
    const setFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value instanceof Uint8Array) {
        setFields[key] = this.ids.idToString(value as TID);
      } else {
        setFields[key] = value;
      }
    }
    await this.containers.updateOne(filter({ _id: containerId }, this.ids), {
      $set: setFields,
    });
    const updated = await this.getContainerById(containerId);
    if (!updated) throw new Error('Container not found after update');
    return updated;
  }

  async containerNameExists(name: string, ownerId: TID): Promise<boolean> {
    const count = await this.containers.countDocuments(
      filter({ name, ownerId }, this.ids),
    );
    return count > 0;
  }

  async getAllFileIdsInContainer(containerId: TID): Promise<TID[]> {
    // Get all folders in this container
    const folderDocs = await this.folders
      .find(filter({ vaultContainerId: containerId }, this.ids))
      .toArray();
    const folderIds = folderDocs.map(
      (d) => (d as Record<string, unknown>)._id as string,
    );
    if (folderIds.length === 0) return [];

    const fileDocs = await this.fileMetadata
      .find({ folderId: { $in: folderIds } })
      .toArray();
    return fileDocs.map((d) => {
      const id = (d as Record<string, unknown>)._id as string;
      return this.ids.parseId(id);
    });
  }

  async getAllFilesInContainer(
    containerId: TID,
  ): Promise<IFileMetadataBase<TID>[]> {
    const folderDocs = await this.folders
      .find(filter({ vaultContainerId: containerId }, this.ids))
      .toArray();
    const folderIds = folderDocs.map(
      (d) => (d as Record<string, unknown>)._id as string,
    );
    if (folderIds.length === 0) return [];

    const fileDocs = await this.fileMetadata
      .find({ folderId: { $in: folderIds } })
      .toArray();
    return fileDocs.map((d) =>
      fromDoc<TID, IFileMetadataBase<TID>>(d, this.ids),
    );
  }

  async getFileCount(containerId: TID): Promise<number> {
    const folderDocs = await this.folders
      .find(filter({ vaultContainerId: containerId }, this.ids))
      .toArray();
    const folderIds = folderDocs.map(
      (d) => (d as Record<string, unknown>)._id as string,
    );
    if (folderIds.length === 0) return 0;
    return this.fileMetadata.countDocuments({
      folderId: { $in: folderIds },
    });
  }

  async getFolderCount(containerId: TID): Promise<number> {
    return this.folders.countDocuments(
      filter({ vaultContainerId: containerId }, this.ids),
    );
  }
}
