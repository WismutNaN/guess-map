import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

async function cmdUploadAsset(args, ctx) {
  const filePath = args[0];
  const opts = args.slice(1);

  if (!filePath || !existsSync(filePath)) {
    console.error("Usage: upload-asset <file> [--kind K] [--caption C]");
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let kind = "sample";
  let caption = null;
  for (let i = 0; i < opts.length; i++) {
    if (opts[i] === "--kind") kind = opts[++i];
    else if (opts[i] === "--caption") caption = opts[++i];
    else {
      console.error("Usage: upload-asset <file> [--kind K] [--caption C]");
      process.exit(1);
    }
  }

  const bytes = readFileSync(filePath);
  const data64 = bytes.toString("base64");
  const fileName = basename(filePath);
  const payload = { file_name: fileName, data: data64, kind, caption };
  const result = await ctx.api("POST", "/api/assets", payload);
  ctx.printJson(result);
}

async function cmdUploadAssetUrl(args, ctx) {
  const url = args[0];
  const opts = args.slice(1);
  if (!url) {
    console.error("Usage: upload-asset-url <url> [--name N] [--kind K] [--caption C]");
    process.exit(1);
  }

  let kind = "sample";
  let caption = null;
  let name = null;
  for (let i = 0; i < opts.length; i++) {
    if (opts[i] === "--kind") kind = opts[++i];
    else if (opts[i] === "--caption") caption = opts[++i];
    else if (opts[i] === "--name") name = opts[++i];
    else {
      console.error("Usage: upload-asset-url <url> [--name N] [--kind K] [--caption C]");
      process.exit(1);
    }
  }

  try {
    console.error(`Downloading: ${url}`);
    const result = await ctx.uploadAssetFromUrl(url, { name, kind, caption });
    ctx.printJson(result);
  } catch (error) {
    console.error(String(error));
    process.exit(1);
  }
}

export const assetCommands = [
  {
    name: "upload-asset",
    usage: "upload-asset <file> [--kind K] [--caption C]",
    description: "Upload local image/file as asset",
    run: cmdUploadAsset,
  },
  {
    name: "upload-asset-url",
    usage: "upload-asset-url <url> [--name N] [--kind K] [--caption C]",
    description: "Download and upload external image as asset",
    run: cmdUploadAssetUrl,
  },
];

export const commands = assetCommands;
