await Bun.build({
  entrypoints: ["../index.html"],
  outdir: "../dist",
  minify: true,
});

// Copy folders after build
await Bun.$`cp -r ../icons ../productions ../dist/`;