async function cmdCompile(args, ctx) {
  const codes = args[0];
  if (args.length > 1) {
    console.error("Usage: compile [code1,code2,...]");
    process.exit(1);
  }
  const payload = {};
  if (codes) {
    payload.hint_type_codes = codes.split(",").map((c) => c.trim());
  }
  const data = await ctx.api("POST", "/api/layers/compile", payload);
  ctx.printJson(data);
}

async function cmdDeleteHint(args, ctx) {
  const id = args[0];
  if (!id || args.length > 1) {
    console.error("Usage: delete-hint <id>");
    process.exit(1);
  }
  await ctx.api("DELETE", `/api/hints/${id}`);
  console.log(`Deleted hint ${id}`);
}

export const adminCommands = [
  {
    name: "compile",
    usage: "compile [code1,code2,...]",
    description: "Recompile one or many layers",
    run: cmdCompile,
  },
  {
    name: "delete-hint",
    usage: "delete-hint <id>",
    description: "Delete one hint by id",
    run: cmdDeleteHint,
  },
];

export const commands = adminCommands;
