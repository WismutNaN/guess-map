import {
  cmdFillGoogleCars,
  cmdFillPoles,
  cmdFillCameraGens,
  cmdFillSnowCoverage,
  cmdFillArchitecture,
  cmdFillGasStations,
  cmdFillBollardsGeoHints,
  cmdFillPolesGeoHints,
  cmdFillSceneries,
  cmdFillNature,
  cmdFillHouseNumbers,
  cmdFillLicensePlates,
  cmdFillCurbs,
  cmdFillFollowCars,
  cmdFillRifts,
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
  {
    name: "fill-gas-stations",
    usage: "fill-gas-stations [--country XX] [--force] [--no-compile]",
    description: "Import gas station brands from GeoHints",
    run: (args, ctx) => cmdFillGasStations(args, webFillDeps(ctx)),
  },
  {
    name: "fill-bollards-geohints",
    usage: "fill-bollards-geohints [--country XX] [--force] [--no-compile]",
    description: "Import bollards from GeoHints and merge with existing hints",
    run: (args, ctx) => cmdFillBollardsGeoHints(args, webFillDeps(ctx)),
  },
  {
    name: "fill-poles-geohints",
    usage: "fill-poles-geohints [--country XX] [--force] [--no-compile]",
    description: "Import utility poles from GeoHints and merge with existing hints",
    run: (args, ctx) => cmdFillPolesGeoHints(args, webFillDeps(ctx)),
  },
  {
    name: "fill-sceneries",
    usage: "fill-sceneries [--country XX] [--force] [--no-compile]",
    description: "Import scenery examples from GeoHints",
    run: (args, ctx) => cmdFillSceneries(args, webFillDeps(ctx)),
  },
  {
    name: "fill-nature",
    usage: "fill-nature [--country XX] [--force] [--no-compile]",
    description: "Import nature examples from GeoHints",
    run: (args, ctx) => cmdFillNature(args, webFillDeps(ctx)),
  },
  {
    name: "fill-house-numbers",
    usage: "fill-house-numbers [--country XX] [--force] [--no-compile]",
    description: "Import house number plates from GeoHints",
    run: (args, ctx) => cmdFillHouseNumbers(args, webFillDeps(ctx)),
  },
  {
    name: "fill-license-plates",
    usage: "fill-license-plates [--country XX] [--force] [--no-compile]",
    description: "Import license plate examples from GeoHints",
    run: (args, ctx) => cmdFillLicensePlates(args, webFillDeps(ctx)),
  },
  {
    name: "fill-curbs",
    usage: "fill-curbs [--country XX] [--force] [--no-compile]",
    description: "Import curb examples from GeoHints sidewalks",
    run: (args, ctx) => cmdFillCurbs(args, webFillDeps(ctx)),
  },
  {
    name: "fill-follow-cars",
    usage: "fill-follow-cars [--country XX] [--force] [--no-compile]",
    description: "Import follow car examples from GeoHints",
    run: (args, ctx) => cmdFillFollowCars(args, webFillDeps(ctx)),
  },
  {
    name: "fill-rifts",
    usage: "fill-rifts [--country XX] [--force] [--no-compile]",
    description: "Import camera rift examples from GeoHints",
    run: (args, ctx) => cmdFillRifts(args, webFillDeps(ctx)),
  },
];

export const commands = webFillCommands;
