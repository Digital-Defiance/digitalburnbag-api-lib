import type {
  IStorageQuotaService,
  IUploadService,
  IFileService,
} from '@brightchain/digitalburnbag-lib';
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
import { raw as expressRaw } from 'express';

type BurnbagResponse = IApiMessageResponse | ApiErrorResponse;

/** Convert a TID to a hex string for JSON-safe responses. */
function sid<TID extends PlatformID>(value: TID | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return Buffer.from(value).toString('hex');
  }
  return String(value);
}

export interface IUploadControllerDeps<TID extends PlatformID> {
  uploadService: IUploadService<TID>;
  storageQuotaService: IStorageQuotaService<TID>;
  fileService: IFileService<TID>;
  parseId: (idString: string) => TID;
}

interface IUploadHandlers extends TypedHandlers {
  initUpload: ApiRequestHandler<BurnbagResponse>;
  initNewVersionUpload: ApiRequestHandler<BurnbagResponse>;
  receiveChunk: ApiRequestHandler<BurnbagResponse>;
  finalize: ApiRequestHandler<BurnbagResponse>;
  getStatus: ApiRequestHandler<BurnbagResponse>;
}

export class UploadController<
  TID extends NodePlatformID = NodePlatformID,
> extends BaseController<
  BurnbagResponse,
  IUploadHandlers,
  CoreLanguageCode,
  TID,
  IApplication<TID>
