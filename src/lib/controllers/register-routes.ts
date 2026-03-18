import { PlatformID } from '@digitaldefiance/ecies-lib';
import { PlatformID as NodePlatformID } from '@digitaldefiance/node-ecies-lib';
import { type IApplication } from '@digitaldefiance/node-express-suite';
import { Router } from 'express';
import type { IACLControllerDeps } from './acl-controller';
import { ACLController } from './acl-controller';
import type { IAnalyticsControllerDeps } from './analytics-controller';
import { AnalyticsController } from './analytics-controller';
import type { IApprovalControllerDeps } from './approval-controller';
import { ApprovalController } from './approval-controller';
import type { IAuditControllerDeps } from './audit-controller';
import { AuditController } from './audit-controller';
import type { ICanaryControllerDeps } from './canary-controller';
import { CanaryController } from './canary-controller';
import type { IDestructionControllerDeps } from './destruction-controller';
import { DestructionController } from './destruction-controller';
import type { IFileControllerDeps } from './file-controller';
import { FileController } from './file-controller';
import type { IFolderControllerDeps } from './folder-controller';
import { FolderController } from './folder-controller';
import type { IFolderExportControllerDeps } from './folder-export-controller';
import { FolderExportController } from './folder-export-controller';
import type { INotificationControllerDeps } from './notification-controller';
import { NotificationController } from './notification-controller';
import type { IShareControllerDeps } from './share-controller';
import { ShareController } from './share-controller';
import type { IStorageQuotaControllerDeps } from './storage-quota-controller';
import { StorageQuotaController } from './storage-quota-controller';
import type { IUploadControllerDeps } from './upload-controller';
import { UploadController } from './upload-controller';
import type { IVaultContainerControllerDeps } from './vault-container-controller';
import { VaultContainerController } from './vault-container-controller';

export interface IAllBurnbagControllerDeps<TID extends PlatformID>
  extends IUploadControllerDeps<TID>,
    IFileControllerDeps<TID>,
    IFolderControllerDeps<TID>,
    IACLControllerDeps<TID>,
    IShareControllerDeps<TID>,
    IDestructionControllerDeps<TID>,
    ICanaryControllerDeps<TID>,
    IApprovalControllerDeps<TID>,
    IAuditControllerDeps<TID>,
    IFolderExportControllerDeps<TID>,
    INotificationControllerDeps<TID>,
    IStorageQuotaControllerDeps<TID>,
    IVaultContainerControllerDeps<TID>,
    IAnalyticsControllerDeps<TID> {}

/**
 * Register all Digital Burnbag routes on an Express Router using class-based controllers.
 * Each controller extends BaseController and handles its own authentication via routeConfig.
 *
 * @param router - The Express router to mount routes on
 * @param application - The BrightChain application instance (provides auth infrastructure)
 * @param deps - All controller dependencies
 * @param prefix - URL prefix for all routes (default: '/burnbag')
 */
export function registerBurnbagRoutesOnRouter<
  TID extends NodePlatformID = NodePlatformID,
>(
  router: Router,
  application: IApplication<TID>,
  deps: IAllBurnbagControllerDeps<TID>,
  prefix = '/burnbag',
): void {
  const upload = new UploadController<TID>(application, deps);
  const file = new FileController<TID>(application, deps);
  const folder = new FolderController<TID>(application, deps);
  const acl = new ACLController<TID>(application, deps);
  const share = new ShareController<TID>(application, deps);
  const destruction = new DestructionController<TID>(application, deps);
  const canary = new CanaryController<TID>(application, deps);
  const approval = new ApprovalController<TID>(application, deps);
  const audit = new AuditController<TID>(application, deps);
  const folderExport = new FolderExportController<TID>(application, deps);
  const notification = new NotificationController<TID>(application, deps);
  const storageQuota = new StorageQuotaController<TID>(application, deps);
  const vaultContainer = new VaultContainerController<TID>(application, deps);
  const analytics = new AnalyticsController<TID>(application, deps);

  router.use(`${prefix}/upload`, upload.router);
  router.use(`${prefix}/files`, file.router);
  router.use(`${prefix}/folders`, folder.router);
  router.use(`${prefix}/acl`, acl.router);
  router.use(`${prefix}/share`, share.router);
  router.use(`${prefix}/destroy`, destruction.router);
  router.use(`${prefix}/canary`, canary.router);
  router.use(`${prefix}/approval`, approval.router);
  router.use(`${prefix}/audit`, audit.router);
  router.use(`${prefix}/folders`, folderExport.router);
  router.use(`${prefix}/notifications`, notification.router);
  router.use(`${prefix}/quota`, storageQuota.router);
  router.use(`${prefix}/vaults`, vaultContainer.router);
  router.use(`${prefix}/providers`, analytics.router);
}
