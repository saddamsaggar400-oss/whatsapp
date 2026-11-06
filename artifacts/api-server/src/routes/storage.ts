import { Readable } from 'stream';
import { getAuth } from '@clerk/express';
import {
  CleanupMediaBody,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { db, mediaFilesTable } from '@workspace/db';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import {
  deletePendingMedia,
} from '../lib/mediaCleanup';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!getAuth(req).userId) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    let objectPath: string | null = null;
    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      await db.insert(mediaFilesTable).values({
        objectPath,
        name,
        contentType,
        size,
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      if (objectPath) {
        try {
          await objectStorageService.deleteObjectEntity(objectPath);
        } catch (cleanupError) {
          req.log.error(
            { err: cleanupError, objectPath },
            'Failed to clean up upload URL object',
          );
        }
      }
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

router.post(
  '/media/cleanup',
  async (req: Request, res: Response): Promise<void> => {
    if (!getAuth(req).userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = CleanupMediaBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid media cleanup request' });
      return;
    }

    try {
      const result = await deletePendingMedia(parsed.data.objectPath);
      if (result === 'not-found') {
        res.status(404).json({ error: 'Media metadata not found' });
        return;
      }
      if (result === 'linked') {
        res.status(409).json({ error: 'Media is already attached to a post' });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.error({ err: error }, 'Failed to clean up media');
      res.status(500).json({ error: 'Failed to clean up media' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
