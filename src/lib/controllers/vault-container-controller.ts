import type { IVaultContainerService } from '@brightchain/digitalburnbag-lib';
import { PlatformID } from '@digitaldefiance/ecies-lib';
import { CoreLanguageCode } from '@digitaldefiance/i18n-lib';
import { PlatformID as NodePlatformID } from '@digitaldefiance/node-ecies-lib';
import {
  BaseController,
  routeConfig,
  type ApiErrorResponse,
  type ApiRequestHandler,
  type IApiMessageResponse,
  type IApplication,
  type IStatusCodeResponse,
  type TypedHandlers,
} from '@digitaldefiance/node-express-suite';
import type { Request as ExpressRequest } from 'express';

type BurnbagResponse = IApiMessageResponse | ApiErrorResponse;

export interface IVaultContainerControllerDeps<TID extends PlatformID> {
  vaultContainerService: IVaultContainerService<TID>;
  parseId: (idString: string) => TID;
  parseSafeId?: (idString: string) => TID | undefined;
}

interface IVaultContainerHandlers extends TypedHandlers {
  listContainers: ApiRequestHandler<BurnbagResponse>;
  createContainer: ApiRequestHandler<BurnbagResponse>;
  getContainer: ApiRequestHandler<BurnbagResponse>;
  lockContainer: ApiRequestHandler<BurnbagResponse>;
  destroyContainer: ApiRequestHandler<BurnbagResponse>;
}

export class VaultContainerController<
  TID extends NodePlatformID = NodePlatformID,
> extends BaseController<
  BurnbagResponse,
  IVaultContainerHandlers,
  CoreLanguageCode,
  TID,
  IApplication<TID>
> {
  private readonly deps: IVaultContainerControllerDeps<TID>;

  constructor(
    application: IApplication<TID>,
    deps: IVaultContainerControllerDeps<TID>,
  ) {
    super(application);
    this.deps = deps;
  }

  private safeParseId(idString: string | undefined): TID | undefined {
    if (!idString) return undefined;
    if (this.deps.parseSafeId) return this.deps.parseSafeId(idString);
    try {
      return this.deps.parseId(idString);
    } catch {
      return undefined;
    }
  }

  protected initRouteDefinitions(): void {
    const auth = { useAuthentication: true, useCryptoAuthentication: false };
    this.routeDefinitions = [
      routeConfig('get', '/', { handlerKey: 'listContainers', ...auth }),
      routeConfig('post', '/', { handlerKey: 'createContainer', ...auth }),
      routeConfig('get', '/:id', { handlerKey: 'getContainer', ...auth }),
      routeConfig('post', '/:id/lock', {
        handlerKey: 'lockContainer',
        ...auth,
      }),
      routeConfig('post', '/:id/destroy', {
        handlerKey: 'destroyContainer',
        ...auth,
      }),
    ];
    this.handlers = {
      listContainers: this.handleListContainers.bind(this),
      createContainer: this.handleCreateContainer.bind(this),
      getContainer: this.handleGetContainer.bind(this),
      lockContainer: this.handleLockContainer.bind(this),
      destroyContainer: this.handleDestroyContainer.bind(this),
    };
  }

  private async handleListContainers(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: { message: 'Unauthorized', error: 'Unauthorized' },
      };
    const summaries =
      await this.deps.vaultContainerService.listContainers(requesterId);
    return {
      statusCode: 200,
      response: summaries.map((s) => ({
        id: String(s.container.id),
        name: s.container.name,
        description: s.container.description ?? null,
        state: s.container.state,
        fileCount: s.fileCount,
        folderCount: s.folderCount,
        sealStatus: {
          allPristine: s.sealStatus.allPristine,
          sealedCount: s.sealStatus.sealedCount,
          accessedCount: s.sealStatus.accessedCount,
          totalFiles: s.sealStatus.totalFiles,
        },
        usedBytes: s.container.usedBytes,
        quotaBytes: s.container.quotaBytes ?? null,
        createdAt: s.container.createdAt,
      })) as unknown as IApiMessageResponse,
    };
  }

  private async handleCreateContainer(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: { message: 'Unauthorized', error: 'Unauthorized' },
      };
    const { name, description, quotaBytes, approvalGoverned } = req.body;
    if (!name)
      return {
        statusCode: 400,
        response: { message: 'name is required', error: 'Bad Request' },
      };
    const container = await this.deps.vaultContainerService.createContainer({
      name,
      description,
      ownerId: requesterId,
      quotaBytes,
      approvalGoverned,
    });
    return {
      statusCode: 201,
      response: {
        id: String(container.id),
        name: container.name,
        description: container.description ?? null,
        state: container.state,
        rootFolderId: String(container.rootFolderId),
        createdAt: container.createdAt,
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleGetContainer(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: { message: 'Unauthorized', error: 'Unauthorized' },
      };
    const containerId = this.safeParseId(req.params.id as string);
    if (!containerId)
      return {
        statusCode: 400,
        response: { message: 'Invalid container ID', error: 'Bad Request' },
      };
    const container = await this.deps.vaultContainerService.getContainer(
      containerId,
      requesterId,
    );
    return {
      statusCode: 200,
      response: {
        id: String(container.id),
        name: container.name,
        description: container.description ?? null,
        state: container.state,
        rootFolderId: String(container.rootFolderId),
        usedBytes: container.usedBytes,
        quotaBytes: container.quotaBytes ?? null,
        createdAt: container.createdAt,
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleLockContainer(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: { message: 'Unauthorized', error: 'Unauthorized' },
      };
    const containerId = this.safeParseId(req.params.id as string);
    if (!containerId)
      return {
        statusCode: 400,
        response: { message: 'Invalid container ID', error: 'Bad Request' },
      };
    const container = await this.deps.vaultContainerService.lockContainer(
      containerId,
      requesterId,
    );
    return {
      statusCode: 200,
      response: {
        id: String(container.id),
        state: container.state,
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleDestroyContainer(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: { message: 'Unauthorized', error: 'Unauthorized' },
      };
    const containerId = this.safeParseId(req.params.id as string);
    if (!containerId)
      return {
        statusCode: 400,
        response: { message: 'Invalid container ID', error: 'Bad Request' },
      };
    const result = await this.deps.vaultContainerService.destroyContainer(
      containerId,
      requesterId,
    );
    return {
      statusCode: 200,
      response: {
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      } as unknown as IApiMessageResponse,
    };
  }
}
