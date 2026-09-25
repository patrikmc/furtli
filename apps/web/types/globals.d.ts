export {};

// Clerk types `user.publicMetadata` as `{ [k: string]: unknown }` by
// default and explicitly documents this declaration-merging pattern for
// giving it real types. See lib/admin.ts for where `role` is read.
declare global {
  interface UserPublicMetadata {
    role?: "admin";
  }
}