> {
  private readonly deps: IUploadControllerDeps<TID>;

  constructor(
    application: IApplication<TID>,
    deps: IUploadControllerDeps<TID>,
  ) {
    super(application);
    this.deps = deps;
  }

  private safeParseId(idString: string | undefined): TID | undefined {
    if (!idString) return undefined;
    try {
      return this.deps.parseId(idString);
    } catch {
      return undefined;
    }
  }

  protected initRouteDefinitions(): void {
    const auth = { useAuthentication: true, useCryptoAuthentication: false };

    const chunkRoute = routeConfig<IUploadHandlers, CoreLanguageCode>(
      'put',
      '/:sessionId/chunk/:index',
      { handlerKey: 'receiveChunk', ...auth },
    );
    // Binary body — express.json() skips application/octet-stream, so we
    // need express.raw() to populate req.body with a Buffer.
    chunkRoute.middleware = [
      expressRaw({ type: 'application/octet-stream', limit: '64mb' }),
    ];

    this.routeDefinitions = [
      routeConfig('post', '/init', { handlerKey: 'initUpload', ...auth }),
      routeConfig('post', '/new-version', {
        handlerKey: 'initNewVersionUpload',
        ...auth,
      }),
      chunkRoute,
      routeConfig('post', '/:sessionId/finalize', {
        handlerKey: 'finalize',
        ...auth,
      }),
      routeConfig('get', '/:sessionId/status', {
        handlerKey: 'getStatus',
        ...auth,
      }),
    ];
    this.handlers = {
      initUpload: this.handleInitUpload.bind(this),
      initNewVersionUpload: this.handleInitNewVersionUpload.bind(this),
      receiveChunk: this.handleReceiveChunk.bind(this),
      finalize: this.handleFinalize.bind(this),
      getStatus: this.handleGetStatus.bind(this),
    };
  }

  private async handleInitUpload(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: {
          message: 'Invalid or missing authentication',
          error: 'Unauthorized',
        } as unknown as BurnbagResponse,
      };
    const {
      fileName,
      mimeType,
      totalSizeBytes,
      targetFolderId,
      vaultContainerId,
    } = req.body;
    const parsedTotalSizeBytes = Number(totalSizeBytes);
    if (!Number.isFinite(parsedTotalSizeBytes) || parsedTotalSizeBytes <= 0) {
      return {
        statusCode: 400,
        response: {
          message: 'totalSizeBytes must be a positive number',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    }
    await this.deps.storageQuotaService.checkQuota(
      requesterId,
      parsedTotalSizeBytes,
    );
    const parsedFolderId =
      typeof targetFolderId === 'string'
        ? this.safeParseId(targetFolderId)
        : targetFolderId;
    console.debug(
      '[UploadController] initUpload: targetFolderId=%s parsedFolderId=%s parsedFolderIdType=%s',
      targetFolderId,
      parsedFolderId ? sid(parsedFolderId as TID) : 'undefined',
      typeof parsedFolderId,
    );
    if (!parsedFolderId) {
      return {
        statusCode: 400,
        response: {
          message: 'Invalid or missing targetFolderId',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    }
    const parsedVaultContainerId =
      typeof vaultContainerId === 'string'
        ? this.safeParseId(vaultContainerId)
        : vaultContainerId;
    if (!parsedVaultContainerId) {
      return {
        statusCode: 400,
        response: {
          message: 'Invalid or missing vaultContainerId',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    }
    const session = await this.deps.uploadService.createSession({
      userId: requesterId,
      fileName,
      mimeType,
      totalSizeBytes: parsedTotalSizeBytes,
      targetFolderId: parsedFolderId as TID,
      vaultContainerId: parsedVaultContainerId as TID,
    });
    return {
      statusCode: 201,
      response: {
        sessionId: sid(session.id),
        chunkSize: session.chunkSizeBytes,
        totalChunks: session.totalChunks,
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleInitNewVersionUpload(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const requesterId = this.safeParseId(req.user?.id as string);
    if (!requesterId)
      return {
        statusCode: 401,
        response: {
          message: 'Invalid or missing authentication',
          error: 'Unauthorized',
        } as unknown as BurnbagResponse,
      };

    const { fileId, fileName, mimeType, totalSizeBytes } = req.body;

    const parsedFileId =
      typeof fileId === 'string' ? this.safeParseId(fileId) : fileId;
    if (!parsedFileId) {
      return {
        statusCode: 400,
        response: {
          message: 'Invalid or missing fileId',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    }

    const parsedTotalSizeBytes = Number(totalSizeBytes);
    if (!Number.isFinite(parsedTotalSizeBytes) || parsedTotalSizeBytes <= 0) {
      return {
        statusCode: 400,
        response: {
          message: 'totalSizeBytes must be a positive number',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    }

    // Fetch existing file metadata to validate MIME type
    let existingMetadata;
    try {
      existingMetadata = await this.deps.fileService.getFileMetadata(
        parsedFileId as TID,
        requesterId,
      );
    } catch {
      return {
        statusCode: 404,
        response: {
          message: `File not found: ${fileId}`,
          error: 'Not Found',
        } as unknown as BurnbagResponse,
      };
    }

    // Enforce MIME type consistency
    if (mimeType && existingMetadata.mimeType !== mimeType) {
      return {
        statusCode: 409,
        response: {
          message:
            `MIME type mismatch: file is "${existingMetadata.mimeType}" ` +
            `but received "${mimeType}". Upload a file with the same type.`,
          error: 'Conflict',
        } as unknown as BurnbagResponse,
      };
    }

    await this.deps.storageQuotaService.checkQuota(
      requesterId,
      parsedTotalSizeBytes,
    );

    const session = await this.deps.uploadService.createNewVersionSession({
      userId: requesterId,
      fileId: parsedFileId as TID,
      fileName: fileName ?? existingMetadata.fileName,
      mimeType: existingMetadata.mimeType,
      totalSizeBytes: parsedTotalSizeBytes,
    });

    return {
      statusCode: 201,
      response: {
        sessionId: sid(session.id),
        chunkSize: session.chunkSizeBytes,
        totalChunks: session.totalChunks,
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleReceiveChunk(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const sessionId = this.safeParseId(req.params.sessionId as string);
    if (!sessionId)
      return {
        statusCode: 400,
        response: {
          message: 'Invalid session ID format',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    const chunkIndex = parseInt(req.params.index as string, 10);
    const checksum = req.headers['x-chunk-checksum'] as string;
    const data = req.body as Uint8Array;
    const receipt = await this.deps.uploadService.receiveChunk(
      sessionId,
      chunkIndex,
      data,
      checksum,
    );
    return {
      statusCode: 200,
      response: receipt as unknown as IApiMessageResponse,
    };
  }

  private async handleFinalize(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const sessionId = this.safeParseId(req.params.sessionId as string);
    if (!sessionId)
      return {
        statusCode: 400,
        response: {
          message: 'Invalid session ID format',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    const fileMetadata = await this.deps.uploadService.finalize(sessionId);
    return {
      statusCode: 200,
      response: {
        fileId: sid(fileMetadata.id),
        metadata: {
          ...fileMetadata,
          id: sid(fileMetadata.id),
          ownerId: sid(fileMetadata.ownerId),
          folderId: sid(fileMetadata.folderId),
          currentVersionId: sid(fileMetadata.currentVersionId),
          createdBy: sid(fileMetadata.createdBy as unknown as TID),
          updatedBy: sid(fileMetadata.updatedBy as unknown as TID),
          vaultCreationLedgerEntryHash:
            fileMetadata.vaultCreationLedgerEntryHash
              ? Buffer.from(fileMetadata.vaultCreationLedgerEntryHash).toString(
                  'hex',
                )
              : null,
        },
      } as unknown as IApiMessageResponse,
    };
  }

  private async handleGetStatus(
    req: ExpressRequest,
  ): Promise<IStatusCodeResponse<BurnbagResponse>> {
    const sessionId = this.safeParseId(req.params.sessionId as string);
    if (!sessionId)
      return {
        statusCode: 400,
        response: {
          message: 'Invalid session ID format',
          error: 'Bad Request',
        } as unknown as BurnbagResponse,
      };
    const status = await this.deps.uploadService.getSessionStatus(sessionId);
    return {
      statusCode: 200,
      response: status as unknown as IApiMessageResponse,
    };
  }
}
