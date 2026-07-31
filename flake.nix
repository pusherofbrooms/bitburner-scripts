{
  description = "Bitburner scripts tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          # Pin the Node major used by the checked-in npm lockfile; project-specific
          # typings (such as @types/node) remain reproducible npm dependencies.
          packages = [ pkgs.nodejs_24 pkgs.typescript ];
        };
      });
    };
}
