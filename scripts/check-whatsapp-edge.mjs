// Type-check Edge sources against installed SDK types, with minimal Deno runtime declarations.
import ts from "typescript";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "brasper-edge-types-"));
try {
  const globals = join(temp, "globals.d.ts");
  writeFileSync(
    globals,
    "declare const Deno: { env: { get(name:string):string|undefined }; serve(handler:(request:Request)=>Promise<Response>|Response):void }; declare const EdgeRuntime: {waitUntil(promise:Promise<unknown>):void};",
  );
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
  };
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, containing) =>
    names.map(
      (n) =>
        ts.resolveModuleName(
          n.startsWith("npm:") ? n.slice(4).replace(/@\d[\d.]*$/, "") : n,
          containing,
          options,
          host,
        ).resolvedModule,
    );
  const roots = ["whatsapp-flow", "whatsapp-webhook", "whatsapp-session"].map((n) =>
    resolve("supabase/functions", n, "index.ts"),
  );
  const program = ts.createProgram([...roots, globals], options, host),
    diags = ts.getPreEmitDiagnostics(program);
  for (const d of diags) {
    const at =
      d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
    console.log(
      (d.file?.fileName || "") +
        (at ? ":" + (at.line + 1) : "") +
        " " +
        ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    );
  }
  console.log(
    diags.length
      ? "Edge types: " + diags.length + " error(s)"
      : "Edge TypeScript: OK (Deno deployment test remains separate).",
  );
  if (diags.length) process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
