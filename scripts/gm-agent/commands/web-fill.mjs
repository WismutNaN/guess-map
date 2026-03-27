import {
  cmdFillGoogleCars,
  cmdFillPoles,
  cmdFillCameraGens,
  cmdFillSnowCoverage,
  cmdFillArchitecture,
} from "../fill-hints.mjs";

function webFillDeps(ctx) {
  return {
    api: ctx.api,
    ensureHintTypeExists: ctx.ensureHintTypeExists,
    uploadAssetFromUrl: ctx.uploadAssetFromUrl,
    printJson: ctx.printJson,
  };
}

export const webFillCommands = [
  {
    name: "fill-google-cars",
    usage: "fill-google-cars [--country XX] [--force] [--no-compile]",
    description: "Import Google Car hints from Geometas",
    run: (args, ctx) => cmdFillGoogleCars(args, webFillDeps(ctx)),
  },
  {
    name: "fill-poles",
    usage: "fill-poles [--country XX] [--force] [--no-compile]",
    description: "Import poles hints from Geometas",
    run: (args, ctx) => cmdFillPoles(args, webFillDeps(ctx)),
  },
  {
    name: "fill-camera-gens",
    usage: "fill-camera-gens [--country XX] [--force] [--no-compile]",
    description: "Import camera generation layers from GeoHints",
    run: (args, ctx) => cmdFillCameraGens(args, webFillDeps(ctx)),
  },
  {
    name: "fill-snow-coverage",
    usage: "fill-snow-coverage [--country XX] [--force] [--no-compile]",
    description: "Import snow coverage layer from GeoHints",
    run: (args, ctx) => cmdFillSnowCoverage(args, webFillDeps(ctx)),
  },
  {
    name: "fill-architecture",
    usage: "fill-architecture [--country XX] [--force] [--no-compile]",
    description: "Import architecture examples from GeoHints",
    run: (args, ctx) => cmdFillArchitecture(args, webFillDeps(ctx)),
  },
];

export const commands = webFillCommands;

