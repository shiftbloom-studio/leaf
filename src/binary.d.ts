// Binary imports: wrangler's Data rule and esbuild's binary loader both turn *.png into bytes.
declare module "*.png" {
  const data: ArrayBuffer;
  export default data;
}
