---
title: "Type-checking a large TypeScript monorepo incrementally with project references"
description: "How project references, build state, and a carefully restored baseline can make TypeScript checks practical in a large workspace."
publishedAt: 2026-07-27
tags: ["TypeScript", "Monorepos", "CI", "Build tooling"]
draft: false
---

In a small TypeScript repository, type-checking is pleasantly boring: run `tsc --noEmit`, wait a moment, move on.

That stops being true when the repository becomes a graph of packages. A change in one package can make the compiler load, bind, and check far more code than the change itself appears to touch. At that point, the problem is not that TypeScript has become unreasonable. We have simply not given it enough structure to reuse its work.

Project references were the piece that made this click for me. They let TypeScript see the workspace as a graph of smaller programs, with explicit boundaries and an order in which to check them. The interesting part came later: making that incremental graph useful in a clean CI checkout.

This is a note about that approach, its limits, and the parts I would be careful not to hand-wave away.

## The compiler needs the package graph

Consider a workspace with a few internal packages:

```text
apps/web ──────> packages/ui ──────> packages/design-tokens
       └───────> packages/auth
```

It is tempting to treat this as one enormous TypeScript program, perhaps with a generous `paths` map. That resolves imports, but it does not give the compiler a project-level dependency graph or a declaration boundary.

Project references do. Each package owns a composite TypeScript project, and a consumer lists the projects it depends on. A root *solution* config gives `tsc` one entry point.

```jsonc
// tsconfig.typecheck.json at the repository root
{
  "files": [],
  "references": [
    { "path": "./packages/design-tokens/tsconfig.typecheck.json" },
    { "path": "./packages/ui/tsconfig.typecheck.json" },
    { "path": "./packages/auth/tsconfig.typecheck.json" },
    { "path": "./apps/web/tsconfig.typecheck.json" }
  ]
}
```

The empty `files` list matters. This config is a map of the solution, not another project that should compile the same sources. TypeScript recommends this solution-config pattern for a multi-project workspace. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references.html)

Each package config describes a buildable type boundary:

```jsonc
// packages/ui/tsconfig.typecheck.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "declaration": true,
    "emitDeclarationOnly": true,
    "declarationDir": "./.typecheck/types",
    "tsBuildInfoFile": "./.typecheck/tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "../design-tokens/tsconfig.typecheck.json" }]
}
```

With this in place, the command is deliberately different from a one-project check:

```sh
tsc -b tsconfig.typecheck.json
```

`-b` (or `--build`) makes `tsc` act as a build orchestrator. It finds referenced projects, determines which are out of date, and processes them in dependency order. A referenced project is consumed through its emitted declarations, not by quietly folding all of its source into the consumer. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references.html)

