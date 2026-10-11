import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeFile } from "./removeFile";

vi.mock("fs", () => ({
  default: {
    unlink: vi.fn(),
  },
}));

vi.mock("./s3Client", () => ({
  default: null,
}));

describe("removeFile", () => {
  const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.STORAGE_FOLDER;
  });

  it("ignores missing local files", async () => {
    vi.mocked(fs.unlink).mockImplementation((_path, callback) => {
      callback({ code: "ENOENT" } as NodeJS.ErrnoException);
    });

    await removeFile({ filePath: "archives/1/2.jpg" });

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("logs unexpected local delete errors", async () => {
    const error = { code: "EACCES" } as NodeJS.ErrnoException;
    vi.mocked(fs.unlink).mockImplementation((_path, callback) => {
      callback(error);
    });

    await removeFile({ filePath: "archives/1/2.jpg" });

    expect(consoleLog).toHaveBeenCalledWith(error);
  });
});
