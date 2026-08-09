---
title: "Making TypeScript type-checking faster with project references, isolated declarations, and TypeScript 7"
description: "A practical path to faster full-repo TypeScript checks: project references first, then isolated declarations when the measurements justify it."
publishedAt: 2026-08-09
tags: ["TypeScript", "Monorepos", "Build tooling", "CI"]
draft: false
---

Most slow TypeScript builds are doing two jobs at once.

They are producing declaration files that describe the public boundary between packages. And they are proving that the implementation behind those boundaries is type-correct. Those jobs are related, but they are not the same job.

That distinction matters in a large repository. It gives us a way to make declaration generation cheaper without pretending that type-checking is optional.

This post walks through that approach using a small [working repository](https://github.com/sudesh-poojari/typecheck-isolated-declarations): project references define the graph, `isolatedDeclarations` makes exported APIs locally describable, and TypeScript 7 provides a much faster baseline for the full semantic check.

The recommendation is deliberately measured: start with TypeScript 7 and project references. Reach for a separate declaration-emit phase only when measurements show it is worth the added build machinery.

## One workspace, two kinds of work

Imagine a workspace with two independent dependency chains:

```text
@example/foo ───▶ @example/bar
@example/baz ───▶ @example/qux
```

`bar` consumes `foo`; `qux` consumes `baz`. Nothing connects the two chains. That is useful because a compiler can work on the lower-level packages together, then work on the two consumers together.

Project references give TypeScript that information explicitly. Each package is a `composite` project, each consumer records its upstream projects in `references`, and a root solution config gathers the graph.

```jsonc
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./packages/foo" },
    { "path": "./packages/baz" },
    { "path": "./packages/bar" },
    { "path": "./packages/qux" },
  ],
}
```

`tsc -b` uses that graph to build projects in dependency order and lets a consumer see an upstream package through its emitted `.d.ts` output. That gives the package boundary a concrete artifact instead of relying on a convention in a workspace configuration. [Project References handbook](https://www.typescriptlang.org/docs/handbook/project-references)

The example repository runs this ordinary, correctness-oriented path with:

```sh
npm run typecheck
```

That remains the baseline. Project references are useful by themselves: they clarify package ownership, enable incremental work, and prevent the whole workspace from becoming one undifferentiated TypeScript program.

## Start with the TypeScript 7 baseline

Before changing the declaration pipeline, upgrade and validate TypeScript 7 against the current project and its supporting tools. Its native compiler already parallelizes parsing, type-checking, and emit, so readers do not need to opt into a separate orchestration layer simply to get a faster full-repo check. [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

Start by benchmarking the ordinary command:

```sh
tsc -b
```

TypeScript 7's default number of type-checker workers is four. Leave both `--checkers` and `--builders` unset for that first measurement; the flags are for tuning a result, not for enabling TypeScript 7's parallel work in the first place.

For a project-reference build, a measured tuning experiment might look like this:

```sh
tsc -b --builders 4 --checkers 4
```

`--builders` controls how many independent project-reference builds can run at once. `--checkers` controls semantic type-checker workers. Their costs multiply: four builders with four checkers can create up to sixteen type-checkers. That may be a fine trade on a large developer machine and a poor one on a memory-constrained CI runner.

With that baseline in place, the adoption path is straightforward:

1. Upgrade to TypeScript 7 and keep the normal `tsc -b` build passing.
2. Add or verify project references at genuine package boundaries.
3. Measure the default build, then test fixed `--builders` and `--checkers` values on actual CI hardware; record both wall-clock time and peak memory.
4. Enable `isolatedDeclarations` in one leaf package and resolve its exported-API diagnostics, as explained below.
5. Repeat through the graph, keeping full semantic type-checking required throughout.
6. Add the separate declaration-emit phase described below only if the measurements still show a meaningful dependency-ordering bottleneck.

TypeScript 7 makes full-repo checking much faster. It does not remove the dependency graph: a consumer still cannot semantically rely on an API whose upstream boundary does not exist. `isolatedDeclarations` helps precisely at that seam, because a fast declaration phase can establish those boundaries earlier.

## Why declarations can be expensive

Type inference is usually a pleasant part of TypeScript. It lets us write a function without spelling out every return type.

But declaration emit has a different perspective. If an exported function's type depends on an imported value, generating its `.d.ts` can require following imports and asking the type checker to infer information beyond the current file. A tool that wants to generate many declarations independently would need to recreate that work.

`isolatedDeclarations` changes the contract. It requires exported declarations to carry enough information that a declaration emitter can describe a file's public API without consulting the rest of the program. It does not require annotations on every local variable. It asks for clarity at the boundary. [TypeScript 5.5 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)

That requirement does not make the migration purely manual. TypeScript's language service—the layer behind editor diagnostics and Quick Fixes—also exposes code-fix APIs that a migration utility can use. A tool can collect isolated-declaration diagnostics, request the available fixes, and apply the returned file edits in a deliberate batch. It should still report any diagnostics without a fix and leave every new public annotation for review; there is no single `tsc` command that safely annotates an entire repository. [Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API) [Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)

Here is the kind of export that the option rejects:

```ts
import { message } from "./shared.js";

export function inferredFromFunction() {
  return message;
}
```

The function exposes a return type whose name comes from another file. Under `isolatedDeclarations`, TypeScript reports TS9039. The small but meaningful fix is to make the public shape explicit:

```ts
export function inferredFromFunction(): string {
  return message;
}
```

The repository keeps this as a runnable failure case:

```sh
npm run demo:isolated-declarations-error
```

The point is not that return annotations are always better style. It is that the public API now has a type that can be emitted locally. That is the trade: a little more explicitness at exports in return for more freedom in the build pipeline.

## Make the migration a series of small reviews

This should not be a flag-day rewrite or an exercise in annotating every function in the repository.

Start with a package that already has a clear API and few outgoing dependencies. Enable `declaration` or `composite`, then turn on `isolatedDeclarations`. TypeScript will report the exports that prevent isolated declaration emit. In VS Code, use the TypeScript Quick Fix for a diagnostic to add a missing annotation, then review the result as you would any public API change. The 5.5 release included that editor assistance specifically for isolated-declaration errors. [Announcing TypeScript 5.5](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/)

For a larger migration, use the same language-service code-fix surface behind that editor experience in a small, reviewable internal tool. Run it package by package, inspect its diff, and then use the normal full-repo check as the gate. Do not treat generated annotations as automatically correct just because they satisfy the diagnostic.

One current compatibility note: TypeScript 7's native compiler does not yet ship a programmatic API. For an annotation-migration utility, use TypeScript 6's compatibility package (`@typescript/typescript6`) and its language-service API; use TypeScript 7's `tsc` executable for the build and type-check path. The TypeScript team expects a new API in 7.1. [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

Work from lower-level packages toward their consumers. That order keeps the change set understandable: first name the public types an upstream package owns, then let consumers refer to those types. If two packages need each other, pause before working around the compiler. A cycle often means the shared contract belongs in a lower-level package.

The important restraint is to wait for the measurement in the final adoption step. Enabling the flag does not, by itself, make TypeScript faster. It makes a faster declaration strategy possible. [Isolated declarations: state of the feature](https://github.com/microsoft/TypeScript/issues/58944)

## Separate fast emit from semantic proof

From TypeScript 5.6 onward, `noCheck` makes the split explicit. When a project also conforms to `isolatedDeclarations`, TypeScript can generate declarations using quick syntactic transformations instead of a complete semantic type-check. [TypeScript 5.6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html)

The example repository has a types-only project config:

```jsonc
// packages/foo/tsconfig.types.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "emitDeclarationOnly": true,
    "noCheck": true,
    "declarationMap": false,
    "tsBuildInfoFile": "./dist/.types.tsbuildinfo",
  },
}
```

The pipeline then has two explicit phases:

```sh
# Produce package API boundaries quickly.
npm run generate:parallel-types

# Prove the implementation is correct, without writing output.
npm run typecheck:no-emit
```

The first phase is useful for scheduling. The second phase is the correctness gate. Neither one is a substitute for the other.

That distinction is easy to test. The repository's `demo:typecheck-ts7-error` command temporarily adds this mistake to `foo`:

```ts
const invalid: string = 123;
```

The `noCheck` declaration phase can still finish. The later semantic phase correctly rejects the program with TS2322. Run it with:

```sh
npm run demo:typecheck-ts7-error
```

It is a useful guardrail for the whole design: fast declaration output is unvalidated until the full semantic check has passed. Do not publish it, cache it as a successful result, or let it become the only CI signal.

If the fast emit and semantic check run at the same time, give them different `tsBuildInfoFile` paths. Otherwise, two processes can compete over the same incremental state. TypeScript calls this out in its `noCheck` guidance. [TypeScript 5.6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html)

## A short note on Bloomberg's contribution

This feature is also a nice open-source collaboration story. The TypeScript team describes `isolatedDeclarations` as a long-running effort with infrastructure and tooling teams at Bloomberg and Google, and specifically credits Titian Cernicova-Dragomir of Bloomberg for driving much of its implementation. Bloomberg was also among the companies that tested TypeScript 7 on real codebases before release. [Announcing TypeScript 5.5](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/) [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

The useful lesson is not that every repository should copy a large organization's build setup. It is that production-scale problems, careful language design, and open-source implementation can meet in a feature that smaller teams can use when the fit is right.

## A restrained checklist

Use this approach when the repository has real package boundaries, an acyclic dependency graph, and measured declaration-emit or build scheduling costs.

- Keep a full-repo semantic check required in CI.
- Treat `isolatedDeclarations` as a public-API discipline, not a type-safety shortcut.
- Use editor fixes to accelerate the migration, but review every newly explicit export type.
- Choose TypeScript 7's parallelism settings from measurements, not core count alone.
- Keep declaration generation and semantic checking on separate build-info files when they run concurrently.
- Prefer ordinary `tsc -b` when it is already comfortably within the team's feedback budget.

The quiet win here is not a clever way to skip checking. It is a build that understands what it is doing: generate the boundaries quickly, prove the program completely, and only add complexity once the numbers ask for it.

## Sources

- [TypeScript Handbook: Project References](https://www.typescriptlang.org/docs/handbook/project-references)
- [TypeScript 5.5 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html)
- [TypeScript 5.6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html)
- [Isolated Declarations in TS 5.5: State of the feature](https://github.com/microsoft/TypeScript/issues/58944)
- [TypeScript Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Example repository](https://github.com/sudesh-poojari/typecheck-isolated-declarations)