That last detail is easy to miss. This is not a pure `--noEmit` setup: the declaration artifacts are part of the contract between projects. If a bundler owns JavaScript output, `emitDeclarationOnly` keeps the TypeScript work focused on `.d.ts` files. [TypeScript declaration option](https://www.typescriptlang.org/tsconfig/declaration.html)

## References should follow imports, not memory

Adding those references by hand works for a while. Eventually, an import changes and somebody forgets the matching config change. The result is usually a confusing local success followed by a CI failure.

The answer is a small synchronizer, not a convention written on a wiki page. Its job is modest:

1. Discover workspace packages and their type-check configs.
2. Resolve static imports, type-only imports, and re-exports from each package.
3. Keep only imports that resolve to another workspace package; ignore relative and third-party imports.
4. Write a stable, sorted `references` list to the consuming config.
5. In CI, run in check mode and fail when generated references are out of sync.

```text
for each workspace project:
  internalDependencies = resolveStaticModuleSpecifiers(project)
    .filter(isWorkspaceProject)
  writeSortedReferences(project.typecheckConfig, internalDependencies)

failIfAnyConfigChangedInCheckMode()
```

The implementation should use the workspace's actual module-resolution rules. Import strings alone are not enough when aliases, package `exports`, or package-manager workspaces are involved. References describe the compiler graph; package resolution still has to locate `@workspace/ui` in the first place.

I would also make cycles a hard error. A project-reference graph should be a directed acyclic graph. If `ui` and `auth` need each other, that is usually a signal to extract the shared types or behaviour into a lower-level package. It is a useful architectural constraint, not merely a compiler limitation.

## What TypeScript remembers

Composite projects persist incremental state in a `.tsbuildinfo` file. TypeScript uses that state to determine the smallest set of files that might need re-checking or re-emitting; `composite` enables this incremental behaviour by default. [TypeScript performance guidance](https://github.com/microsoft/TypeScript/wiki/Performance#incremental-project-emit)

The benefit is subtler than “only compile the changed package.” An implementation-only change may rebuild its own package without changing its public declaration shape. In that case, consumers can remain up to date. A declaration-affecting change travels to dependents, as it should.

There are two levels of incrementality here. First, build mode uses the project inputs and outputs' freshness to decide whether a project needs attention at all. Only once a project is considered changed does its `.tsbuildinfo` state let TypeScript compare file versions and declaration signatures to narrow the work and decide whether downstream projects are affected. Timestamps open the door; build information decides what happens behind it. That distinction matters for CI.

## Making incremental state useful in clean CI

A fresh checkout has a slightly awkward property: every source file often has a new modification time. Even if the content is almost identical to a previous successful build, a timestamp-based up-to-date gate has no reason to trust the old artifacts.

Our approach was to restore a baseline type-check cache, then reconstruct the *meaningful* change signal before asking `tsc -b` to do its work.

```text
1. Choose a successful baseline revision and restore its declarations and .tsbuildinfo files.
2. Set restored build artifacts and checked-out source files to one old timestamp.
3. Diff the baseline revision against the revision being checked.
4. Set changed and newly added inputs to the current timestamp.
5. Run tsc -b against the solution config.
```

The old timestamp is not magic; it simply needs to predate the timestamp assigned to the changed inputs in step four. In other words, the timestamp reset is not a cache key and it is not evidence that the code is unchanged. It prevents a clean checkout from looking like a rewrite. The commit diff supplies the newness signal; TypeScript's stored build state validates the changed inputs and follows the affected project graph.

This is why I would not present “touch files until `tsc` is fast” as a general technique. The cache must be a coherent snapshot from the baseline revision. It must include the `.tsbuildinfo` files and the declaration outputs that referenced projects consume. It must also be invalidated when the TypeScript version, compiler options, output layout, or relevant resolution inputs change.

The diff must be wider than `src/**/*.ts`, too. It needs to account for additions, edits, deletions, and renames, along with tsconfig files, package manifests, lockfiles, generated inputs, and anything else that can change module resolution or the program's file set. When that cannot be established confidently, the safe response is a normal build—or `tsc -b --force`—not a cleverer timestamp rule.

## Constraints worth accepting early

Project references make the boundaries visible. That brings a few constraints with them:

- Each referenced project needs `composite: true`. This requires declaration output and requires every implementation file to be covered by `files` or `include`.
- Output directories and `.tsbuildinfo` paths must not overlap between projects.
- Consumers should use a package's declared API, not deep-import its source files across a project boundary.
- The package graph must have no dependency cycles.
- A clone, editor, or CI job needs declaration artifacts available before it can reliably consume referenced projects. The handbook calls this out as a project-reference caveat. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references.html)
- Build outputs checked into source control can retain surprising timestamps after source-control operations; TypeScript documents `--force` as the escape hatch in that situation. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references.html)

None of these are reasons to avoid references. They are reasons to introduce them at a package boundary that already has a clear purpose, rather than producing dozens of tiny projects because smaller sounds faster. TypeScript's performance guidance suggests grouping code that changes together and avoiding one giant project with many tiny satellites. [TypeScript performance guidance](https://github.com/microsoft/TypeScript/wiki/Performance#using-project-references)

## The IDE is part of the design

The build may be fast while an editor still consumes too much memory. Project references give the language service more structure, but they are not a licence to disable every expensive feature up front.

I would begin with the normal editor experience, measure it, and use the following switches only for the problem they actually solve:

