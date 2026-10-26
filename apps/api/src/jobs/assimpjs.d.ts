// assimpjs không kèm kiểu (item 03 lát R2, DEC-R14) — dùng qua readModel trong modelImport.ts
declare module 'assimpjs' {
  const init: () => Promise<unknown>
  export default init
}
