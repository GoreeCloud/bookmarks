import type { NextApiRequest, NextApiResponse } from "next";
import exportData from "@/lib/api/controllers/migration/exportData";
import importFromHTMLFile from "@/lib/api/controllers/migration/importFromHTMLFile";
import importFromLinkwarden from "@/lib/api/controllers/migration/importFromLinkwarden";
import { MigrationFormat, MigrationRequest } from "@linkwarden/types/global";
import verifyUser from "@/lib/api/verifyUser";
import importFromWallabag from "@/lib/api/controllers/migration/importFromWallabag";
import importFromOmnivore from "@/lib/api/controllers/migration/importFromOmnivore";
import importFromPocket from "@/lib/api/controllers/migration/importFromPocket";
import {
  MigrationPayloadError,
  readBoundedMigrationJson,
  resolveMigrationLimitMb,
} from "@/lib/api/controllers/migration/readBoundedMigrationJson";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function users(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "GET") {
    const data = await exportData(user.id);

    if (data.status === 200)
      return res
        .setHeader("Content-Type", "application/json")
        .setHeader("Content-Disposition", "attachment; filename=backup.json")
        .status(data.status)
        .json(data.response);
  } else if (req.method === "POST") {
    if (process.env.NEXT_PUBLIC_DEMO === "true")
      return res.status(400).json({
        response:
          "This action is disabled because this is a read-only demo of Linkwarden.",
      });

    let request: MigrationRequest;
    const limitMb = resolveMigrationLimitMb(process.env.IMPORT_LIMIT);

    try {
      const candidate = await readBoundedMigrationJson(
        req,
        limitMb * 1024 * 1024
      );
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate) ||
        typeof (candidate as { data?: unknown }).data !== "string" ||
        !Object.values(MigrationFormat)
          .filter((value) => typeof value === "number")
          .includes((candidate as { format?: unknown }).format as number)
      ) {
        throw new MigrationPayloadError("invalid");
      }
      request = candidate as MigrationRequest;
    } catch (error: any) {
      if (
        error instanceof MigrationPayloadError &&
        error.code === "too-large"
      ) {
        return res.status(413).json({
          response: `Import file exceeds the ${limitMb}MB size limit.`,
        });
      }
      return res
        .status(400)
        .json({ response: "Invalid request body provided." });
    }

    let data;
    if (request.format === MigrationFormat.htmlFile)
      data = await importFromHTMLFile(user.id, request.data);
    else if (request.format === MigrationFormat.linkwarden)
      data = await importFromLinkwarden(user.id, request.data);
    else if (request.format === MigrationFormat.wallabag)
      data = await importFromWallabag(user.id, request.data);
    else if (request.format === MigrationFormat.omnivore)
      data = await importFromOmnivore(user.id, request.data);
    else if (request.format === MigrationFormat.pocket)
      data = await importFromPocket(user.id, request.data);

    if (data) return res.status(data.status).json({ response: data.response });
  }
}