| Setting | Use it when | Trade-off |
| --- | --- | --- |
| `declarationMap` | Cross-package Go to Definition and Rename should reach the source naturally. | Produces additional declaration-map artifacts. |
| `disableReferencedProjectLoad` | The editor eagerly loads too much of a very large solution. | Referenced projects load dynamically as files are opened, which can make workspace-wide answers less immediately complete. [Docs](https://www.typescriptlang.org/tsconfig/disableReferencedProjectLoad.html) |
| `disableSolutionSearching` | A project should not participate in solution-wide editor navigation. | Find All References and Go to Definition will not automatically include that project. [Docs](https://www.typescriptlang.org/tsconfig/disableSolutionSearching.html) |
| `disableSourceOfProjectReferenceRedirect` | VS Code's in-memory declaration generation is a measurable cost in a very large composite workspace. | The editor relies on generated `.d.ts` output, so a clone or cache restore needs to supply it. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references.html) |
| Precise `include`/`exclude` and `types` | File discovery or automatic ambient type loading inflates latency and memory. | Over-restricting can hide source files or global types the project genuinely needs. [TypeScript performance guidance](https://github.com/microsoft/TypeScript/wiki/Performance#specifying-files) |
| `skipLibCheck` | Measurement shows library declaration checking is material and the team accepts the blind spot. | It can hide conflicts in declaration files. [TypeScript performance guidance](https://github.com/microsoft/TypeScript/wiki/Performance#skipping-dts-checking) |

The useful default is not a copied “large monorepo config”. It is a trace, a diagnosis, and a small change. In particular, disabling source redirects is much easier to live with when CI or a local bootstrap step already restores the declarations that the editor will consume.

## Build it only when the scale asks for it

There is a point where this is all too much machinery. If one normal type-check is comfortably inside the team's feedback budget, a cache store, a reference synchronizer, and timestamp normalization are more things to maintain than things to celebrate.

For a larger workspace, existing tooling is worth evaluating before building the whole layer yourself. For example, Nx can synchronize TypeScript project references from its project graph and its batch TypeScript mode composes cached `.tsbuildinfo` artifacts with incremental compilation. [Nx TypeScript documentation](https://nx.dev/docs/technologies/typescript/introduction) [Nx TSC batch mode](https://nx.dev/docs/kb/tsc-batch-mode) I did not use Nx for the workflow described here; it is simply a useful example of the tooling that is now available.

## A short note on the next performance layer

Two related improvements deserve their own write-up rather than being folded into this cache design.

`isolatedDeclarations` requires enough annotation on exported declarations for declaration files to be generated without needing the rest of the program's type information. That restriction is not free—some exports need more explicit types—but it opens the door to simpler, potentially parallel declaration generation. [isolatedDeclarations](https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html)

TypeScript 7 is another promising layer. It now ships through the standard `typescript` package and `tsc` executable, with project references, incremental builds, native-code execution, and parallel build work. I would still adopt it deliberately: validate the upgrade against the workspace's current compiler and supporting tools before making it the required CI gate. [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

Neither removes the need for a correct project graph or conservative cache invalidation. They are ways to make that foundation faster. I plan to cover the adoption trade-offs separately.

The main lesson is smaller than it first appears: let TypeScript own the type-check dependency graph, preserve the build state it understands, and make any cache layer conservative about correctness. Once those pieces agree, an incremental type-check can feel pleasantly boring again.

## Sources

- [TypeScript Handbook: Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript Wiki: Performance](https://github.com/microsoft/TypeScript/wiki/Performance)
- [TypeScript TSConfig: disableReferencedProjectLoad](https://www.typescriptlang.org/tsconfig/disableReferencedProjectLoad.html)
- [TypeScript TSConfig: disableSolutionSearching](https://www.typescriptlang.org/tsconfig/disableSolutionSearching.html)
- [TypeScript TSConfig: isolatedDeclarations](https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Nx: TypeScript](https://nx.dev/docs/technologies/typescript/introduction)
- [Nx: TSC Batch Mode](https://nx.dev/docs/kb/tsc-batch-mode)
